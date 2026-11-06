package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"

	"ordermgmt/internal/auth"
	appmw "ordermgmt/internal/middleware"
)

// Runs only with TEST_DATABASE_URL (see liveTestDB): the Employee list, schedule and payroll against real SQL.
func TestEmployeePayrollAgainstDatabase(t *testing.T) {
	db := liveTestDB(t)
	ctx := context.Background()
	h := &EmployeeHandler{DB: db}
	r := chi.NewRouter()
	r.Get("/employee/employees", h.List)
	r.Get("/employee/employees/{id}", h.Detail)
	r.Post("/employee/employees", h.Create)
	r.Post("/employee/employees/import", h.Import)
	r.Get("/employee/schedule", h.Schedule)
	r.Put("/employee/schedule", h.SaveSchedule)
	r.Get("/payroll", h.Payroll)
	r.Put("/payroll/extra", h.SaveExtra)
	r.Put("/payroll/paid", h.SetPaid)
	r.Put("/payroll/transfer-fee", h.SaveTransferFee)
	r.Put("/payroll/settings/salary", h.SaveSalary)
	r.Put("/payroll/settings/bonus", h.SaveBonusSettings)
	r.Get("/bonus-ranking", h.BonusRanking)

	call := func(role, method, path string, body any) (*httptest.ResponseRecorder, map[string]any) {
		raw, _ := json.Marshal(body)
		req := httptest.NewRequest(method, path, bytes.NewReader(raw))
		req = req.WithContext(context.WithValue(req.Context(), appmw.ClaimsKey, &auth.Claims{UserID: 1, Name: "Tester", Role: role}))
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		var out map[string]any
		_ = json.Unmarshal(rec.Body.Bytes(), &out)
		return rec, out
	}
	var loc, pos int
	db.QueryRow(ctx, `SELECT id FROM employee_locations WHERE is_default`).Scan(&loc)
	db.QueryRow(ctx, `SELECT id FROM employee_positions WHERE name='Host'`).Scan(&pos)

	// a host with sales in November 2026: 40 items on 5 Nov (daily bonus), GMV 300,000 TWD
	var hostLoc, host, cust, order int
	db.QueryRow(ctx, `INSERT INTO host_locations (name) VALUES ('T-Emp-'||extract(epoch from now())::text) RETURNING id`).Scan(&hostLoc)
	db.QueryRow(ctx, `INSERT INTO hosts (name, platform, location_id) VALUES ('T-Emp-Host','tiktok',$1) RETURNING id`, hostLoc).Scan(&host)
	t.Cleanup(func() { db.Exec(ctx, `DELETE FROM hosts WHERE id=$1`, host) })

	rec, out := call("super_user", "POST", "/employee/employees", map[string]any{
		"full_name": "Test Host Emp", "nickname": "Tester", "position_id": pos, "location_id": loc, "host_id": host, "status": "full_time",
		"nik": "0012345678901234", "bank_account": "000123", "join_date": "2026-01-01",
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("create: %d %s", rec.Code, rec.Body)
	}
	empID := int(out["id"].(float64))
	t.Cleanup(func() { db.Exec(ctx, `DELETE FROM employees WHERE id=$1`, empID) })
	if out["emp_code"] == "" {
		t.Fatal("employee id was not generated")
	}
	// sensitive fields: kept as text with leading zeros, hidden from a role that may not see them
	_, d := call("super_user", "GET", "/employee/employees/"+itoa(empID), nil)
	if d["nik"] != "0012345678901234" || d["bank_account"] != "000123" {
		t.Fatalf("sensitive fields lost: %v", d)
	}
	_, d = call("sales", "GET", "/employee/employees/"+itoa(empID), nil)
	if d["nik"] != "" || d["bank_account"] != "" {
		t.Fatalf("sensitive fields must be hidden: %v", d)
	}
	// Excel import: unknown location is rejected and nothing is saved
	rec, _ = call("super_user", "POST", "/employee/employees/import", map[string]any{"rows": []map[string]any{{"full_name": "X", "nickname": "X", "position": "Host", "location": "Nowhere"}}})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("import with an unknown location: %d %s", rec.Code, rec.Body)
	}
	rec, out = call("super_user", "POST", "/employee/employees/import", map[string]any{"rows": []map[string]any{{"full_name": "Imported One", "nickname": "Imp", "position": "Cleaner", "location": "General"}}})
	if rec.Code != http.StatusOK || out["created"] != float64(1) {
		t.Fatalf("import: %d %s", rec.Code, rec.Body)
	}
	t.Cleanup(func() {
		db.Exec(ctx, `DELETE FROM employees WHERE full_name='Imported One'`)
		db.Exec(ctx, `DELETE FROM employee_positions WHERE name='Cleaner'`)
	})

	// sales
	db.QueryRow(ctx, `INSERT INTO customers (name, phone) VALUES ('T Emp Cust','0800000000') RETURNING id`).Scan(&cust)
	t.Cleanup(func() {
		db.Exec(ctx, `DELETE FROM orders WHERE id=$1`, order)
		db.Exec(ctx, `DELETE FROM customers WHERE id=$1`, cust)
	})
	var productID, variant, chain int
	db.QueryRow(ctx, `INSERT INTO products (name) VALUES ('T-Emp product') RETURNING id`).Scan(&productID)
	db.QueryRow(ctx, `INSERT INTO product_variants (product_id, sku, price) VALUES ($1, $2, 7500) RETURNING id`, productID, "T-EMP-"+itoa(productID)).Scan(&variant)
	db.QueryRow(ctx, `SELECT id FROM pickup_chains LIMIT 1`).Scan(&chain)
	t.Cleanup(func() {
		db.Exec(ctx, `DELETE FROM order_items WHERE order_id=$1`, order)
		db.Exec(ctx, `DELETE FROM product_variants WHERE id=$1`, variant)
		db.Exec(ctx, `DELETE FROM products WHERE id=$1`, productID)
	})
	if err := db.QueryRow(ctx, `INSERT INTO orders (order_no, customer_id, pickup_chain_id, status, shipping_address, sales_channel, shipping_fee, created_at)
		VALUES ('T-EMP-'||$2, $1, $3, 'shipped', 'x', 'normal', 0, '2026-11-05 10:00:00+07') RETURNING id`, cust, itoa(productID), chain).Scan(&order); err != nil {
		t.Fatalf("cannot create an order: %v", err)
	}
	if _, err := db.Exec(ctx, `INSERT INTO order_items (order_id, variant_id, qty, price_at_order, host_id) VALUES ($1,$2,40,7500,$3)`, order, variant, host); err != nil {
		t.Fatalf("cannot create an order item: %v", err)
	}

	// base salary, bonus rules, schedule (3 unpaid leave days + 1 day off)
	if rec, _ := call("super_user", "PUT", "/payroll/settings/salary", map[string]any{"employee_id": empID, "base_salary": 3000000}); rec.Code != http.StatusOK {
		t.Fatalf("salary: %d %s", rec.Code, rec.Body)
	}
	if rec, _ := call("super_user", "PUT", "/payroll/settings/bonus", map[string]any{
		"attendance_amount": 500000,
		"qty_tiers":         []map[string]any{{"min": 0, "max": 20, "rate": 0}, {"min": 21, "max": nil, "rate": 1000}},
		"gmv_tiers":         []map[string]any{{"min": 150000, "bonus": 500000}, {"min": 300000, "bonus": 1000000}},
		"daily":             map[string]any{"accumulate": false, "tiers": []map[string]any{{"qty": 30, "bonus": 100000}}},
	}); rec.Code != http.StatusOK {
		t.Fatalf("bonus settings: %d %s", rec.Code, rec.Body)
	}
	var lv, off int
	db.QueryRow(ctx, `SELECT id FROM attendance_statuses WHERE code='LV'`).Scan(&lv)
	db.QueryRow(ctx, `SELECT id FROM attendance_statuses WHERE code='OFF'`).Scan(&off)
	if rec, _ := call("super_user", "PUT", "/employee/schedule", map[string]any{"changes": []map[string]any{
		{"employee_id": empID, "dates": []string{"2026-11-10", "2026-11-11", "2026-11-12"}, "status_id": lv},
		{"employee_id": empID, "dates": []string{"2026-11-15"}, "status_id": off},
	}}); rec.Code != http.StatusOK {
		t.Fatalf("schedule: %d %s", rec.Code, rec.Body)
	}
	if rec, _ := call("super_user", "PUT", "/payroll/extra", map[string]any{"employee_id": empID, "month": "2026-11", "extra": -100000, "note": "late"}); rec.Code != http.StatusOK {
		t.Fatalf("extra: %d %s", rec.Code, rec.Body)
	}

	find := func(body map[string]any) map[string]any {
		for _, row := range body["rows"].([]any) {
			m := row.(map[string]any)
			if int(m["employee_id"].(float64)) == empID {
				return m["details"].(map[string]any)
			}
		}
		t.Fatalf("employee %d not in payroll: %v", empID, body)
		return nil
	}
	_, body := call("super_user", "GET", "/payroll?month=2026-11", nil)
	det := find(body)
	// 40 items x 1000 = 40,000 QTY bonus; GMV 40 x 7500 = 300,000 -> 1,000,000; daily 40 >= 30 -> 100,000; leave used -> no attendance bonus
	// deduction 3,000,000 / 30 x 3 = 300,000; final = 3,000,000 - 300,000 + 40,000 + 1,000,000 + 100,000 - 100,000
	if det["qty"] != float64(40) || det["gmv"] != float64(300000) || det["qty_bonus"] != float64(40000) || det["gmv_bonus"] != float64(1000000) ||
		det["daily_bonus"] != float64(100000) || det["attendance_bonus"] != float64(0) || det["unpaid_deduction"] != float64(300000) ||
		det["work_days"] != float64(26) || det["off_days"] != float64(1) || det["leave_days"] != float64(3) || det["final_salary"] != float64(3740000) {
		t.Fatalf("payroll breakdown: %v", det)
	}

	// confirming the payment freezes the month: changing the rules afterwards does not touch it
	if rec, _ := call("super_user", "PUT", "/payroll/paid", map[string]any{"employee_id": empID, "month": "2026-11", "paid": true}); rec.Code != http.StatusOK {
		t.Fatalf("paid: %d %s", rec.Code, rec.Body)
	}
	call("super_user", "PUT", "/payroll/settings/bonus", map[string]any{"attendance_amount": 0, "qty_tiers": []any{}, "gmv_tiers": []any{}, "daily": map[string]any{"tiers": []any{}}})
	_, body = call("super_user", "GET", "/payroll?month=2026-11", nil)
	if det = find(body); det["final_salary"] != float64(3740000) {
		t.Fatalf("a paid month must stay frozen: %v", det)
	}
	if rec, _ := call("super_user", "PUT", "/payroll/extra", map[string]any{"employee_id": empID, "month": "2026-11", "extra": 5}); rec.Code != http.StatusConflict {
		t.Fatalf("Extra of a paid month must be refused: %d", rec.Code)
	}
	call("super_user", "PUT", "/payroll/paid", map[string]any{"employee_id": empID, "month": "2026-11", "paid": false})
	if _, body = call("super_user", "GET", "/payroll?month=2026-11", nil); find(body)["final_salary"] == float64(3740000) {
		t.Fatal("after un-confirming, the payroll is calculated from the current rules again")
	}

	// transfer fee only moves the Grand Total
	call("super_user", "PUT", "/payroll/transfer-fee", map[string]any{"month": "2026-11", "amount": 104000})
	_, body = call("super_user", "GET", "/payroll?month=2026-11", nil)
	sum := body["summary"].(map[string]any)
	if sum["grand_total"].(float64) != sum["total_salaries"].(float64)+104000 {
		t.Fatalf("summary: %v", sum)
	}
	// ranking: the linked Host shows up with the bonuses of the sales
	_, body = call("super_user", "GET", "/bonus-ranking?month=2026-11", nil)
	if len(body["rows"].([]any)) == 0 {
		t.Fatalf("ranking is empty: %v", body)
	}
}
