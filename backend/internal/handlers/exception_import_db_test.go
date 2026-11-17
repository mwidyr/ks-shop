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

// Runs only with TEST_DATABASE_URL (see liveTestDB): 7-ELEVEN expired labels and unclaimed returns.
func TestShippingExceptionImports(t *testing.T) {
	db := liveTestDB(t)
	ctx := context.Background()
	sfx := strconv.FormatInt(time.Now().UnixNano()%1000000000, 10)
	must := func(err error) {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
	}
	var userID, product, variant, cust, cust2, c711, batch int
	must(db.QueryRow(ctx, `SELECT id FROM users ORDER BY id LIMIT 1`).Scan(&userID))
	must(db.QueryRow(ctx, `INSERT INTO products (name) VALUES ('T-Exc product') RETURNING id`).Scan(&product))
	must(db.QueryRow(ctx, `INSERT INTO product_variants (product_id, sku, price) VALUES ($1,$2,100) RETURNING id`, product, "T-EXC-"+sfx).Scan(&variant))
	_, err := db.Exec(ctx, `INSERT INTO stock_buckets (variant_id, available_stock) VALUES ($1, 10) ON CONFLICT (variant_id) DO UPDATE SET available_stock = 10`, variant)
	must(err)
	phone := "09" + sfx
	must(db.QueryRow(ctx, `INSERT INTO customers (name, phone) VALUES ('TExc',$1) RETURNING id`, phone).Scan(&cust))
	must(db.QueryRow(ctx, `INSERT INTO customers (name, phone) VALUES ('TExc twin',$1) RETURNING id`, phone).Scan(&cust2))
	must(db.QueryRow(ctx, `SELECT id FROM pickup_chains WHERE chain_type='cvs_711' LIMIT 1`).Scan(&c711))
	must(db.QueryRow(ctx, `INSERT INTO shipping_batches (batch_no, provider) VALUES ($1,'cvs_711') RETURNING id`, "T-EXC-"+sfx).Scan(&batch))
	var orders []int
	newOrder := func(status, platformNo, shippingNo string, deducted bool) (id int, no string) {
		no = "T-EXC-" + sfx + "-" + strconv.Itoa(len(orders))
		must(db.QueryRow(ctx, `INSERT INTO orders (order_no, customer_id, pickup_chain_id, pickup_store_code, status, shipping_address, sales_channel, shipping_fee, exported_at, platform_order_no, tracking_number)
			VALUES ($1,$2,$3,'123456',$4,'x','normal',0,now(),NULLIF($5,''),NULLIF($6,'')) RETURNING id`, no, cust, c711, status, platformNo, shippingNo).Scan(&id))
		orders = append(orders, id)
		_, err := db.Exec(ctx, `INSERT INTO order_items (order_id, variant_id, qty, price_at_order) VALUES ($1,$2,2,100)`, id, variant)
		must(err)
		_, err = db.Exec(ctx, `INSERT INTO shipping_batch_orders (batch_id, order_id, seq, create_result) VALUES ($1,$2,$3,'created')`, batch, id, len(orders))
		must(err)
		if deducted {
			_, err = db.Exec(ctx, `INSERT INTO stock_movements (variant_id, order_id, bucket_from, bucket_to, qty, event_type) VALUES ($1,$2,'available_stock','(shipped)',2,'shipment_deducted')`, variant, id)
			must(err)
			_, err = db.Exec(ctx, `UPDATE stock_buckets SET available_stock = available_stock - 2 WHERE variant_id=$1`, variant)
			must(err)
		}
		return
	}
	t.Cleanup(func() {
		for _, o := range orders {
			db.Exec(ctx, `DELETE FROM shipping_import_issues WHERE order_id=$1`, o)
			db.Exec(ctx, `DELETE FROM order_export_log WHERE order_id=$1`, o)
			db.Exec(ctx, `DELETE FROM stock_movements WHERE order_id=$1`, o)
			db.Exec(ctx, `DELETE FROM activity_log WHERE entity_type='order' AND entity_id=$1`, o)
			db.Exec(ctx, `DELETE FROM shipping_batch_orders WHERE order_id=$1`, o)
			db.Exec(ctx, `DELETE FROM order_status_log WHERE order_id=$1`, o)
			db.Exec(ctx, `DELETE FROM order_items WHERE order_id=$1`, o)
			db.Exec(ctx, `DELETE FROM orders WHERE id=$1`, o)
		}
		db.Exec(ctx, `DELETE FROM shipping_import_log WHERE file_hash LIKE $1`, "t-exc-"+sfx+"%")
		db.Exec(ctx, `DELETE FROM shipping_batches WHERE id=$1`, batch)
		db.Exec(ctx, `DELETE FROM activity_log WHERE entity_type='customer' AND entity_id = ANY($1)`, []int{cust, cust2})
		db.Exec(ctx, `DELETE FROM customers WHERE id = ANY($1)`, []int{cust, cust2})
		db.Exec(ctx, `DELETE FROM product_variants WHERE id=$1`, variant)
		db.Exec(ctx, `DELETE FROM products WHERE id=$1`, product)
	})

	h := &ShippingWorkbenchHandler{DB: db}
	r := chi.NewRouter()
	r.Post("/imports", h.Import)
	r.Get("/batches/{id}/export-rows", h.ExportRows)
	r.Post("/batches/{id}/exports", h.RecordExport)
	do := func(method, path string, body any) (*httptest.ResponseRecorder, []byte) {
		b, _ := json.Marshal(body)
		req := httptest.NewRequest(method, path, bytes.NewReader(b))
		req = req.WithContext(context.WithValue(req.Context(), appmw.ClaimsKey, &auth.Claims{UserID: userID, Name: "Tester", Role: "warehouse"}))
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		return rec, rec.Body.Bytes()
	}
	seq := 0
	importKind := func(kind string, records ...map[string]any) importSummary {
		t.Helper()
		seq++
		rec, raw := do(http.MethodPost, "/imports", map[string]any{"kind": kind, "file_name": "t.xlsx", "file_hash": "t-exc-" + sfx + strconv.Itoa(seq), "records": records})
		if rec.Code != http.StatusOK {
			t.Fatalf("%s import: %d %s", kind, rec.Code, raw)
		}
		var out struct {
			Summary importSummary `json:"summary"`
		}
		must(json.Unmarshal(raw, &out))
		return out.Summary
	}
	stock := func() (n int) {
		db.QueryRow(ctx, `SELECT available_stock FROM stock_buckets WHERE variant_id=$1`, variant).Scan(&n)
		return
	}
	type snap struct {
		status, platform, shipping, result string
		expired, reissued                  bool
	}
	get := func(id int) (s snap) {
		db.QueryRow(ctx, `SELECT o.status, COALESCE(o.platform_order_no,''), COALESCE(o.tracking_number,''), COALESCE(sbo.create_result,''),
			o.label_expired_at IS NOT NULL, o.label_reissued_at IS NOT NULL
			FROM orders o JOIN shipping_batch_orders sbo ON sbo.order_id = o.id WHERE o.id=$1`, id).Scan(&s.status, &s.platform, &s.shipping, &s.result, &s.expired, &s.reissued)
		return
	}

	// ---- expired label -------------------------------------------------------------------------------
	x, xNo := newOrder("ready_to_ship", "CM100"+sfx, "G100"+sfx, false)
	before := stock()
	rec711 := func(no, cm string) map[string]any {
		return map[string]any{"row": 4, "order_no": no, "platform_order_no": cm}
	}

	// both identifiers must match: a wrong platform number is reported, nothing changes
	if s := importKind("711_expired", rec711(xNo, "CM-WRONG")); s.Unmatched != 1 || s.Updated != 0 || get(x).expired {
		t.Fatalf("mismatch must be skipped: %+v", s)
	}
	if s := importKind("711_expired", rec711(xNo, "CM100"+sfx), rec711(xNo, "CM100"+sfx)); s.Updated != 1 || s.Expired != 1 {
		t.Fatalf("expire (duplicate row once): %+v", s)
	}
	if g := get(x); !g.expired || g.platform != "" || g.shipping != "" || g.result != "" || g.status != "processing" {
		t.Fatalf("label expired: numbers cleared, back to Processing, still in its batch: %+v", g)
	}
	if stock() != before {
		t.Fatalf("stock must not change")
	}
	if s := importKind("711_expired", rec711(xNo, "CM100"+sfx)); s.Updated != 0 || s.Unmatched != 0 {
		t.Fatalf("same file again changes nothing: %+v", s)
	}
	// the expired export contains only orders that need a number
	_, raw := do(http.MethodGet, "/batches/"+strconv.Itoa(batch)+"/export-rows?kind=expired", nil)
	var rows struct {
		Rows []struct {
			OrderIDs []int `json:"order_ids"`
		} `json:"rows"`
	}
	must(json.Unmarshal(raw, &rows))
	if len(rows.Rows) != 1 || rows.Rows[0].OrderIDs[0] != x {
		t.Fatalf("expired export rows: %s", raw)
	}
	// an old file must not hand the expired number back
	if s := importKind("711_validation", map[string]any{"row": 4, "order_no": xNo, "result_text": "檢核通過，訂單編號: CM100" + sfx}); s.Updated != 0 || !get(x).expired {
		t.Fatalf("old number is refused: %+v", s)
	}
	// new number: leaves the expired list, back to Ready to Ship, waits for the priority 3PL file
	if s := importKind("711_validation", map[string]any{"row": 4, "order_no": xNo, "result_text": "檢核通過，訂單編號: CM200" + sfx}); s.Updated != 1 {
		t.Fatalf("new number: %+v", s)
	}
	if g := get(x); g.expired || !g.reissued || g.platform != "CM200"+sfx || g.status != "ready_to_ship" || g.result != "created" {
		t.Fatalf("reissued: %+v", g)
	}
	// the normal 3PL file skips it, the priority file has it, recording it ships it once
	_, raw = do(http.MethodGet, "/batches/"+strconv.Itoa(batch)+"/export-rows?kind=3pl_packing", nil)
	must(json.Unmarshal(raw, &rows))
	if len(rows.Rows) != 0 {
		t.Fatalf("the normal 3PL file must skip a reissued order: %s", raw)
	}
	_, raw = do(http.MethodGet, "/batches/"+strconv.Itoa(batch)+"/export-rows?kind=3pl_reship", nil)
	must(json.Unmarshal(raw, &rows))
	if len(rows.Rows) != 1 {
		t.Fatalf("priority file rows: %s", raw)
	}
	if rec, raw := do(http.MethodPost, "/batches/"+strconv.Itoa(batch)+"/exports", map[string]any{"kind": "3pl_reship", "order_ids": []int{x}}); rec.Code != http.StatusOK {
		t.Fatalf("record reship: %d %s", rec.Code, raw)
	}
	if g := get(x); g.reissued || g.status != "shipped" {
		t.Fatalf("after the priority file: %+v", g)
	}
	if stock() != before-2 { // shipped now: deducted exactly once
		t.Fatalf("stock after shipping once: %d want %d", stock(), before-2)
	}

	// ---- unclaimed return ----------------------------------------------------------------------------
	y, yNo := newOrder("shipped", "CM300"+sfx, "G300"+sfx, true)
	w, wNo := newOrder("processing", "CM400"+sfx, "", false)
	before = stock()
	s := importKind("711_unclaimed", rec711(yNo, "CM300"+sfx), rec711(wNo, "CM400"+sfx), rec711(yNo, "CM-WRONG"))
	if s.Returned != 1 || s.Blacklisted != 1 || s.Unmatched != 1 {
		t.Fatalf("unclaimed: %+v", s)
	}
	if g := get(y); g.status != "return" {
		t.Fatalf("returned: %+v", g)
	}
	if g := get(w); g.status != "processing" {
		t.Fatalf("an order that never shipped is left alone: %+v", g)
	}
	if stock() != before+2 {
		t.Fatalf("stock restored: %d want %d", stock(), before+2)
	}
	var labels int
	db.QueryRow(ctx, `SELECT COUNT(*) FROM customer_labels WHERE label='blacklist' AND customer_id = ANY($1)`, []int{cust, cust2}).Scan(&labels)
	if labels != 2 {
		t.Fatalf("blacklisted by phone (both records), got %d", labels)
	}
	// importing again: no second restock, nothing changes
	if s = importKind("711_unclaimed", rec711(yNo, "CM300"+sfx)); s.Updated != 0 || stock() != before+2 {
		t.Fatalf("repeat import: %+v stock=%d", s, stock())
	}
	_ = y
}
