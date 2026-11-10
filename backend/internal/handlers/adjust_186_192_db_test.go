package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
)

// Runs only with TEST_DATABASE_URL (see liveTestDB): adjustments 190 (Shipping Workbench date filter,
// Completed Orders) and 191 (Upload History) against real SQL.
func TestAdjustments190And191AgainstDatabase(t *testing.T) {
	db := liveTestDB(t)
	ctx := context.Background()
	wb := &ShippingWorkbenchHandler{DB: db}
	ls := &LiveSessionHandler{DB: db}
	r := chi.NewRouter()
	r.Get("/shipping-workbench/overview", wb.Overview)
	r.Get("/live-sessions/upload-history", ls.UploadHistory)

	get := func(path string) (*httptest.ResponseRecorder, []byte) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
		return rec, rec.Body.Bytes()
	}

	if rec, _ := get("/shipping-workbench/overview?date_from=nope"); rec.Code != http.StatusBadRequest {
		t.Fatalf("bad date: got %d, want 400", rec.Code)
	}
	overview := func(q string) map[string]providerOverview {
		invalidateShippingCache()
		rec, body := get("/shipping-workbench/overview" + q)
		if rec.Code != http.StatusOK {
			t.Fatalf("overview%s: %d %s", q, rec.Code, body)
		}
		var list []providerOverview
		if err := json.Unmarshal(body, &list); err != nil {
			t.Fatal(err)
		}
		m := map[string]providerOverview{}
		for _, o := range list {
			m[o.Provider] = o
		}
		return m
	}
	all := overview("")
	past := overview("?date_from=1990-01-01&date_to=1990-01-02")
	for p, o := range past {
		if o.ReadyToExport+o.Insufficient+o.Problem+o.CreatedToday+o.Held+o.Processing+o.ReadyToShip+o.Shipped+o.Completed != 0 {
			t.Fatalf("%s: a range before any order must count nothing, got %+v", p, o)
		}
	}
	var delivered int
	if err := db.QueryRow(ctx, `SELECT COUNT(*) FROM orders o JOIN pickup_chains pc ON pc.id = o.pickup_chain_id WHERE o.status='delivered' AND pc.chain_type IN ('cvs_711','cvs_familymart','courier')`).Scan(&delivered); err != nil {
		t.Fatal(err)
	}
	sum := 0
	for _, o := range all {
		sum += o.Completed
	}
	if sum != delivered {
		t.Fatalf("completed over all time = %d, want %d delivered orders", sum, delivered)
	}

	// Upload History: a session with recorded LIVE data shows up, and the host filter narrows it.
	var hostID int
	if err := db.QueryRow(ctx, `INSERT INTO hosts (name, location_id) VALUES ('UploadHist Host', (SELECT id FROM host_locations ORDER BY id LIMIT 1)) RETURNING id`).Scan(&hostID); err != nil {
		t.Fatal(err)
	}
	defer db.Exec(ctx, `DELETE FROM live_sessions WHERE host_id=$1`, hostID)
	defer db.Exec(ctx, `DELETE FROM hosts WHERE id=$1`, hostID)
	if _, err := db.Exec(ctx, `INSERT INTO live_sessions (host_id, label, status, live_data_recorded_at) VALUES ($1,'x','ended',$2)`, hostID, time.Date(2026, 11, 9, 17, 5, 9, 0, time.UTC)); err != nil {
		t.Fatal(err)
	}
	rec, body := get("/live-sessions/upload-history?host_id=" + itoa(hostID))
	var res struct {
		Total int                `json:"total"`
		Items []uploadHistoryRow `json:"items"`
	}
	if rec.Code != http.StatusOK || json.Unmarshal(body, &res) != nil || res.Total != 1 || len(res.Items) != 1 || res.Items[0].HostName != "UploadHist Host" {
		t.Fatalf("upload history: %d %s", rec.Code, body)
	}
}
