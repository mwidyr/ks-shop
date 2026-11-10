package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"ordermgmt/internal/auth"
	appmw "ordermgmt/internal/middleware"
)

// The client's case: one customer (same name + phone, even saved on separate customer rows), three orders on
// different dates, one with a different shipping address. Detection works on name + phone and the delivery, never on
// dates; a different delivery shows up as a related-orders notice and blocks merging until it is corrected.
func TestMergeDetectionByCustomerAndDelivery(t *testing.T) {
	db := liveTestDB(t)
	ctx := context.Background()
	tag := strconv.FormatInt(time.Now().UnixNano(), 10)
	phone := "0900" + tag[len(tag)-6:]
	var user, chain int
	db.QueryRow(ctx, `INSERT INTO users (name, email, role_id, is_active) VALUES ('md',$1,(SELECT id FROM roles WHERE name='cs'),true) RETURNING id`, "md"+tag+"@t.local").Scan(&user)
	db.QueryRow(ctx, `SELECT id FROM pickup_chains WHERE chain_type='courier' ORDER BY id LIMIT 1`).Scan(&chain)
	var custs, ids []int
	addrs := []string{"Jl Lama 1", "Jl Baru 9", "Jl Baru  9 "} // 2 and 3 are the same address (spacing differs)
	for i, addr := range addrs {
		var c, id int
		db.QueryRow(ctx, `INSERT INTO customers (name, phone) VALUES ('Rina Detect',$1) RETURNING id`, phone).Scan(&c)
		custs = append(custs, c)
		// order 1 still carries the store of an earlier 7-11 choice
		if err := db.QueryRow(ctx, `INSERT INTO orders (order_no, customer_id, pickup_chain_id, status, shipping_address, pickup_store_code, sales_channel, shipping_fee, created_at)
			VALUES ($1,$2,$3,'pending',$4,$5,'normal',60, now() - ($6 || ' days')::interval) RETURNING id`,
			fmt.Sprintf("MD-%s-%d", tag, i), c, chain, addr, map[bool]string{true: "123456", false: ""}[i == 0], strconv.Itoa(10-i*3)).Scan(&id); err != nil {
			t.Fatal(err)
		}
		ids = append(ids, id)
	}
	t.Cleanup(func() {
		db.Exec(ctx, `DELETE FROM order_shipment_groups WHERE shipping_fee_order_id = ANY($1)`, ids)
		db.Exec(ctx, `DELETE FROM order_status_log WHERE order_id = ANY($1)`, ids)
		db.Exec(ctx, `DELETE FROM orders WHERE id = ANY($1)`, ids)
		db.Exec(ctx, `DELETE FROM customers WHERE id = ANY($1)`, custs)
		db.Exec(ctx, `DELETE FROM users WHERE id=$1`, user)
	})
	h := &OrderMergeHandler{DB: db}
	rt := chi.NewRouter()
	rt.Get("/sug", h.Suggestions)
	rt.Get("/related", h.Related)
	rt.Post("/merge", h.CreateGroup)
	call := func(role, method, path string, body any) (int, []byte) {
		b, _ := json.Marshal(body)
		req := httptest.NewRequest(method, path, bytes.NewReader(b))
		req = req.WithContext(context.WithValue(req.Context(), appmw.ClaimsKey, &auth.Claims{UserID: user, Role: role}))
		w := httptest.NewRecorder()
		rt.ServeHTTP(w, req)
		return w.Code, w.Body.Bytes()
	}
	suggested := func() []int {
		c, b := call("super_user", "GET", "/sug", nil)
		if c != 200 {
			t.Fatalf("sug %d %s", c, b)
		}
		var list []mergeSuggestion
		json.Unmarshal(b, &list)
		for _, s := range list {
			if strings.Contains(s.Key, phone) {
				return s.OrderIDs
			}
		}
		return nil
	}

	// orders 2 + 3 match (same person on two customer rows, same address); order 1 differs
	if got := suggested(); len(got) != 2 || got[0] != ids[1] || got[1] != ids[2] {
		t.Fatalf("orders 2 and 3 should be suggested, got %v", got)
	}
	_, b := call("super_user", "GET", "/related", nil)
	var rel []relatedOrders
	json.Unmarshal(b, &rel)
	found := false
	for _, r := range rel {
		if r.CustomerPhone == phone && len(r.Orders) == 3 {
			found = true
		}
	}
	if !found {
		t.Fatalf("the customer's 3 orders should be listed as related: %s", b)
	}
	// manual merge of all three is blocked while the delivery differs, with a clear message
	if c, b := call("super_user", "POST", "/merge", map[string]any{"order_ids": ids}); c != http.StatusBadRequest || !strings.Contains(string(b), "data pengiriman berbeda") {
		t.Fatalf("differing delivery must block the merge: %d %s", c, b)
	}
	// once order 1 has the same address the suggestion covers all three
	db.Exec(ctx, `UPDATE orders SET shipping_address='Jl Baru 9', pickup_store_code=NULL WHERE id=$1`, ids[0])
	if got := suggested(); len(got) != 3 {
		t.Fatalf("after correcting the address all three should be suggested, got %v", got)
	}
	// status rules: ready to ship can't merge, processing only for authorised roles
	db.Exec(ctx, `UPDATE orders SET status='ready_to_ship' WHERE id=$1`, ids[2])
	if c, b := call("super_user", "POST", "/merge", map[string]any{"order_ids": ids}); c != http.StatusBadRequest {
		t.Fatalf("ready_to_ship must not merge: %d %s", c, b)
	}
	db.Exec(ctx, `UPDATE orders SET status='processing' WHERE id=$1`, ids[2])
	if c, b := call("cs", "POST", "/merge", map[string]any{"order_ids": ids}); c != http.StatusForbidden {
		t.Fatalf("regular staff must not merge Processing orders: %d %s", c, b)
	}
	db.Exec(ctx, `UPDATE orders SET status='pending' WHERE id=$1`, ids[2])
	if c, b := call("cs", "POST", "/merge", map[string]any{"order_ids": ids}); c != http.StatusCreated {
		t.Fatalf("merge of three New orders: %d %s", c, b)
	}
}
