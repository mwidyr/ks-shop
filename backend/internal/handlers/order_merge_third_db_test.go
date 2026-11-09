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

// A 3rd order of the same customer/store must still be offered for merging and join the existing 2-order group.
func TestThirdOrderJoinsExistingGroup(t *testing.T) {
	db := liveTestDB(t)
	ctx := context.Background()
	tag := strconv.FormatInt(time.Now().UnixNano(), 10)
	var user, cust, chain, variant int
	db.QueryRow(ctx, `INSERT INTO users (name, email, role_id, is_active) VALUES ('m3',$1,(SELECT id FROM roles WHERE name='cs'),true) RETURNING id`, "m3"+tag+"@t.local").Scan(&user)
	db.QueryRow(ctx, `INSERT INTO customers (name, phone) VALUES ('Third Test','0900000333') RETURNING id`).Scan(&cust)
	db.QueryRow(ctx, `SELECT id FROM pickup_chains WHERE chain_type='courier' ORDER BY id LIMIT 1`).Scan(&chain)
	db.QueryRow(ctx, `SELECT id FROM product_variants ORDER BY id LIMIT 1`).Scan(&variant)
	var ids []int
	for i := 1; i <= 3; i++ {
		var id int
		if err := db.QueryRow(ctx, `INSERT INTO orders (order_no, customer_id, pickup_chain_id, status, shipping_address, sales_channel, shipping_fee)
			VALUES ($1,$2,$3,'pending','Jl Tiga 1','normal',60) RETURNING id`, fmt.Sprintf("TH-%s-%d", tag, i), cust, chain).Scan(&id); err != nil {
			t.Fatal(err)
		}
		db.Exec(ctx, `INSERT INTO order_items (order_id, variant_id, qty, price_at_order) VALUES ($1,$2,1,100)`, id, variant)
		ids = append(ids, id)
	}
	t.Cleanup(func() {
		db.Exec(ctx, `DELETE FROM order_shipment_groups WHERE shipping_fee_order_id = ANY($1)`, ids)
		db.Exec(ctx, `DELETE FROM order_items WHERE order_id = ANY($1)`, ids)
		db.Exec(ctx, `DELETE FROM order_status_log WHERE order_id = ANY($1)`, ids)
		db.Exec(ctx, `DELETE FROM orders WHERE id = ANY($1)`, ids)
		db.Exec(ctx, `DELETE FROM customers WHERE id=$1`, cust)
		db.Exec(ctx, `DELETE FROM users WHERE id=$1`, user)
	})
	merge := &OrderMergeHandler{DB: db}
	rt := chi.NewRouter()
	rt.Get("/sug", merge.Suggestions)
	rt.Post("/merge", merge.CreateGroup)
	call := func(method, path string, body any) (int, []byte) {
		b, _ := json.Marshal(body)
		req := httptest.NewRequest(method, path, bytes.NewReader(b))
		req = req.WithContext(context.WithValue(req.Context(), appmw.ClaimsKey, &auth.Claims{UserID: user, Role: "super_user"}))
		w := httptest.NewRecorder()
		rt.ServeHTTP(w, req)
		return w.Code, w.Body.Bytes()
	}
	if c, b := call("POST", "/merge", map[string]any{"order_ids": ids[:2]}); c != http.StatusCreated {
		t.Fatalf("merge 2: %d %s", c, b)
	}
	findSug := func() []int {
		_, b := call("GET", "/sug", nil)
		var list []mergeSuggestion
		json.Unmarshal(b, &list)
		for _, s := range list {
			if s.CustomerID == cust {
				return s.OrderIDs
			}
		}
		return nil
	}
	if got := findSug(); len(got) != 3 {
		t.Fatalf("3rd order should be suggested together with the group, got %v", got)
	}
	// only the 3rd ticked in the UI: the group is pulled in automatically
	if c, b := call("POST", "/merge", map[string]any{"order_ids": []int{ids[0], ids[2]}}); c != http.StatusCreated {
		t.Fatalf("join: %d %s", c, b)
	}
	var groups, members int
	db.QueryRow(ctx, `SELECT COUNT(DISTINCT group_id), COUNT(*) FROM order_shipment_group_members WHERE order_id = ANY($1)`, ids).Scan(&groups, &members)
	if groups != 1 || members != 3 {
		t.Fatalf("groups=%d members=%d, want 1 and 3", groups, members)
	}
	if got := findSug(); got != nil {
		t.Fatalf("no suggestion expected after all merged, got %v", got)
	}
}
