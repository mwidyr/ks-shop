package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"ordermgmt/internal/auth"
	appmw "ordermgmt/internal/middleware"
)

// The merged shipment is the editor: items go back to their own original order, delivery data goes to all of them.
func TestMergedGroupEditSyncsToOriginalOrders(t *testing.T) {
	db := liveTestDB(t)
	ctx := context.Background()
	tag := strconv.FormatInt(time.Now().UnixNano(), 10)
	var user, cust, chain, variant int
	db.QueryRow(ctx, `INSERT INTO users (name, email, role_id, is_active) VALUES ('ge',$1,(SELECT id FROM roles WHERE name='cs'),true) RETURNING id`, "ge"+tag+"@t.local").Scan(&user)
	db.QueryRow(ctx, `INSERT INTO customers (name, phone) VALUES ('Group Edit','0900000444') RETURNING id`).Scan(&cust)
	db.QueryRow(ctx, `SELECT id FROM pickup_chains WHERE chain_type='courier' ORDER BY id LIMIT 1`).Scan(&chain)
	db.QueryRow(ctx, `SELECT id FROM product_variants ORDER BY id LIMIT 1`).Scan(&variant)
	db.Exec(ctx, `UPDATE stock_buckets SET available_stock = available_stock + 100 WHERE variant_id=$1`, variant)
	var ids, items []int
	dates := []string{"2026-10-31 20:00:00+00", "2026-11-01 05:00:00+00"}
	for i := 0; i < 2; i++ {
		var id, item int
		if err := db.QueryRow(ctx, `INSERT INTO orders (order_no, customer_id, pickup_chain_id, status, shipping_address, sales_channel, shipping_fee, created_at)
			VALUES ($1,$2,$3,'pending','Jl Lama 1','normal',60,$4) RETURNING id`, fmt.Sprintf("GE-%s-%d", tag, i), cust, chain, dates[i]).Scan(&id); err != nil {
			t.Fatal(err)
		}
		db.QueryRow(ctx, `INSERT INTO order_items (order_id, variant_id, qty, price_at_order) VALUES ($1,$2,1,100) RETURNING id`, id, variant).Scan(&item)
		ids = append(ids, id)
		items = append(items, item)
	}
	t.Cleanup(func() {
		db.Exec(ctx, `UPDATE stock_buckets SET available_stock = available_stock - 100 WHERE variant_id=$1`, variant)
		db.Exec(ctx, `DELETE FROM order_shipment_groups WHERE shipping_fee_order_id = ANY($1)`, ids)
		db.Exec(ctx, `DELETE FROM order_items WHERE order_id = ANY($1)`, ids)
		db.Exec(ctx, `DELETE FROM order_status_log WHERE order_id = ANY($1)`, ids)
		db.Exec(ctx, `DELETE FROM activity_log WHERE entity_type='order' AND entity_id = ANY($1)`, ids)
		db.Exec(ctx, `DELETE FROM orders WHERE id = ANY($1)`, ids)
		db.Exec(ctx, `DELETE FROM customers WHERE id=$1`, cust)
		db.Exec(ctx, `DELETE FROM users WHERE id=$1`, user)
	})
	mh := &OrderMergeHandler{DB: db}
	rt := chi.NewRouter()
	rt.Post("/merge", mh.CreateGroup)
	rt.Get("/g/{id}", mh.GetGroup)
	rt.Put("/g/{id}", mh.UpdateGroup)
	rt.Put("/orders/{id}", (&OrderHandler{DB: db}).Edit)
	call := func(method, path string, body any) (int, []byte) {
		b, _ := json.Marshal(body)
		req := httptest.NewRequest(method, path, bytes.NewReader(b))
		req = req.WithContext(context.WithValue(req.Context(), appmw.ClaimsKey, &auth.Claims{UserID: user, Role: "super_user"}))
		w := httptest.NewRecorder()
		rt.ServeHTTP(w, req)
		return w.Code, w.Body.Bytes()
	}
	c, b := call("POST", "/merge", map[string]any{"order_ids": ids})
	if c != http.StatusCreated {
		t.Fatalf("merge: %d %s", c, b)
	}
	var created map[string]int
	json.Unmarshal(b, &created)
	gp := "/g/" + strconv.Itoa(created["id"])

	c, b = call("GET", gp, nil)
	var g mergeGroupView
	json.Unmarshal(b, &g)
	if c != 200 || len(g.Members) != 2 || len(g.Items) != 2 {
		t.Fatalf("get group: %d %s", c, b)
	}

	id0, id1 := items[0], items[1]
	price := 100.0
	body := func(newOrder int) map[string]any {
		return map[string]any{
			"customer":         map[string]any{"name": "Group Edit", "phone": "0900000444"},
			"shipping_address": "Jl Baru 9",
			"items": []map[string]any{
				{"id": id0, "variant_id": variant, "qty": 3, "price": price},
				{"id": id1, "variant_id": variant, "qty": 1, "price": price},
				{"order_id": newOrder, "variant_id": variant, "qty": 2, "price": price},
			},
		}
	}
	if c, b := call("PUT", gp, body(999999999)); c != http.StatusBadRequest {
		t.Fatalf("new item into a foreign order must be refused: %d %s", c, b)
	}
	if c, b := call("PUT", gp, body(ids[1])); c != 200 {
		t.Fatalf("update group: %d %s", c, b)
	}
	for i, id := range ids {
		var addr, created string
		var n, qty int
		db.QueryRow(ctx, `SELECT shipping_address, created_at::text FROM orders WHERE id=$1`, id).Scan(&addr, &created)
		db.QueryRow(ctx, `SELECT COUNT(*), COALESCE(SUM(qty),0) FROM order_items WHERE order_id=$1`, id).Scan(&n, &qty)
		if addr != "Jl Baru 9" {
			t.Fatalf("order %d address %q not synced", i, addr)
		}
		wantN, wantQty := 1, 3
		if i == 1 {
			wantN, wantQty = 2, 3 // original line (1) + new line (2) on the newer order
		}
		if n != wantN || qty != wantQty {
			t.Fatalf("order %d: %d lines / qty %d, want %d / %d", i, n, qty, wantN, wantQty)
		}
		var sameDate bool
		db.QueryRow(ctx, `SELECT created_at = $2::timestamptz FROM orders WHERE id=$1`, id, dates[i]).Scan(&sameDate)
		if !sameDate {
			t.Fatalf("order %d date moved (%s)", i, created)
		}
	}
	// emptying one order is refused (unmerge instead)
	empty := map[string]any{
		"customer": map[string]any{"name": "Group Edit", "phone": "0900000444"}, "shipping_address": "Jl Baru 9",
		"items": []map[string]any{{"id": id0, "variant_id": variant, "qty": 1, "price": price}},
	}
	if c, b := call("PUT", gp, empty); c != http.StatusBadRequest {
		t.Fatalf("emptying an order must be refused: %d %s", c, b)
	}
	// the plain order edit still refuses a delivery change on a member
	one := map[string]any{
		"customer": map[string]any{"name": "Group Edit", "phone": "0900000444"}, "pickup_chain_id": chain, "shipping_address": "Jl Lain 1",
		"items": []map[string]any{{"id": id0, "variant_id": variant, "qty": 3, "price": price}},
	}
	if c, b := call("PUT", "/orders/"+strconv.Itoa(ids[0]), one); c != http.StatusConflict {
		t.Fatalf("member edit must stay refused: %d %s", c, b)
	}
}
