package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"ordermgmt/internal/auth"
	appmw "ordermgmt/internal/middleware"
)

// Runs only with TEST_DATABASE_URL: the "insufficient stock" Excel export lists the missing SKUs with the quantity short.
func TestInsufficientStockExport(t *testing.T) {
	db := liveTestDB(t)
	ctx := context.Background()
	sfx := strconv.FormatInt(time.Now().UnixNano()%1000000000, 10)
	must := func(err error) {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
	}
	var userID, product, variant, cust, c711 int
	must(db.QueryRow(ctx, `SELECT id FROM users ORDER BY id LIMIT 1`).Scan(&userID))
	must(db.QueryRow(ctx, `INSERT INTO products (name) VALUES ('T-Short product') RETURNING id`).Scan(&product))
	must(db.QueryRow(ctx, `INSERT INTO product_variants (product_id, sku, price) VALUES ($1,$2,100) RETURNING id`, product, "T-SHORT-"+sfx).Scan(&variant))
	_, err := db.Exec(ctx, `INSERT INTO stock_buckets (variant_id, available_stock) VALUES ($1, 2) ON CONFLICT (variant_id) DO UPDATE SET available_stock = 2`, variant)
	must(err)
	must(db.QueryRow(ctx, `INSERT INTO customers (name, phone) VALUES ('TShort','0912345678') RETURNING id`).Scan(&cust))
	must(db.QueryRow(ctx, `SELECT id FROM pickup_chains WHERE chain_type='cvs_711' LIMIT 1`).Scan(&c711))
	var orders []int
	order := func(qty int, daysAgo int) string {
		no := "T-SHORT-" + sfx + "-" + strconv.Itoa(len(orders))
		var id int
		must(db.QueryRow(ctx, `INSERT INTO orders (order_no, customer_id, pickup_chain_id, pickup_store_code, status, shipping_address, sales_channel, shipping_fee, created_at)
			VALUES ($1,$2,$3,'123456','pending','x','normal',0, now() - make_interval(days => $4)) RETURNING id`, no, cust, c711, daysAgo).Scan(&id))
		orders = append(orders, id)
		_, err := db.Exec(ctx, `INSERT INTO order_items (order_id, variant_id, qty, price_at_order) VALUES ($1,$2,$3,100)`, id, variant, qty)
		must(err)
		return no
	}
	t.Cleanup(func() {
		for _, o := range orders {
			db.Exec(ctx, `DELETE FROM order_items WHERE order_id=$1`, o)
			db.Exec(ctx, `DELETE FROM orders WHERE id=$1`, o)
		}
		db.Exec(ctx, `DELETE FROM stock_buckets WHERE variant_id=$1`, variant)
		db.Exec(ctx, `DELETE FROM product_variants WHERE id=$1`, variant)
		db.Exec(ctx, `DELETE FROM products WHERE id=$1`, product)
		db.Exec(ctx, `DELETE FROM customers WHERE id=$1`, cust)
	})
	old := order(2, 5)    // oldest: takes the 2 units in stock
	short := order(3, 3)  // newer: needs 3, none left -> short by 3
	recent := order(1, 1) // newer still: needs 1, none left -> short by 1

	h := &ShippingWorkbenchHandler{DB: db}
	call := func(query string) (lines []insufficientLine) {
		req := httptest.NewRequest(http.MethodGet, "/orders/insufficient-stock"+query, nil)
		req = req.WithContext(context.WithValue(req.Context(), appmw.ClaimsKey, &auth.Claims{UserID: userID, Role: "super_user"}))
		w := httptest.NewRecorder()
		h.InsufficientStock(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("%s: %d %s", query, w.Code, w.Body.String())
		}
		var out struct {
			Lines []insufficientLine `json:"lines"`
		}
		must(json.Unmarshal(w.Body.Bytes(), &out))
		for _, l := range out.Lines {
			if l.SKU == "T-SHORT-"+sfx {
				lines = append(lines, l)
			}
		}
		return
	}
	find := func(ls []insufficientLine, no string) *insufficientLine {
		for i := range ls {
			if ls[i].OrderNo == no {
				return &ls[i]
			}
		}
		return nil
	}

	all := call("")
	if find(all, old) != nil {
		t.Fatalf("the oldest order is covered by stock and must not be listed: %+v", all)
	}
	s := find(all, short)
	if s == nil || s.Ordered != 3 || s.Available != 0 || s.Short != 3 || s.CreatedAt == "" {
		t.Fatalf("shortage of the second order: %+v", s)
	}
	if r := find(all, recent); r == nil || r.Short != 1 {
		t.Fatalf("shortage of the third order: %+v", r)
	}

	// narrowed to a creation-date range (Jakarta days): only the order from 3 days ago
	day := time.Now().In(time.FixedZone("WIB", 7*3600)).AddDate(0, 0, -3).Format("2006-01-02")
	ranged := call("?date_from=" + day + "&date_to=" + day)
	if find(ranged, short) == nil || find(ranged, recent) != nil {
		t.Fatalf("date range filter: %+v", ranged)
	}
	req := httptest.NewRequest(http.MethodGet, "/orders/insufficient-stock?date_from=nope", nil)
	req = req.WithContext(context.WithValue(req.Context(), appmw.ClaimsKey, &auth.Claims{UserID: userID, Role: "super_user"}))
	w := httptest.NewRecorder()
	h.InsufficientStock(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("a bad date is refused, got %d", w.Code)
	}
}
