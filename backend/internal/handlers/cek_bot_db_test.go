package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/go-chi/chi/v5"

	"ordermgmt/internal/auth"
	appmw "ordermgmt/internal/middleware"
	"ordermgmt/internal/telegram"
)

// Runs only with TEST_DATABASE_URL (see liveTestDB): CEK VIEWS has a Telegram bot of its own, and the requisition default cost.
func TestCekViewsOwnBotAndRequisitionCost(t *testing.T) {
	db := liveTestDB(t)
	ctx := context.Background()

	// a fake Telegram: records which bot token each call used
	var mu sync.Mutex
	var paths, bodies []string
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		mu.Lock()
		paths, bodies = append(paths, r.URL.Path), append(bodies, string(b))
		mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"ok":true,"result":{"username":"cek_bot","first_name":"Cek"}}`))
	}))
	defer fake.Close()
	oldBase := telegram.APIBase
	telegram.APIBase = fake.URL
	t.Cleanup(func() { telegram.APIBase = oldBase })

	store := &telegram.Store{DB: db, Secret: "test"}
	cv := &CekViewsHandler{DB: db, Store: store, Voice: &telegram.VoiceReminder{DB: db, Store: store}}
	r := chi.NewRouter()
	r.Get("/cek-views/telegram", cv.GetTelegram)
	r.Put("/cek-views/telegram", cv.SaveTelegram)
	r.Post("/cek-views/telegram/status", cv.TelegramStatus)
	r.Post("/cek-views/telegram/test", cv.TelegramTest)
	do := func(method, path string, body any) (*httptest.ResponseRecorder, map[string]any) {
		raw, _ := json.Marshal(body)
		req := httptest.NewRequest(method, path, bytes.NewReader(raw))
		req = req.WithContext(context.WithValue(req.Context(), appmw.ClaimsKey, &auth.Claims{UserID: 1, Role: "super_user"}))
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		var out map[string]any
		_ = json.Unmarshal(rec.Body.Bytes(), &out)
		return rec, out
	}
	t.Cleanup(func() {
		db.Exec(ctx, `DELETE FROM store_settings WHERE key IN ('cek_views_bot_token','cek_views_telegram','telegram_bot_token')`)
	})
	db.Exec(ctx, `DELETE FROM store_settings WHERE key IN ('cek_views_bot_token','cek_views_telegram','telegram_bot_token')`)

	// the MAIN bot has a token, the CEK VIEWS bot does not: CEK VIEWS must not borrow the main bot
	if err := store.SaveToken(ctx, "111111:MAINBOT"); err != nil {
		t.Fatal(err)
	}
	if _, v := do("GET", "/cek-views/telegram", nil); v["bot_token_set"] != false {
		t.Fatalf("CEK VIEWS must not see the main bot's token: %v", v)
	}
	if rec, _ := do("POST", "/cek-views/telegram/test", nil); rec.Code != http.StatusBadRequest {
		t.Fatalf("test message without a CEK VIEWS token: %d", rec.Code)
	}
	if ok, why := cv.sendReport(ctx, "x"); ok || !strings.Contains(why, "CEK VIEWS bot token") {
		t.Fatalf("report without a CEK VIEWS token: %v %q", ok, why)
	}

	// save its own token + group; the token is never returned, only its last 4 characters
	rec, v := do("PUT", "/cek-views/telegram", map[string]any{"bot_token": "222222:CEKBOT-wxyz", "chat_id": " -100999 ", "thread_id": 2, "send_enabled": true})
	if rec.Code != http.StatusOK || v["token_hint"] != "wxyz" || v["chat_id"] != "-100999" || v["thread_id"] != float64(2) {
		t.Fatalf("save: %d %s", rec.Code, rec.Body)
	}
	if strings.Contains(rec.Body.String(), "222222") {
		t.Fatal("the token must never be sent back")
	}
	if rec, _ = do("PUT", "/cek-views/telegram", map[string]any{"bot_token": "no-colon", "chat_id": "-1"}); rec.Code != http.StatusBadRequest {
		t.Fatalf("an invalid token: %d", rec.Code)
	}
	// saving again without a token keeps the saved one
	if _, v = do("PUT", "/cek-views/telegram", map[string]any{"chat_id": "-100999", "thread_id": 2, "send_enabled": true}); v["token_hint"] != "wxyz" {
		t.Fatalf("an empty token must keep the saved one: %v", v)
	}

	// messages go out with the CEK VIEWS bot, into the topic
	if rec, _ = do("POST", "/cek-views/telegram/test", nil); rec.Code != http.StatusOK {
		t.Fatalf("test message: %d %s", rec.Code, rec.Body)
	}
	if ok, why := cv.sendReport(ctx, "report"); !ok {
		t.Fatalf("report: %q", why)
	}
	if _, st := do("POST", "/cek-views/telegram/status", map[string]any{}); st["connected"] != true || st["bot_username"] != "cek_bot" {
		t.Fatalf("status: %v", st)
	}
	mu.Lock()
	for i, p := range paths {
		if !strings.Contains(p, "222222:CEKBOT-wxyz") || strings.Contains(p, "MAINBOT") {
			t.Fatalf("call %d used the wrong bot: %s", i, p)
		}
	}
	if len(bodies) < 2 || !strings.Contains(bodies[1], `"message_thread_id":2`) {
		t.Fatalf("the report must go into the topic: %v", bodies)
	}
	mu.Unlock()

	// switched off = nothing is sent
	do("PUT", "/cek-views/telegram", map[string]any{"chat_id": "-100999", "send_enabled": false})
	before := len(paths)
	if ok, why := cv.sendReport(ctx, "x"); ok || !strings.Contains(why, "switched off") || len(paths) != before {
		t.Fatalf("sending switched off: %v %q", ok, why)
	}
	// removing the token
	if _, v = do("PUT", "/cek-views/telegram", map[string]any{"clear_token": true, "chat_id": "-100999", "send_enabled": true}); v["bot_token_set"] != false {
		t.Fatalf("clear token: %v", v)
	}

	// Purchase Requisition unit cost = Product Cost (RMB), not Base Price
	var product, variant, cost float64
	var pid, vid int
	db.QueryRow(ctx, `INSERT INTO products (name, base_price, cost_rmb) VALUES ('T-Req product', 81, 17) RETURNING id`).Scan(&pid)
	t.Cleanup(func() { db.Exec(ctx, `DELETE FROM products WHERE id=$1`, pid) })
	db.QueryRow(ctx, `INSERT INTO product_variants (product_id, sku, price) VALUES ($1,$2,81) RETURNING id`, pid, "T-REQ-"+itoa(pid)).Scan(&vid)
	_, _ = product, variant
	if err := db.QueryRow(ctx, requisitionDefaultCostSQL, vid).Scan(&cost); err != nil || cost != 17 {
		t.Fatalf("default unit cost = %v (%v), want the Product Cost 17, not the Base Price 81", cost, err)
	}
	db.Exec(ctx, `UPDATE products SET cost_rmb = 0 WHERE id=$1`, pid)
	if err := db.QueryRow(ctx, requisitionDefaultCostSQL, vid).Scan(&cost); err != nil || cost != 0 {
		t.Fatalf("no Product Cost = 0, got %v", cost)
	}
}
