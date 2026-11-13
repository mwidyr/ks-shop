package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
)

// Runs only with TEST_DATABASE_URL (see liveTestDB): Heatmap follows Dashboard - an inactive host is shown (and counted)
// when it has orders in the selected Period, and only then.
func TestHeatmapIncludesInactiveHostsWithOrders(t *testing.T) {
	db := liveTestDB(t)
	ctx := context.Background()
	sfx := strconv.FormatInt(time.Now().UnixNano()%1000000000, 10)
	must := func(err error) {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
	}
	var loc, product, variant, cust, chain int
	must(db.QueryRow(ctx, `INSERT INTO host_locations (name) VALUES ('T-Heat-'||$1) RETURNING id`, sfx).Scan(&loc))
	must(db.QueryRow(ctx, `INSERT INTO products (name) VALUES ('T-Heat product') RETURNING id`).Scan(&product))
	must(db.QueryRow(ctx, `INSERT INTO product_variants (product_id, sku, price) VALUES ($1,$2,100) RETURNING id`, product, "T-HEAT-"+sfx).Scan(&variant))
	must(db.QueryRow(ctx, `INSERT INTO customers (name, phone) VALUES ('THeat',$1) RETURNING id`, "08"+sfx).Scan(&cust))
	must(db.QueryRow(ctx, `SELECT id FROM pickup_chains LIMIT 1`).Scan(&chain))
	host := func(name string, active bool) (id int) {
		must(db.QueryRow(ctx, `INSERT INTO hosts (name, platform, location_id, is_active) VALUES ($1,'tiktok',$2,$3) RETURNING id`, name+sfx, loc, active).Scan(&id))
		return
	}
	activeNoSales := host("T-ActiveNoSales", true)
	inactiveInRange := host("T-InactiveInRange", false)
	inactiveOutRange := host("T-InactiveOutRange", false)
	inactiveCancelled := host("T-InactiveCancelled", false)
	var orders []int
	order := func(hostID int, at, status string, qty int) {
		var oid int
		must(db.QueryRow(ctx, `INSERT INTO orders (order_no, customer_id, pickup_chain_id, status, shipping_address, sales_channel, shipping_fee, created_at)
			VALUES ($1,$2,$3,$4,'x','live',0,$5::timestamptz) RETURNING id`, "T-HEAT-"+sfx+"-"+strconv.Itoa(len(orders)), cust, chain, status, at).Scan(&oid))
		orders = append(orders, oid)
		_, err := db.Exec(ctx, `INSERT INTO order_items (order_id, variant_id, qty, price_at_order, host_id) VALUES ($1,$2,$3,100,$4)`, oid, variant, qty, hostID)
		must(err)
	}
	order(inactiveInRange, "2026-10-10 12:15:00+07", "delivered", 3)
	order(inactiveOutRange, "2026-09-01 12:15:00+07", "delivered", 5)
	order(inactiveCancelled, "2026-10-10 13:00:00+07", "cancelled", 7)
	t.Cleanup(func() {
		for _, o := range orders {
			db.Exec(ctx, `DELETE FROM order_items WHERE order_id=$1`, o)
			db.Exec(ctx, `DELETE FROM orders WHERE id=$1`, o)
		}
		db.Exec(ctx, `DELETE FROM hosts WHERE location_id=$1`, loc)
		db.Exec(ctx, `DELETE FROM host_locations WHERE id=$1`, loc)
		db.Exec(ctx, `DELETE FROM product_variants WHERE id=$1`, variant)
		db.Exec(ctx, `DELETE FROM products WHERE id=$1`, product)
		db.Exec(ctx, `DELETE FROM customers WHERE id=$1`, cust)
	})

	h := &HeatmapHandler{DB: db}
	r := chi.NewRouter()
	r.Get("/heatmap/summary", h.Summary)
	r.Get("/heatmap/grid", h.Grid)
	get := func(path string, out any) {
		t.Helper()
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path+"?from=2026-10-01&to=2026-10-31&location_id="+strconv.Itoa(loc), nil))
		if rec.Code != http.StatusOK {
			t.Fatalf("%s: %d %s", path, rec.Code, rec.Body)
		}
		must(json.Unmarshal(rec.Body.Bytes(), out))
	}

	var grid heatmapGridResponse
	get("/heatmap/grid", &grid)
	names := map[int]heatmapHostRow{}
	for _, row := range grid.Hosts {
		names[row.HostID] = row
	}
	if _, ok := names[activeNoSales]; !ok {
		t.Fatal("an active host is listed even with zero sales")
	}
	row, ok := names[inactiveInRange]
	if !ok || row.TotalQty != 3 {
		t.Fatalf("an inactive host with orders in the Period must be listed with its sales: %+v", row)
	}
	if row.Slots[24] != 3 { // 12:15 Jakarta time = slot 24 (12:00-12:29)
		t.Fatalf("its sales land in the 12:00 slot: %+v", row.Slots)
	}
	if _, ok := names[inactiveOutRange]; ok {
		t.Fatal("an inactive host without orders in the Period stays hidden")
	}
	if _, ok := names[inactiveCancelled]; ok {
		t.Fatal("cancelled orders do not count as records")
	}
	var summary heatmapSummary
	get("/heatmap/summary", &summary)
	if summary.Qty != 3 || summary.Ord != 1 || summary.GMV != 300 {
		t.Fatalf("summary counts the inactive host's sales: %+v", summary)
	}
	sum := 0
	for _, v := range grid.AllRow {
		sum += v
	}
	if sum != summary.Qty {
		t.Fatalf("grid ALL row (%d) and summary (%d) must agree", sum, summary.Qty)
	}
}
