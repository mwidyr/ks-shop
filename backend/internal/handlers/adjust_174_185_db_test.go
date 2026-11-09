package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"ordermgmt/internal/auth"
	appmw "ordermgmt/internal/middleware"
)

// Runs only with TEST_DATABASE_URL (see liveTestDB): adjustments 174-185 against real SQL.
func TestAdjustments174To185AgainstDatabase(t *testing.T) {
	db := liveTestDB(t)
	ctx := context.Background()
	emp := &EmployeeHandler{DB: db}
	tk := &TikTokHandler{DB: db}
	hl := &HostLocationHandler{DB: db}
	ha := &HostAnalyticsHandler{DB: db}
	oh := &OrderHandler{DB: db}
	r := chi.NewRouter()
	r.Get("/employee/meta", emp.Meta)
	r.Post("/employee/employees", emp.Create)
	r.Get("/employee/employees/{id}", emp.Detail)
	r.Post("/employee/positions", emp.CreatePosition)
	r.Put("/employee/positions/{id}", emp.RenamePosition)
	r.Delete("/employee/positions/{id}", emp.DeletePosition)
	r.Post("/employee/attendance-statuses", emp.CreateStatus)
	r.Put("/employee/attendance-statuses/{id}", emp.UpdateStatus)
	r.Delete("/employee/attendance-statuses/{id}", emp.DeleteStatus)
	r.Get("/employee/schedule", emp.Schedule)
	r.Put("/employee/schedule", emp.SaveSchedule)
	r.Get("/payroll", emp.Payroll)
	r.Post("/tiktok/accounts", tk.Create)
	r.Post("/tiktok/accounts/{id}/notes", tk.AddNote)
	r.Delete("/tiktok/accounts/{id}/notes/{noteId}", tk.DeleteNote)
	r.Get("/host-locations", hl.List)
	r.Post("/host-locations", hl.Create)
	r.Put("/host-locations/order", hl.Reorder)
	r.Get("/host-analytics/historical-best", ha.HistoricalBest)
	r.Get("/orders", oh.List)

	do := func(method, path string, body any) (*httptest.ResponseRecorder, map[string]any) {
		raw, _ := json.Marshal(body)
		req := httptest.NewRequest(method, path, bytes.NewReader(raw))
		req = req.WithContext(context.WithValue(req.Context(), appmw.ClaimsKey, &auth.Claims{UserID: 1, Name: "Tester", Role: "super_user"}))
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		var out map[string]any
		_ = json.Unmarshal(rec.Body.Bytes(), &out)
		return rec, out
	}
	tag := itoa(int(db.Stat().TotalConns())) + strings.ReplaceAll(t.Name(), "/", "")

	// 174 + 175: positions can be renamed, not deleted while assigned; MBTI is free text
	rec, out := do("POST", "/employee/positions", map[string]any{"name": "T-Pos-" + tag})
	if rec.Code != http.StatusCreated {
		t.Fatalf("position: %d %s", rec.Code, rec.Body)
	}
	pos := int(out["id"].(float64))
	t.Cleanup(func() {
		db.Exec(ctx, `DELETE FROM employees WHERE full_name='T-Adj-Emp'`)
		db.Exec(ctx, `DELETE FROM employee_positions WHERE id=$1`, pos)
	})
	if rec, _ = do("PUT", "/employee/positions/"+itoa(pos), map[string]any{"name": "T-Pos2-" + tag}); rec.Code != http.StatusOK {
		t.Fatalf("rename: %d %s", rec.Code, rec.Body)
	}
	var loc int
	db.QueryRow(ctx, `SELECT id FROM employee_locations WHERE is_default`).Scan(&loc)
	rec, out = do("POST", "/employee/employees", map[string]any{"full_name": "T-Adj-Emp", "nickname": "Adj", "position_id": pos, "location_id": loc, "mbti": "entj-a"})
	if rec.Code != http.StatusCreated {
		t.Fatalf("employee with a free-text MBTI: %d %s", rec.Code, rec.Body)
	}
	empID := int(out["id"].(float64))
	if _, d := do("GET", "/employee/employees/"+itoa(empID), nil); d["mbti"] != "ENTJ-A" {
		t.Fatalf("MBTI should be kept as typed (upper-cased): %v", d["mbti"])
	}
	if rec, _ = do("DELETE", "/employee/positions/"+itoa(pos), nil); rec.Code != http.StatusConflict {
		t.Fatalf("a position with employees must not be deleted: %d", rec.Code)
	}

	// 177: statuses are fully manageable, one-letter codes, "counts as" replaces the fixed codes
	if rec, _ = do("POST", "/employee/attendance-statuses", map[string]any{"code": "OFF", "name": "x", "bg_color": "gray", "text_color": "black"}); rec.Code != http.StatusBadRequest {
		t.Fatalf("a multi-letter code must be refused: %d", rec.Code)
	}
	rec, out = do("POST", "/employee/attendance-statuses", map[string]any{"code": "z", "name": "Zed", "is_paid": false, "bg_color": "purple", "text_color": "purple", "kind": "leave"})
	if rec.Code != http.StatusCreated {
		t.Fatalf("new status: %d %s", rec.Code, rec.Body)
	}
	zed := int(out["id"].(float64))
	t.Cleanup(func() { db.Exec(ctx, `DELETE FROM attendance_statuses WHERE code='Z'`) })
	do("PUT", "/employee/schedule", map[string]any{"changes": []map[string]any{{"employee_id": empID, "dates": []string{"2026-11-20", "2026-11-21"}, "status_id": zed}}})
	var n int
	db.QueryRow(ctx, `SELECT count(*) FROM attendance_records WHERE status_id=$1`, zed).Scan(&n)
	if n != 2 {
		t.Fatalf("records = %d", n)
	}
	if rec, _ = do("PUT", "/employee/attendance-statuses/"+itoa(zed), map[string]any{"code": "Y", "name": "Zed", "bg_color": "purple", "text_color": "purple", "kind": "leave", "is_active": true}); rec.Code != http.StatusOK {
		t.Fatalf("a status code can be changed: %d %s", rec.Code, rec.Body)
	}
	// the default status cannot be deactivated; deleting a status takes its records along
	var def int
	db.QueryRow(ctx, `SELECT id FROM attendance_statuses WHERE is_default`).Scan(&def)
	if rec, _ = do("PUT", "/employee/attendance-statuses/"+itoa(def), map[string]any{"name": "Working", "bg_color": "green", "text_color": "green", "kind": "work", "is_active": false}); rec.Code != http.StatusBadRequest {
		t.Fatalf("deactivating the default must be refused: %d", rec.Code)
	}
	rec, out = do("DELETE", "/employee/attendance-statuses/"+itoa(zed), nil)
	if rec.Code != http.StatusOK || out["deleted_records"] != float64(2) {
		t.Fatalf("delete status: %d %s", rec.Code, rec.Body)
	}
	db.QueryRow(ctx, `SELECT count(*) FROM attendance_records WHERE employee_id=$1`, empID).Scan(&n)
	if n != 0 {
		t.Fatalf("records of a deleted status must go: %d", n)
	}

	// 178: notes can be deleted
	rec, out = do("POST", "/tiktok/accounts", map[string]any{"tiktok_id": "t_adj_" + tag})
	if rec.Code != http.StatusCreated {
		t.Fatalf("account: %d %s", rec.Code, rec.Body)
	}
	acc := int(out["id"].(float64))
	t.Cleanup(func() { db.Exec(ctx, `DELETE FROM tiktok_accounts WHERE id=$1`, acc) })
	_, note := do("POST", "/tiktok/accounts/"+itoa(acc)+"/notes", map[string]any{"body": "to delete"})
	if rec, _ = do("DELETE", "/tiktok/accounts/"+itoa(acc)+"/notes/"+itoa(int(note["id"].(float64))), nil); rec.Code != http.StatusOK {
		t.Fatalf("delete note: %d %s", rec.Code, rec.Body)
	}
	db.QueryRow(ctx, `SELECT count(*) FROM tiktok_account_notes WHERE account_id=$1`, acc).Scan(&n)
	if n != 0 {
		t.Fatal("the note must be gone")
	}

	// 185: Location Tags follow the manual order
	var a, b int
	rec, out = do("POST", "/host-locations", map[string]any{"name": "ZZ-First-" + tag})
	a = int(out["id"].(float64))
	_, out = do("POST", "/host-locations", map[string]any{"name": "AA-Second-" + tag})
	b = int(out["id"].(float64))
	t.Cleanup(func() { db.Exec(ctx, `DELETE FROM host_locations WHERE id IN ($1,$2)`, a, b) })
	order := func() []int {
		rec, _ := do("GET", "/host-locations", nil)
		var list []struct {
			ID int `json:"id"`
		}
		_ = json.Unmarshal(rec.Body.Bytes(), &list)
		ids := []int{}
		for _, l := range list {
			if l.ID == a || l.ID == b {
				ids = append(ids, l.ID)
			}
		}
		return ids
	}
	if got := order(); len(got) != 2 || got[0] != a {
		t.Fatalf("a new tag goes to the end, not alphabetically: %v", got) // ZZ was added first
	}
	var all []int
	rows, _ := db.Query(ctx, `SELECT id FROM host_locations ORDER BY sort_order, name`)
	for rows.Next() {
		var id int
		rows.Scan(&id)
		all = append(all, id)
	}
	rows.Close()
	swapped := []int{}
	for _, id := range all {
		if id == a || id == b {
			continue
		}
		swapped = append(swapped, id)
	}
	swapped = append([]int{b, a}, swapped...)
	if rec, _ = do("PUT", "/host-locations/order", map[string]any{"ids": swapped}); rec.Code != http.StatusOK {
		t.Fatalf("reorder: %d %s", rec.Code, rec.Body)
	}
	if got := order(); got[0] != b {
		t.Fatalf("the saved order must be used: %v", got)
	}

	// 183: Historical Best is a DAILY record without session information, with AOV instead of AWT
	rec, out = do("GET", "/host-analytics/historical-best", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("historical best: %d %s", rec.Code, rec.Body)
	}
	if _, has := out["highest_aov"]; !has {
		t.Fatalf("Highest AOV missing: %v", out)
	}
	if _, has := out["highest_awt"]; has {
		t.Fatal("AWT must be gone")
	}
	if m, _ := out["highest_qty"].(map[string]any); m != nil {
		if _, has := m["shift"]; has {
			t.Fatal("no session / shift information")
		}
	}

	// 184: a search ignores the date filter (an order from long ago is found), and without a search the dates apply
	var cust, chain int
	db.QueryRow(ctx, `INSERT INTO customers (name, phone) VALUES ('T Adj Cust','0800000099') RETURNING id`).Scan(&cust)
	db.QueryRow(ctx, `SELECT id FROM pickup_chains LIMIT 1`).Scan(&chain)
	no := "T-OLD-" + itoa(int(db.Stat().AcquireCount()))
	db.Exec(ctx, `INSERT INTO orders (order_no, customer_id, pickup_chain_id, status, shipping_address, sales_channel, shipping_fee, created_at) VALUES ($1,$2,$3,'pending','x','normal',0,'2025-01-02 10:00:00+07')`, no, cust, chain)
	t.Cleanup(func() {
		db.Exec(ctx, `DELETE FROM orders WHERE order_no=$1`, no)
		db.Exec(ctx, `DELETE FROM customers WHERE id=$1`, cust)
	})
	found := func(path string) bool {
		rec, out := do("GET", path, nil)
		if rec.Code != http.StatusOK {
			t.Fatalf("%s: %d %s", path, rec.Code, rec.Body)
		}
		items, _ := out["items"].([]any)
		for _, it := range items {
			if m, _ := it.(map[string]any); m != nil && m["order_no"] == no {
				return true
			}
		}
		return false
	}
	if !found("/orders?date_from=2026-11-01&date_to=2026-11-30&q=" + no) {
		t.Fatal("a search must find the old order despite the date filter")
	}
	if found("/orders?date_from=2026-11-01&date_to=2026-11-30&page_size=100") {
		t.Fatal("without a search the date filter applies")
	}
}
