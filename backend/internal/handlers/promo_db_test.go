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

// Runs only with TEST_DATABASE_URL (see liveTestDB): automatic and CS-only promotions, the audience rule, the usage
// records and gifts of an order, and CS changing the promotions of an existing order.
func TestPromotionEngineAgainstDatabase(t *testing.T) {
	db := liveTestDB(t)
	ctx := context.Background()
	sfx := strconv.FormatInt(time.Now().UnixNano()%1000000000, 10)
	must := func(err error) {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
	}
	var pa, pb, pg, va, vb, vg, cust, chain int
	must(db.QueryRow(ctx, `INSERT INTO products (name) VALUES ('T-Promo A') RETURNING id`).Scan(&pa))
	must(db.QueryRow(ctx, `INSERT INTO products (name) VALUES ('T-Promo B') RETURNING id`).Scan(&pb))
	must(db.QueryRow(ctx, `INSERT INTO products (name) VALUES ('T-Promo Gift') RETURNING id`).Scan(&pg))
	must(db.QueryRow(ctx, `INSERT INTO product_variants (product_id, sku, color, price) VALUES ($1,$2,'Black',500) RETURNING id`, pa, "T-PA-"+sfx).Scan(&va))
	must(db.QueryRow(ctx, `INSERT INTO product_variants (product_id, sku, color, price) VALUES ($1,$2,'White',300) RETURNING id`, pb, "T-PB-"+sfx).Scan(&vb))
	must(db.QueryRow(ctx, `INSERT INTO product_variants (product_id, sku, color, price) VALUES ($1,$2,'Red',150) RETURNING id`, pg, "T-PG-"+sfx).Scan(&vg))
	for _, v := range []int{va, vb, vg} {
		db.Exec(ctx, `INSERT INTO stock_buckets (variant_id) VALUES ($1) ON CONFLICT DO NOTHING`, v)
	}
	must(db.QueryRow(ctx, `INSERT INTO customers (name, phone) VALUES ('TPromo',$1) RETURNING id`, "08"+sfx).Scan(&cust))
	must(db.QueryRow(ctx, `SELECT id FROM pickup_chains WHERE chain_type='courier' LIMIT 1`).Scan(&chain))

	cfg := func(c promoConfig) string { b, _ := json.Marshal(c); return string(b) }
	var addonID, giftID, fixedID int
	must(db.QueryRow(ctx, `INSERT INTO promotions (name, type, auto_apply, combinable, config) VALUES ($1,'addon',true,true,$2::jsonb) RETURNING id`,
		"T add-on "+sfx, cfg(promoConfig{Trigger: promoMatcher{ProductIDs: []int{pa}}, Addon: promoMatcher{ProductIDs: []int{pb}}, AddonPrice: 100})).Scan(&addonID))
	must(db.QueryRow(ctx, `INSERT INTO promotions (name, type, audience, combinable, config) VALUES ($1,'buy_a_get_b','cs_only',true,$2::jsonb) RETURNING id`,
		"T cs gift "+sfx, cfg(promoConfig{Trigger: promoMatcher{ProductIDs: []int{pa}}, Gifts: []promoGiftOpt{{vg}}, MaxSets: 1})).Scan(&giftID))
	must(db.QueryRow(ctx, `INSERT INTO promotions (name, code, type, value, audience, combinable) VALUES ($1,$2,'fixed_amount',50,'cs_only',true) RETURNING id`,
		"T cs fixed "+sfx, "T-CS-"+sfx).Scan(&fixedID))
	var orderID int
	t.Cleanup(func() {
		db.Exec(ctx, `DELETE FROM promotion_redemptions WHERE promotion_id = ANY($1)`, []int{addonID, giftID, fixedID})
		if orderID > 0 {
			db.Exec(ctx, `DELETE FROM order_items WHERE order_id=$1`, orderID)
			db.Exec(ctx, `DELETE FROM orders WHERE id=$1`, orderID)
		}
		db.Exec(ctx, `DELETE FROM promotions WHERE id = ANY($1)`, []int{addonID, giftID, fixedID})
		db.Exec(ctx, `DELETE FROM product_variants WHERE id = ANY($1)`, []int{va, vb, vg})
		db.Exec(ctx, `DELETE FROM products WHERE id = ANY($1)`, []int{pa, pb, pg})
		db.Exec(ctx, `DELETE FROM customers WHERE id=$1`, cust)
	})

	// two A: one unlocks the add-on, the other is left for the gift (a unit feeds only one product promotion)
	items := []promoItem{{va, 2}, {vb, 1}}
	// a customer: only the automatic add-on applies; CS-only promotions are invisible even by code
	out, _, sub, msg, err := resolvePromotions(ctx, db, items, promoSelection{PickedIDs: []int{fixedID, giftID}}, &cust, 0, 60)
	must(err)
	if msg != "" || sub != 1300 || len(out.Applied) != 1 || out.Applied[0].PromotionID != addonID || out.Discount != 200 {
		t.Fatalf("customer view: msg=%q sub=%v %+v", msg, sub, out)
	}
	if _, _, _, msg, _ := resolvePromotions(ctx, db, items, promoSelection{Code: "T-CS-" + sfx}, &cust, 0, 60); msg == "" {
		t.Fatal("a customer must not be able to use a CS-only code")
	}
	// the website checkout (priceCart) uses the same engine: the automatic add-on is in the quote, a CS-only code is refused
	q, pmsg := priceCart(ctx, db, storeQuoteRequest{Items: []storeCartItem{{va, 2}, {vb, 1}}}, false)
	if pmsg != "" || q.Subtotal != 1300 || q.Discount != 200 || len(q.Promotions) != 1 || q.Promotions[0].PromotionID != addonID || q.Total != 1100 {
		t.Fatalf("website quote: msg=%q %+v", pmsg, q)
	}
	q, _ = priceCart(ctx, db, storeQuoteRequest{Items: []storeCartItem{{va, 2}, {vb, 1}}, PromotionCode: "T-CS-" + sfx}, false)
	if q.PromotionError == "" || q.Discount != 200 {
		t.Fatalf("a CS-only code is refused on the website but the automatic promotion stays: %+v", q)
	}
	if _, m := priceCart(ctx, db, storeQuoteRequest{Items: []storeCartItem{{va, 2}}, PromotionCode: "T-CS-" + sfx}, true); m == "" {
		t.Fatal("strict checkout must refuse a CS-only code")
	}
	// CS: picks the fixed discount and the gift
	out, _, _, msg, err = resolvePromotions(ctx, db, items, promoSelection{PickedIDs: []int{fixedID, giftID}, Staff: true}, &cust, 0, 60)
	must(err)
	if msg != "" || len(out.Applied) != 3 || out.Discount != 250 || len(out.Gifts) != 1 || out.Gifts[0].VariantID != vg {
		t.Fatalf("staff view: msg=%q %+v", msg, out)
	}
	if csReasonProblem(out, "") == "" || csReasonProblem(out, "after_sales") != "" || csReasonProblem(out, "bogus") == "" {
		t.Fatal("a CS-only promotion needs a valid reason")
	}
	// CS removes the automatic add-on
	out, _, _, _, _ = resolvePromotions(ctx, db, items, promoSelection{PickedIDs: []int{fixedID}, ExcludedIDs: []int{addonID}, Staff: true}, &cust, 0, 60)
	if len(out.Applied) != 1 || out.Discount != 50 {
		t.Fatalf("excluded auto promotion: %+v", out)
	}

	// an order that exists, then CS changes its promotions
	must(db.QueryRow(ctx, `INSERT INTO orders (order_no, customer_id, pickup_chain_id, status, shipping_address, sales_channel, shipping_fee)
		VALUES ($1,$2,$3,'pending','x','normal',60) RETURNING id`, "T-PROMO-"+sfx, cust, chain).Scan(&orderID))
	db.Exec(ctx, `INSERT INTO order_items (order_id, variant_id, qty, price_at_order) VALUES ($1,$2,2,500),($1,$3,1,300)`, orderID, va, vb)

	h := &OrderHandler{DB: db}
	r := chi.NewRouter()
	r.Put("/orders/{id}/promotions", h.UpdatePromotions)
	r2 := chi.NewRouter()
	r2.Put("/orders/{id}", h.Edit)
	put := func(body any) (*httptest.ResponseRecorder, map[string]any) {
		b, _ := json.Marshal(body)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest(http.MethodPut, "/orders/"+strconv.Itoa(orderID)+"/promotions", bytes.NewReader(b)))
		var o map[string]any
		_ = json.Unmarshal(rec.Body.Bytes(), &o)
		return rec, o
	}
	count := func(q string) (n int) { db.QueryRow(ctx, q, orderID).Scan(&n); return }

	if rec, _ := put(map[string]any{"promotion_ids": []int{fixedID, giftID}}); rec.Code != http.StatusBadRequest {
		t.Fatalf("missing reason must be refused: %d %s", rec.Code, rec.Body)
	}
	if rec, o := put(map[string]any{"promotion_ids": []int{fixedID, giftID}, "reason": "compensation"}); rec.Code != http.StatusOK || o["discount"].(float64) != 250 {
		t.Fatalf("apply: %d %s", rec.Code, rec.Body)
	}
	if n := count(`SELECT COUNT(*) FROM promotion_redemptions WHERE order_id=$1`); n != 3 {
		t.Fatalf("3 usage records, got %d", n)
	}
	if n := count(`SELECT COUNT(*) FROM order_items WHERE order_id=$1 AND is_gift AND price_at_order=0`); n != 1 {
		t.Fatalf("one free gift item, got %d", n)
	}
	var disc float64
	db.QueryRow(ctx, `SELECT promotion_discount_amount FROM orders WHERE id=$1`, orderID).Scan(&disc)
	if disc != 250 {
		t.Fatalf("order discount %v", disc)
	}
	// Edit Order: removing one product decides the promotions again (the gift needs the second A, so it goes away)
	var itemA int
	db.QueryRow(ctx, `SELECT id FROM order_items WHERE order_id=$1 AND variant_id=$2 AND NOT is_gift`, orderID, va).Scan(&itemA)
	var itemB int
	db.QueryRow(ctx, `SELECT id FROM order_items WHERE order_id=$1 AND variant_id=$2`, orderID, vb).Scan(&itemB)
	var giftItem int
	db.QueryRow(ctx, `SELECT id FROM order_items WHERE order_id=$1 AND is_gift`, orderID).Scan(&giftItem)
	edit := func(items []map[string]any) *httptest.ResponseRecorder {
		b, _ := json.Marshal(map[string]any{
			"customer": map[string]any{"name": "TPromo", "phone": "08" + sfx}, "shipping_address": "x", "pickup_chain_id": chain, "items": items,
		})
		req := httptest.NewRequest(http.MethodPut, "/orders/"+strconv.Itoa(orderID), bytes.NewReader(b))
		req = req.WithContext(context.WithValue(req.Context(), appmw.ClaimsKey, &auth.Claims{UserID: 1, Name: "Tester", Role: "super_user"}))
		rec := httptest.NewRecorder()
		r2.ServeHTTP(rec, req)
		return rec
	}
	if rec := edit([]map[string]any{{"id": giftItem, "variant_id": vg, "qty": 1}, {"id": itemA, "variant_id": va, "qty": 1}, {"id": itemB, "variant_id": vb, "qty": 1}}); rec.Code == http.StatusOK {
		t.Fatal("a gift line must not be editable as an ordinary line")
	}
	if rec := edit([]map[string]any{{"id": itemA, "variant_id": va, "qty": 1}, {"id": itemB, "variant_id": vb, "qty": 1}}); rec.Code != http.StatusOK {
		t.Fatalf("edit order: %d %s", rec.Code, rec.Body)
	}
	if n := count(`SELECT COUNT(*) FROM order_items WHERE order_id=$1 AND is_gift`); n != 0 {
		t.Fatalf("the gift must be gone after removing the second A, got %d", n)
	}
	if n := count(`SELECT COUNT(*) FROM promotion_redemptions WHERE order_id=$1`); n != 2 {
		t.Fatalf("add-on + fixed discount remain, got %d", n)
	}
	// removing everything restores the order
	put(map[string]any{"promotion_ids": []int{fixedID, giftID}, "reason": "compensation"})
	put(map[string]any{"promotion_ids": []int{fixedID, giftID}, "reason": "compensation"})
	if n := count(`SELECT COUNT(*) FROM order_items WHERE order_id=$1`); n != 2 {
		t.Fatalf("1 A left: the add-on takes it, no gift, and nothing is duplicated by applying twice; got %d items", n)
	}
	if rec, _ := put(map[string]any{"excluded_promotion_ids": []int{addonID}}); rec.Code != http.StatusOK {
		t.Fatalf("clear: %d %s", rec.Code, rec.Body)
	}
	if count(`SELECT COUNT(*) FROM promotion_redemptions WHERE order_id=$1`) != 0 || count(`SELECT COUNT(*) FROM order_items WHERE order_id=$1`) != 2 {
		t.Fatal("promotions and the gift must be gone")
	}
	db.QueryRow(ctx, `SELECT promotion_discount_amount FROM orders WHERE id=$1`, orderID).Scan(&disc)
	if disc != 0 {
		t.Fatalf("order discount after clearing: %v", disc)
	}
	// once processing has started the promotions are locked
	db.Exec(ctx, `UPDATE orders SET status='processing' WHERE id=$1`, orderID)
	if rec, _ := put(map[string]any{}); rec.Code != http.StatusConflict {
		t.Fatalf("locked after pending: %d", rec.Code)
	}
}
