package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
)

// Runs only with TEST_DATABASE_URL (see liveTestDB): Promotion Purposes (editable, history keeps the old name), a cancelled
// order stays in Usage History but is not counted as used, the filters and the summary agree, and a cancelled order frees
// its usage limit.
func TestPromotionPurposesAndUsageHistory(t *testing.T) {
	db := liveTestDB(t)
	ctx := context.Background()
	sfx := strconv.FormatInt(time.Now().UnixNano()%1000000000, 10)
	must := func(err error) {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
	}
	h := &PromotionHandler{DB: db}
	r := chi.NewRouter()
	r.Get("/promotion-purposes", h.Purposes)
	r.Post("/promotion-purposes", h.CreatePurpose)
	r.Put("/promotion-purposes/order", h.ReorderPurposes)
	r.Patch("/promotion-purposes/{id}", h.UpdatePurpose)
	r.Get("/promotions/usage", h.Usage)
	call := func(method, path string, body any) (*httptest.ResponseRecorder, map[string]any) {
		var b []byte
		if body != nil {
			b, _ = json.Marshal(body)
		}
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest(method, path, bytes.NewReader(b)))
		var out map[string]any
		_ = json.Unmarshal(rec.Body.Bytes(), &out)
		return rec, out
	}

	// ---- purposes ----
	rec, out := call("POST", "/promotion-purposes", map[string]any{"name": "Goodwill " + sfx})
	if rec.Code != http.StatusCreated {
		t.Fatalf("create purpose: %d %s", rec.Code, rec.Body)
	}
	goodwill := int(out["id"].(float64))
	t.Cleanup(func() {
		db.Exec(ctx, `DELETE FROM promotion_redemptions WHERE purpose_id=$1`, goodwill)
		db.Exec(ctx, `DELETE FROM promotion_purposes WHERE id=$1`, goodwill)
	})
	if rec, _ = call("POST", "/promotion-purposes", map[string]any{"name": "goodwill " + sfx}); rec.Code != http.StatusConflict {
		t.Fatalf("a duplicate name (any case) is refused: %d", rec.Code)
	}
	if rec, _ = call("POST", "/promotion-purposes", map[string]any{"name": "   "}); rec.Code != http.StatusBadRequest {
		t.Fatalf("an empty name is refused: %d", rec.Code)
	}
	var systemID, compID int
	must(db.QueryRow(ctx, `SELECT id FROM promotion_purposes WHERE is_system`).Scan(&systemID))
	must(db.QueryRow(ctx, `SELECT id FROM promotion_purposes WHERE name='Customer Compensation'`).Scan(&compID))
	if rec, _ = call("PATCH", "/promotion-purposes/"+strconv.Itoa(systemID), map[string]any{"is_active": false}); rec.Code != http.StatusConflict {
		t.Fatalf("the system purpose cannot be disabled: %d", rec.Code)
	}
	if rec, _ = call("PATCH", "/promotion-purposes/"+strconv.Itoa(goodwill), map[string]any{"is_active": false}); rec.Code != http.StatusOK {
		t.Fatalf("disable: %d", rec.Code)
	}
	listIDs := func(path string) map[int]bool {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest("GET", path, nil))
		var rows []purposeView
		must(json.Unmarshal(rec.Body.Bytes(), &rows))
		m := map[int]bool{}
		for _, p := range rows {
			m[p.ID] = true
		}
		return m
	}
	if !listIDs("/promotion-purposes")[goodwill] || listIDs("/promotion-purposes?active=1")[goodwill] {
		t.Fatal("a disabled purpose stays in Settings but leaves the order forms")
	}
	db.Exec(ctx, `UPDATE promotion_purposes SET is_active=true WHERE id=$1`, goodwill)
	// reorder: swap the first two, then put them back
	var order []int
	rows, _ := db.Query(ctx, `SELECT id FROM promotion_purposes ORDER BY sort_order, id`)
	for rows.Next() {
		var id int
		rows.Scan(&id)
		order = append(order, id)
	}
	rows.Close()
	swapped := append([]int{order[1], order[0]}, order[2:]...)
	if rec, _ = call("PUT", "/promotion-purposes/order", map[string]any{"ids": swapped}); rec.Code != http.StatusOK {
		t.Fatalf("reorder: %d %s", rec.Code, rec.Body)
	}
	var firstID int
	db.QueryRow(ctx, `SELECT id FROM promotion_purposes ORDER BY sort_order, id LIMIT 1`).Scan(&firstID)
	if firstID != order[1] {
		t.Fatal("the new order is saved")
	}
	if rec, _ = call("PUT", "/promotion-purposes/order", map[string]any{"ids": order[:2]}); rec.Code != http.StatusBadRequest {
		t.Fatalf("a partial list is refused: %d", rec.Code)
	}
	call("PUT", "/promotion-purposes/order", map[string]any{"ids": order})

	// ---- usage history ----
	var userID, loc, host, product, variant, cust, chain, promo int
	must(db.QueryRow(ctx, `SELECT id FROM users ORDER BY id LIMIT 1`).Scan(&userID))
	must(db.QueryRow(ctx, `INSERT INTO host_locations (name) VALUES ('T-Usage-'||$1) RETURNING id`, sfx).Scan(&loc))
	must(db.QueryRow(ctx, `INSERT INTO hosts (name, platform, location_id) VALUES ($1,'tiktok',$2) RETURNING id`, "T-UH"+sfx, loc).Scan(&host))
	must(db.QueryRow(ctx, `INSERT INTO products (name) VALUES ('T-Usage product') RETURNING id`).Scan(&product))
	must(db.QueryRow(ctx, `INSERT INTO product_variants (product_id, sku, price) VALUES ($1,$2,100) RETURNING id`, product, "T-USE-"+sfx).Scan(&variant))
	must(db.QueryRow(ctx, `INSERT INTO customers (name, phone) VALUES ('TUsage',$1) RETURNING id`, "0912"+sfx[:6]).Scan(&cust))
	must(db.QueryRow(ctx, `SELECT id FROM pickup_chains WHERE chain_type='courier' LIMIT 1`).Scan(&chain))
	must(db.QueryRow(ctx, `INSERT INTO promotions (name, code, type, value, combinable, usage_limit) VALUES ($1,$2,'fixed_amount',10,true,2) RETURNING id`, "T usage "+sfx, "T-USE-"+sfx).Scan(&promo))
	var orders []int
	newOrder := func(channel string, hostID any, status string, discount float64, purposeID int) int {
		var oid int
		must(db.QueryRow(ctx, `INSERT INTO orders (order_no, customer_id, pickup_chain_id, status, shipping_address, sales_channel, shipping_fee, promotion_id, promotion_discount_amount)
			VALUES ($1,$2,$3,$4,'x',$5,0,$6,$7) RETURNING id`, "T-USE-"+sfx+"-"+strconv.Itoa(len(orders)), cust, chain, status, channel, promo, discount).Scan(&oid))
		orders = append(orders, oid)
		_, err := db.Exec(ctx, `INSERT INTO order_items (order_id, variant_id, qty, price_at_order, host_id) VALUES ($1,$2,2,100,$3)`, oid, variant, hostID)
		must(err)
		_, err = db.Exec(ctx, `INSERT INTO promotion_redemptions (promotion_id, order_id, customer_id, discount_applied, applied_by, purpose_id, purpose_name)
			SELECT $1,$2,$3,$4,$5,pp.id,pp.name FROM promotion_purposes pp WHERE pp.id=$6`, promo, oid, cust, discount, userID, purposeID)
		must(err)
		return oid
	}
	t.Cleanup(func() {
		for _, o := range orders {
			db.Exec(ctx, `DELETE FROM promotion_redemptions WHERE order_id=$1`, o)
			db.Exec(ctx, `DELETE FROM order_status_log WHERE order_id=$1`, o)
			db.Exec(ctx, `DELETE FROM order_items WHERE order_id=$1`, o)
			db.Exec(ctx, `DELETE FROM orders WHERE id=$1`, o)
		}
		db.Exec(ctx, `DELETE FROM promotions WHERE id=$1`, promo)
		db.Exec(ctx, `DELETE FROM hosts WHERE id=$1`, host)
		db.Exec(ctx, `DELETE FROM host_locations WHERE id=$1`, loc)
		db.Exec(ctx, `DELETE FROM product_variants WHERE id=$1`, variant)
		db.Exec(ctx, `DELETE FROM products WHERE id=$1`, product)
		db.Exec(ctx, `DELETE FROM customers WHERE id=$1`, cust)
	})
	web := newOrder("website", nil, "delivered", 50, compID)     // total 200 - 50 = 150
	liveOrder := newOrder("live", host, "pending", 30, systemID) // total 170
	dead := newOrder("website", nil, "pending", 20, goodwill)    // total 180, then cancelled
	tx, err := db.Begin(ctx)
	must(err)
	must(applyStatusChange(ctx, tx, dead, "pending", "cancelled", &userID, "test"))
	must(tx.Commit(ctx))

	var kept int
	db.QueryRow(ctx, `SELECT COUNT(*) FROM promotion_redemptions WHERE order_id=$1 AND cancelled_at IS NOT NULL`, dead).Scan(&kept)
	if kept != 1 {
		t.Fatalf("a cancelled order keeps its usage record (marked): %d", kept)
	}

	type usage struct {
		Summary usageSummary `json:"summary"`
		Rows    []usageRow   `json:"rows"`
		Total   int          `json:"total"`
	}
	get := func(extra string) usage {
		t.Helper()
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest("GET", "/promotions/usage?from=2020-01-01&to=2099-12-31&promotion_id="+strconv.Itoa(promo)+extra, nil))
		if rec.Code != http.StatusOK {
			t.Fatalf("usage: %d %s", rec.Code, rec.Body)
		}
		var u usage
		must(json.Unmarshal(rec.Body.Bytes(), &u))
		return u
	}
	all := get("")
	s := all.Summary
	if all.Total != 3 || s.Issued != 100 || s.Used != 80 || s.Uses != 2 || s.CancelledUses != 1 || s.GMV != 320 {
		t.Fatalf("summary: issued 100 / used 80 / 2 uses / 1 cancelled / GMV 320 expected, got %+v (rows %d)", s, all.Total)
	}
	byOrder := map[int]usageRow{}
	for _, x := range all.Rows {
		byOrder[x.OrderID] = x
	}
	if !byOrder[dead].Cancelled || byOrder[dead].Purpose != "Goodwill "+sfx || byOrder[web].Cancelled {
		t.Fatalf("the cancelled order stays in the list, marked: %+v", byOrder[dead])
	}
	if byOrder[web].CustomerPhone != "0912"+sfx[:6] || byOrder[web].AppliedBy == "" || byOrder[liveOrder].Hosts != "T-UH"+sfx {
		t.Fatalf("phone, staff and host are shown: %+v %+v", byOrder[web], byOrder[liveOrder])
	}
	for _, c := range []struct {
		name, q string
		rows    int
		used    float64
	}{
		{"sales channel live", "&sales_channel=live", 1, 30},
		{"sales channel website", "&sales_channel=website", 2, 50},
		{"host", "&host_id=" + strconv.Itoa(host), 1, 30},
		{"location", "&location_id=" + strconv.Itoa(loc), 1, 30},
		{"purpose", "&purpose_id=" + strconv.Itoa(compID), 1, 50},
		{"staff", "&staff_id=" + strconv.Itoa(userID), 3, 80},
		{"nothing", "&purpose_id=999999", 0, 0},
	} {
		u := get(c.q)
		if u.Total != c.rows || u.Summary.Used != c.used {
			t.Errorf("filter %s: %d rows / used %v, got %d / %v", c.name, c.rows, c.used, u.Total, u.Summary.Used)
		}
	}
	// the purpose keeps the name it had: renaming it later does not touch the record
	call("PATCH", "/promotion-purposes/"+strconv.Itoa(goodwill), map[string]any{"name": "Renamed " + sfx})
	if get("").Rows == nil || func() bool {
		for _, x := range get("").Rows {
			if x.OrderID == dead {
				return x.Purpose != "Goodwill "+sfx
			}
		}
		return true
	}() {
		t.Fatal("history keeps the purpose name it had")
	}

	// usage limit 2: the two live uses fill it, a cancelled order does not count
	defs, err := loadPromoDefs(ctx, db, `p.id=$1`, promo)
	must(err)
	if msg := promoUsable(ctx, db, defs[0], nil, 0, true); msg == "" {
		t.Fatal("2 uses + 1 cancelled: the limit of 2 is reached")
	}
	tx, err = db.Begin(ctx)
	must(err)
	must(applyStatusChange(ctx, tx, liveOrder, "pending", "cancelled", &userID, "test"))
	must(tx.Commit(ctx))
	if msg := promoUsable(ctx, db, defs[0], nil, 0, true); msg != "" {
		t.Fatalf("a cancelled order frees its usage: %q", msg)
	}
	if after := get(""); after.Summary.Uses != 1 || after.Summary.Used != 50 || after.Summary.Issued != 100 {
		t.Fatalf("after the second cancellation: %+v", after.Summary)
	}
}
