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

// Runs only with TEST_DATABASE_URL: the order list carries the product lines only when include_items=true.
func TestOrderListIncludeItems(t *testing.T) {
	db := liveTestDB(t)
	ctx := context.Background()
	sfx := strconv.FormatInt(time.Now().UnixNano()%1000000000, 10)
	must := func(err error) {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
	}
	var userID, product, v1, v2, cust, chain, order int
	must(db.QueryRow(ctx, `SELECT id FROM users ORDER BY id LIMIT 1`).Scan(&userID))
	must(db.QueryRow(ctx, `INSERT INTO products (name) VALUES ('T-List product') RETURNING id`).Scan(&product))
	must(db.QueryRow(ctx, `INSERT INTO product_variants (product_id, sku, price) VALUES ($1,$2,100) RETURNING id`, product, "T-LI-A-"+sfx).Scan(&v1))
	must(db.QueryRow(ctx, `INSERT INTO product_variants (product_id, sku, price) VALUES ($1,$2,100) RETURNING id`, product, "T-LI-B-"+sfx).Scan(&v2))
	must(db.QueryRow(ctx, `INSERT INTO customers (name, phone) VALUES ('TList','0912000111') RETURNING id`).Scan(&cust))
	must(db.QueryRow(ctx, `SELECT id FROM pickup_chains LIMIT 1`).Scan(&chain))
	no := "T-LIST-" + sfx
	must(db.QueryRow(ctx, `INSERT INTO orders (order_no, customer_id, pickup_chain_id, status, shipping_address, sales_channel, shipping_fee) VALUES ($1,$2,$3,'pending','x','normal',0) RETURNING id`, no, cust, chain).Scan(&order))
	_, err := db.Exec(ctx, `INSERT INTO order_items (order_id, variant_id, qty, price_at_order) VALUES ($1,$2,2,100),($1,$3,1,100)`, order, v1, v2)
	must(err)
	t.Cleanup(func() {
		db.Exec(ctx, `DELETE FROM order_items WHERE order_id=$1`, order)
		db.Exec(ctx, `DELETE FROM orders WHERE id=$1`, order)
		db.Exec(ctx, `DELETE FROM product_variants WHERE product_id=$1`, product)
		db.Exec(ctx, `DELETE FROM products WHERE id=$1`, product)
		db.Exec(ctx, `DELETE FROM customers WHERE id=$1`, cust)
	})

	h := &OrderHandler{DB: db}
	list := func(extra string) []orderListItem {
		req := httptest.NewRequest(http.MethodGet, "/orders?q="+no+extra, nil)
		req = req.WithContext(context.WithValue(req.Context(), appmw.ClaimsKey, &auth.Claims{UserID: userID, Role: "super_user"}))
		w := httptest.NewRecorder()
		h.List(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("list: %d %s", w.Code, w.Body.String())
		}
		var out struct {
			Items []orderListItem `json:"items"`
		}
		must(json.Unmarshal(w.Body.Bytes(), &out))
		return out.Items
	}
	if got := list(""); len(got) != 1 || len(got[0].Items) != 0 {
		t.Fatalf("no lines unless asked for: %+v", got)
	}
	got := list("&include_items=true")
	if len(got) != 1 || len(got[0].Items) != 2 {
		t.Fatalf("both lines: %+v", got)
	}
	if got[0].Items[0].SKU != "T-LI-A-"+sfx || got[0].Items[0].Qty != 2 || got[0].Items[0].Name != "T-List product" || got[0].Items[1].Qty != 1 {
		t.Fatalf("lines: %+v", got[0].Items)
	}
}
