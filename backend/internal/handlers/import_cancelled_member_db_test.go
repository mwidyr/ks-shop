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

// Runs only with TEST_DATABASE_URL (see liveTestDB): ORD-…1934 case. An order merged with a CANCELLED order (which is in
// no batch) must still get the platform result of its 7-11 file; the cancelled member must not reject the whole row.
func TestImportIgnoresCancelledMemberOfMergedShipment(t *testing.T) {
	db := liveTestDB(t)
	ctx := context.Background()
	sfx := strconv.FormatInt(time.Now().UnixNano()%1000000000, 10)
	must := func(err error) {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
	}
	var userID, cust, c711, batch, group int
	must(db.QueryRow(ctx, `SELECT id FROM users ORDER BY id LIMIT 1`).Scan(&userID))
	must(db.QueryRow(ctx, `INSERT INTO customers (name, phone) VALUES ('TImp',$1) RETURNING id`, "08"+sfx).Scan(&cust))
	must(db.QueryRow(ctx, `SELECT id FROM pickup_chains WHERE chain_type='cvs_711' LIMIT 1`).Scan(&c711))
	must(db.QueryRow(ctx, `INSERT INTO shipping_batches (batch_no, provider) VALUES ($1,'cvs_711') RETURNING id`, "T-IMP-"+sfx).Scan(&batch))
	newOrder := func(suffix, status string) (id int, no string) {
		no = "T-IMP-" + sfx + "-" + suffix
		must(db.QueryRow(ctx, `INSERT INTO orders (order_no, customer_id, pickup_chain_id, pickup_store_code, status, shipping_address, sales_channel, shipping_fee, exported_at)
			VALUES ($1,$2,$3,'123456',$4,'x','normal',0,now()) RETURNING id`, no, cust, c711, status).Scan(&id))
		return
	}
	live, liveNo := newOrder("A", "processing")
	dead, _ := newOrder("B", "cancelled")
	_, err := db.Exec(ctx, `INSERT INTO shipping_batch_orders (batch_id, order_id, seq, create_result, last_error) VALUES ($1,$2,1,'failed','Confirmed by staff: not created on the platform')`, batch, live)
	must(err)
	must(db.QueryRow(ctx, `INSERT INTO order_shipment_groups (shipping_fee_order_id) VALUES ($1) RETURNING id`, live).Scan(&group))
	_, err = db.Exec(ctx, `INSERT INTO order_shipment_group_members (group_id, order_id) VALUES ($1,$2),($1,$3)`, group, live, dead)
	must(err)
	t.Cleanup(func() {
		db.Exec(ctx, `DELETE FROM shipping_import_issues WHERE order_id = ANY($1)`, []int{live, dead})
		db.Exec(ctx, `DELETE FROM shipping_import_log WHERE batch_id=$1`, batch)
		db.Exec(ctx, `DELETE FROM order_shipment_groups WHERE id=$1`, group)
		for _, o := range []int{live, dead} {
			db.Exec(ctx, `DELETE FROM shipping_batch_orders WHERE order_id=$1`, o)
			db.Exec(ctx, `DELETE FROM order_status_log WHERE order_id=$1`, o)
			db.Exec(ctx, `DELETE FROM orders WHERE id=$1`, o)
		}
		db.Exec(ctx, `DELETE FROM shipping_batches WHERE id=$1`, batch)
		db.Exec(ctx, `DELETE FROM customers WHERE id=$1`, cust)
	})

	h := &ShippingWorkbenchHandler{DB: db}
	r := chi.NewRouter()
	r.Post("/imports", h.Import)
	body, _ := json.Marshal(map[string]any{
		"kind": "711_export", "batch_id": batch, "file_name": "t.xlsx", "file_hash": "t-" + sfx,
		"records": []map[string]any{{"row": 4, "order_no": liveNo, "platform_order_no": "CM2611132844895", "shipping_no": "H58779745868"}},
	})
	req := httptest.NewRequest(http.MethodPost, "/imports", bytes.NewReader(body))
	req = req.WithContext(context.WithValue(req.Context(), appmw.ClaimsKey, &auth.Claims{UserID: userID, Name: "Tester", Role: "warehouse"}))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("import: %d %s", rec.Code, rec.Body)
	}
	var out struct {
		Summary importSummary `json:"summary"`
	}
	must(json.Unmarshal(rec.Body.Bytes(), &out))
	if out.Summary.Unmatched != 0 || out.Summary.Updated != 1 {
		t.Fatalf("the live order is updated, nothing is 'unmatched': %+v", out.Summary)
	}
	var platformNo, trackingNo, status, result string
	must(db.QueryRow(ctx, `SELECT COALESCE(o.platform_order_no,''), COALESCE(o.tracking_number,''), o.status, COALESCE(sbo.create_result,'')
		FROM orders o JOIN shipping_batch_orders sbo ON sbo.order_id = o.id WHERE o.id=$1`, live).Scan(&platformNo, &trackingNo, &status, &result))
	if platformNo != "CM2611132844895" || trackingNo != "H58779745868" || result != "created" || status != "ready_to_ship" {
		t.Fatalf("platform result applied: %s %s %s %s", platformNo, trackingNo, result, status)
	}
	var deadPlatform string
	db.QueryRow(ctx, `SELECT COALESCE(platform_order_no,'') FROM orders WHERE id=$1`, dead).Scan(&deadPlatform)
	if deadPlatform != "" {
		t.Fatal("the cancelled member is left alone")
	}
}
