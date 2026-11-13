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

	"ordermgmt/internal/auth"
	appmw "ordermgmt/internal/middleware"
)

// Runs only with TEST_DATABASE_URL (see liveTestDB): authorized staff change the shipping method of an order that sits
// in a batch (7-11 <-> FamilyMart). They confirm, the order leaves the batch and returns to Pending; an order that
// already exists on the platform, or a role without the right, is refused.
func TestShippingMethodChangeRemovesOrderFromBatch(t *testing.T) {
	db := liveTestDB(t)
	ctx := context.Background()
	sfx := strconv.FormatInt(time.Now().UnixNano()%1000000000, 10)
	must := func(err error) {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
	}
	var product, variant, cust, c711, cfm, batch int
	must(db.QueryRow(ctx, `INSERT INTO products (name) VALUES ('T-Method product') RETURNING id`).Scan(&product))
	must(db.QueryRow(ctx, `INSERT INTO product_variants (product_id, sku, price) VALUES ($1,$2,100) RETURNING id`, product, "T-METH-"+sfx).Scan(&variant))
	db.Exec(ctx, `INSERT INTO stock_buckets (variant_id, available_stock) VALUES ($1, 50) ON CONFLICT DO NOTHING`, variant)
	must(db.QueryRow(ctx, `INSERT INTO customers (name, phone) VALUES ('TMeth',$1) RETURNING id`, "08"+sfx).Scan(&cust))
	must(db.QueryRow(ctx, `SELECT id FROM pickup_chains WHERE chain_type='cvs_711' LIMIT 1`).Scan(&c711))
	must(db.QueryRow(ctx, `SELECT id FROM pickup_chains WHERE chain_type='cvs_familymart' LIMIT 1`).Scan(&cfm))
	must(db.QueryRow(ctx, `INSERT INTO shipping_batches (batch_no, provider) VALUES ($1,'cvs_711') RETURNING id`, "T-B711-"+sfx).Scan(&batch))
	var orders []int
	newOrder := func(status, platformNo, result string) (oid, item int) {
		must(db.QueryRow(ctx, `INSERT INTO orders (order_no, customer_id, pickup_chain_id, pickup_store_code, pickup_store_name, status, shipping_address, sales_channel, shipping_fee, exported_at, platform_order_no)
			VALUES ($1,$2,$3,'123456','T store',$4,'T store','normal',60,now(),NULLIF($5,'')) RETURNING id`, "T-METH-"+sfx+"-"+strconv.Itoa(len(orders)), cust, c711, status, platformNo).Scan(&oid))
		orders = append(orders, oid)
		must(db.QueryRow(ctx, `INSERT INTO order_items (order_id, variant_id, qty, price_at_order) VALUES ($1,$2,1,100) RETURNING id`, oid, variant).Scan(&item))
		var res any
		if result != "" {
			res = result
		}
		_, err := db.Exec(ctx, `INSERT INTO shipping_batch_orders (batch_id, order_id, seq, create_result) VALUES ($1,$2,$3,$4)`, batch, oid, len(orders), res)
		must(err)
		return
	}
	t.Cleanup(func() {
		for _, o := range orders {
			db.Exec(ctx, `DELETE FROM shipping_batch_removals WHERE order_id=$1`, o)
			db.Exec(ctx, `DELETE FROM shipping_batch_orders WHERE order_id=$1`, o)
			db.Exec(ctx, `DELETE FROM order_status_log WHERE order_id=$1`, o)
			db.Exec(ctx, `DELETE FROM order_items WHERE order_id=$1`, o)
			db.Exec(ctx, `DELETE FROM orders WHERE id=$1`, o)
		}
		db.Exec(ctx, `DELETE FROM shipping_batches WHERE id=$1`, batch)
		db.Exec(ctx, `DELETE FROM product_variants WHERE id=$1`, variant)
		db.Exec(ctx, `DELETE FROM products WHERE id=$1`, product)
		db.Exec(ctx, `DELETE FROM customers WHERE id=$1`, cust)
	})

	h := &OrderHandler{DB: db}
	r := chi.NewRouter()
	r.Put("/orders/{id}", h.Edit)
	r.Patch("/orders/{id}/pickup", h.UpdatePickup)
	send := func(role, method, path string, body map[string]any) (*httptest.ResponseRecorder, map[string]any) {
		b, _ := json.Marshal(body)
		req := httptest.NewRequest(method, path, bytes.NewReader(b))
		req = req.WithContext(context.WithValue(req.Context(), appmw.ClaimsKey, &auth.Claims{UserID: 1, Name: "Tester", Role: role}))
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		var out map[string]any
		_ = json.Unmarshal(rec.Body.Bytes(), &out)
		return rec, out
	}
	editBody := func(item int, confirm bool) map[string]any {
		return map[string]any{
			"customer": map[string]any{"name": "TMeth", "phone": "08" + sfx}, "pickup_chain_id": cfm, "pickup_store_code": "654321", "pickup_store_name": "FM store",
			"items": []map[string]any{{"id": item, "variant_id": variant, "qty": 1}}, "confirm_remove_from_batch": confirm,
		}
	}
	inBatch := func(oid int) (n int) {
		db.QueryRow(ctx, `SELECT COUNT(*) FROM shipping_batch_orders WHERE order_id=$1`, oid).Scan(&n)
		return
	}
	url := func(oid int) string { return "/orders/" + strconv.Itoa(oid) }

	// 1. Edit Order: asks for confirmation first (nothing changes), then removes the order from the batch
	oid, item := newOrder("processing", "", "failed")
	rec, out := send("management", http.MethodPut, url(oid), editBody(item, false))
	if rec.Code != http.StatusConflict || out["code"] != confirmBatchRemovalCode || inBatch(oid) != 1 {
		t.Fatalf("confirmation first: %d %s", rec.Code, rec.Body)
	}
	if rec, _ = send("management", http.MethodPut, url(oid), editBody(item, true)); rec.Code != http.StatusOK {
		t.Fatalf("confirmed change: %d %s", rec.Code, rec.Body)
	}
	var status string
	var chain int
	var exported bool
	db.QueryRow(ctx, `SELECT status, pickup_chain_id, exported_at IS NOT NULL FROM orders WHERE id=$1`, oid).Scan(&status, &chain, &exported)
	if status != "pending" || chain != cfm || exported || inBatch(oid) != 0 {
		t.Fatalf("back to Pending with the new method, out of the batch: %s chain=%d exported=%v batch=%d", status, chain, exported, inBatch(oid))
	}
	var removals int
	db.QueryRow(ctx, `SELECT COUNT(*) FROM shipping_batch_removals WHERE order_id=$1`, oid).Scan(&removals)
	if removals != 1 {
		t.Fatalf("the removal is recorded, got %d", removals)
	}

	// 2. Edit Pickup Method does the same
	oid2, _ := newOrder("processing", "", "")
	body := map[string]any{"pickup_chain_id": cfm, "pickup_store_code": "654321", "pickup_store_name": "FM store"}
	if rec, out = send("spv", http.MethodPatch, url(oid2)+"/pickup", body); rec.Code != http.StatusConflict || out["code"] != confirmBatchRemovalCode || inBatch(oid2) != 1 {
		t.Fatalf("pickup: confirmation first: %d %s", rec.Code, rec.Body)
	}
	body["confirm_remove_from_batch"] = true
	if rec, _ = send("spv", http.MethodPatch, url(oid2)+"/pickup", body); rec.Code != http.StatusOK || inBatch(oid2) != 0 {
		t.Fatalf("pickup: confirmed change: %d %s", rec.Code, rec.Body)
	}

	// 3. an order that already exists on the platform is refused, even with the confirmation
	oid3, item3 := newOrder("processing", "CM2611129999999", "created")
	if rec, _ = send("management", http.MethodPut, url(oid3), editBody(item3, true)); rec.Code != http.StatusConflict || inBatch(oid3) != 1 {
		t.Fatalf("created on the platform must stay: %d %s", rec.Code, rec.Body)
	}
	db.QueryRow(ctx, `SELECT pickup_chain_id FROM orders WHERE id=$1`, oid3).Scan(&chain)
	if chain != c711 {
		t.Fatal("its shipping method is untouched")
	}

	// 4. a role without the right keeps getting the usual refusal
	oid4, item4 := newOrder("processing", "", "failed")
	if rec, out = send("sales", http.MethodPut, url(oid4), editBody(item4, true)); rec.Code == http.StatusOK || out["code"] != nil || inBatch(oid4) != 1 {
		t.Fatalf("a role without the right must not remove the order: %d %s", rec.Code, rec.Body)
	}

	// 5. the same provider is not a batch change: another 7-11 store keeps the order in its batch (existing behaviour)
	if rec, _ = send("management", http.MethodPatch, url(oid4)+"/pickup", map[string]any{"pickup_chain_id": c711, "pickup_store_code": "222222", "pickup_store_name": "x"}); inBatch(oid4) != 1 {
		t.Fatalf("same provider stays in the batch: %d %s", rec.Code, rec.Body)
	}
}
