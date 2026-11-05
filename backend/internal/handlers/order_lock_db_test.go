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

// Locked (exported / shipped) orders: who may edit, merge and unmerge them. Runs only with TEST_DATABASE_URL.
func TestExportedOrderLockRules(t *testing.T) {
	db := liveTestDB(t)
	ctx := context.Background()
	tag := strconv.FormatInt(time.Now().UnixNano(), 10)
	mkUser := func(name, role string, flag bool) int {
		var id int
		if err := db.QueryRow(ctx, `INSERT INTO users (name, email, role_id, is_active, can_edit_shipped_orders)
			VALUES ($1,$2,(SELECT id FROM roles WHERE name=$3),true,$4) RETURNING id`, name, name+tag+"@t.local", role, flag).Scan(&id); err != nil {
			t.Fatal(err)
		}
		return id
	}
	cs, wh, whNo := mkUser("lock-cs", "cs", false), mkUser("lock-wh", "warehouse", true), mkUser("lock-wh-no", "warehouse", false)
	var cust, chain, variant int
	db.QueryRow(ctx, `INSERT INTO customers (name, phone) VALUES ('Lock Test','0900000001') RETURNING id`).Scan(&cust)
	db.QueryRow(ctx, `SELECT id FROM pickup_chains WHERE chain_type='courier' ORDER BY id LIMIT 1`).Scan(&chain)
	db.QueryRow(ctx, `SELECT id FROM product_variants ORDER BY id LIMIT 1`).Scan(&variant)
	var ids []int
	for i := 1; i <= 2; i++ {
		var id int
		if err := db.QueryRow(ctx, `INSERT INTO orders (order_no, customer_id, pickup_chain_id, status, shipping_address, sales_channel, shipping_fee)
			VALUES ($1,$2,$3,'pending','Jl Lama 1','normal',60) RETURNING id`, fmt.Sprintf("LOCK-%s-%d", tag, i), cust, chain).Scan(&id); err != nil {
			t.Fatal(err)
		}
		db.Exec(ctx, `INSERT INTO order_items (order_id, variant_id, qty, price_at_order) VALUES ($1,$2,1,100)`, id, variant)
		ids = append(ids, id)
	}
	var batch int
	db.QueryRow(ctx, `INSERT INTO shipping_batches (batch_no, provider) VALUES ($1,'courier') RETURNING id`, "LOCK-B-"+tag).Scan(&batch)
	t.Cleanup(func() {
		db.Exec(ctx, `DELETE FROM order_shipment_groups WHERE shipping_fee_order_id = ANY($1)`, ids)
		db.Exec(ctx, `DELETE FROM shipping_batch_orders WHERE order_id = ANY($1)`, ids)
		db.Exec(ctx, `DELETE FROM shipping_batches WHERE id=$1`, batch)
		db.Exec(ctx, `DELETE FROM order_items WHERE order_id = ANY($1)`, ids)
		db.Exec(ctx, `DELETE FROM order_status_log WHERE order_id = ANY($1)`, ids)
		db.Exec(ctx, `DELETE FROM orders WHERE id = ANY($1)`, ids)
		db.Exec(ctx, `DELETE FROM customers WHERE id=$1`, cust)
		db.Exec(ctx, `DELETE FROM users WHERE id = ANY($1)`, []int{cs, wh, whNo})
	})

	merge := &OrderMergeHandler{DB: db}
	oh := &OrderHandler{DB: db}
	rt := chi.NewRouter()
	rt.Post("/merge", merge.CreateGroup)
	rt.Delete("/merge/{id}", merge.DeleteGroup)
	rt.Put("/orders/{id}", oh.Edit)
	call := func(user int, role, method, path string, body any) (int, string) {
		b, _ := json.Marshal(body)
		req := httptest.NewRequest(method, path, bytes.NewReader(b))
		req = req.WithContext(context.WithValue(req.Context(), appmw.ClaimsKey, &auth.Claims{UserID: user, Role: role}))
		w := httptest.NewRecorder()
		rt.ServeHTTP(w, req)
		return w.Code, w.Body.String()
	}
	expect := func(what string, got, want int, body string) {
		t.Helper()
		if got != want {
			t.Fatalf("%s: status %d, want %d (%s)", what, got, want, body)
		}
	}

	// merged while still pending: anybody with edit access may do it
	code, body := call(cs, "cs", "POST", "/merge", map[string]any{"order_ids": ids})
	expect("cs merges pending orders", code, http.StatusCreated, body)
	var grp int
	db.QueryRow(ctx, `SELECT group_id FROM order_shipment_group_members WHERE order_id=$1`, ids[0]).Scan(&grp)

	// exported through the Shipping Workbench: in a batch, exported_at set, shipped
	for i, id := range ids {
		db.Exec(ctx, `INSERT INTO shipping_batch_orders (batch_id, order_id, seq) VALUES ($1,$2,$3)`, batch, id, i+1)
		db.Exec(ctx, `UPDATE orders SET exported_at = now(), status = 'shipped' WHERE id=$1`, id)
	}
	code, body = call(cs, "cs", "DELETE", fmt.Sprintf("/merge/%d", grp), nil)
	expect("cs unmerges an exported group", code, http.StatusConflict, body)
	code, body = call(whNo, "warehouse", "DELETE", fmt.Sprintf("/merge/%d", grp), nil)
	expect("warehouse without the permission unmerges", code, http.StatusConflict, body)

	// editing: locked for cs, the recipient data may change for the permitted user, never items / amounts
	edit := func(user int, role string, mutate func(m map[string]any)) (int, string) {
		var itemID int
		db.QueryRow(ctx, `SELECT id FROM order_items WHERE order_id=$1`, ids[0]).Scan(&itemID)
		m := map[string]any{
			"customer": map[string]any{"name": "Lock Test", "phone": "0910204448", "apply_to_all": true}, "pickup_chain_id": chain, "shipping_address": "Jl Baru 2",
			"items": []map[string]any{{"id": itemID, "variant_id": variant, "qty": 1, "price": 100}}, "discount_amount": 0, "additional_amount": 0,
		}
		mutate(m)
		return call(user, role, "PUT", fmt.Sprintf("/orders/%d", ids[0]), m)
	}
	code, body = edit(cs, "cs", func(map[string]any) {})
	expect("cs edits an exported order", code, http.StatusConflict, body)
	code, body = edit(whNo, "warehouse", func(map[string]any) {})
	expect("warehouse without the permission edits", code, http.StatusConflict, body)
	// (a group member: its customer/address stay frozen until the group is dissolved)
	code, body = call(wh, "warehouse", "DELETE", fmt.Sprintf("/merge/%d", grp), nil)
	expect("permitted warehouse unmerges", code, http.StatusOK, body)
	code, body = edit(wh, "warehouse", func(m map[string]any) { m["items"].([]map[string]any)[0]["qty"] = 2 })
	expect("edit changing qty after shipping", code, http.StatusConflict, body)
	code, body = edit(wh, "warehouse", func(m map[string]any) { m["discount_amount"] = 10 })
	expect("edit changing the discount after shipping", code, http.StatusConflict, body)
	code, body = edit(wh, "warehouse", func(map[string]any) {})
	expect("permitted warehouse edits the address", code, http.StatusOK, body)
	var addr, status string
	db.QueryRow(ctx, `SELECT shipping_address, status FROM orders WHERE id=$1`, ids[0]).Scan(&addr, &status)
	if addr != "Jl Baru 2" || status != "shipped" {
		t.Fatalf("address %q status %q: want the new address and still shipped", addr, status)
	}

	// merged back (exported orders, same batch): only for the permitted user
	code, body = call(cs, "cs", "POST", "/merge", map[string]any{"order_ids": ids})
	expect("cs re-merges exported orders", code, http.StatusConflict, body)
	code, body = call(wh, "warehouse", "POST", "/merge", map[string]any{"order_ids": ids})
	expect("permitted warehouse re-merges", code, http.StatusCreated, body)
	// ... but never across batches
	call(wh, "warehouse", "DELETE", fmt.Sprintf("/merge/%d", mustGroup(ctx, db, ids[0])), nil)
	var other int
	db.QueryRow(ctx, `INSERT INTO shipping_batches (batch_no, provider) VALUES ($1,'courier') RETURNING id`, "LOCK-B2-"+tag).Scan(&other)
	t.Cleanup(func() { db.Exec(ctx, `DELETE FROM shipping_batches WHERE id=$1`, other) })
	db.Exec(ctx, `UPDATE shipping_batch_orders SET batch_id=$1 WHERE order_id=$2`, other, ids[1])
	code, body = call(wh, "warehouse", "POST", "/merge", map[string]any{"order_ids": ids})
	expect("re-merge across two batches", code, http.StatusConflict, body)
}

func mustGroup(ctx context.Context, db rowQuerier, orderID int) int {
	var g int
	db.QueryRow(ctx, `SELECT group_id FROM order_shipment_group_members WHERE order_id=$1`, orderID).Scan(&g)
	return g
}
