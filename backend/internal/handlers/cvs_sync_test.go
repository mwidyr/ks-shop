package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRunStatus(t *testing.T) {
	e := []syncError{{City: "台北市", Area: "中正區", Error: "boom"}}
	cases := []struct {
		name string
		in   syncChainSummary
		want string
	}{
		{"clean", syncChainSummary{Status: "success", Count: 7000}, "success"},
		{"some regions failed", syncChainSummary{Status: "failed", Count: 6900, Errors: e}, "partial"},
		{"nothing fetched", syncChainSummary{Status: "failed", Count: 0, Errors: e}, "failed"},
		{"low count no errors", syncChainSummary{Status: "failed", Count: 100}, "failed"},
		{"success flag but errors", syncChainSummary{Status: "success", Count: 7000, Errors: e}, "partial"},
	}
	for _, c := range cases {
		if got := runStatus(c.in); got != c.want {
			t.Errorf("%s: got %s want %s", c.name, got, c.want)
		}
	}
}

func TestSyncStoreDecoding(t *testing.T) {
	var s []syncStore
	raw := `[{"chain":"familymart","store_id":24080,"name":"全家","longitude":"121.5","latitude":25.04},
	         {"chain":"7eleven","store_id":"123456","name":"7-11","longitude":"","latitude":null,"phone":null}]`
	if err := json.Unmarshal([]byte(raw), &s); err != nil {
		t.Fatal(err)
	}
	if s[0].StoreID != "24080" || !s[0].Longitude.Valid || s[0].Longitude.Val != 121.5 || s[0].Latitude.Val != 25.04 {
		t.Errorf("number/string coercion: %+v", s[0])
	}
	if s[1].Longitude.Valid || s[1].Latitude.Valid || s[1].Phone != "" {
		t.Errorf("empty/null coordinates: %+v", s[1])
	}
}

func TestValidateStores(t *testing.T) {
	ok := []syncStore{{Chain: "7eleven", StoreID: "1", Name: "a"}, {Chain: "7eleven", StoreID: "2", Name: "b"}}
	if msg := validateStores("7eleven", ok); msg != "" {
		t.Errorf("valid rejected: %s", msg)
	}
	bad := map[string][]syncStore{
		"wrong chain": {{Chain: "familymart", StoreID: "1", Name: "a"}},
		"empty id":    {{Chain: "7eleven", StoreID: "", Name: "a"}},
		"long id":     {{Chain: "7eleven", StoreID: "12345678901", Name: "a"}},
		"empty name":  {{Chain: "7eleven", StoreID: "1"}},
		"duplicate":   {{Chain: "7eleven", StoreID: "1", Name: "a"}, {Chain: "7eleven", StoreID: "1", Name: "b"}},
	}
	for name, st := range bad {
		if validateStores("7eleven", st) == "" {
			t.Errorf("%s accepted", name)
		}
	}
}

func TestCvsSyncAuth(t *testing.T) {
	post := func(h *CvsSyncHandler, auth string) int {
		req := httptest.NewRequest(http.MethodPost, "/api/internal/cvs-sync", strings.NewReader(`{}`))
		if auth != "" {
			req.Header.Set("Authorization", auth)
		}
		w := httptest.NewRecorder()
		h.Import(w, req)
		return w.Code
	}
	if c := post(&CvsSyncHandler{Token: ""}, "Bearer "); c != http.StatusUnauthorized {
		t.Errorf("empty configured token must reject everything, got %d", c)
	}
	h := &CvsSyncHandler{Token: "s3cret"}
	if c := post(h, ""); c != http.StatusUnauthorized {
		t.Errorf("missing header: %d", c)
	}
	if c := post(h, "Bearer wrong"); c != http.StatusUnauthorized {
		t.Errorf("wrong token: %d", c)
	}
	if c := post(h, "Bearer s3cret"); c != http.StatusUnprocessableEntity {
		t.Errorf("right token, empty summary should 422 before touching the DB, got %d", c)
	}
}

func syncBody(t *testing.T, v any) *bytes.Reader {
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return bytes.NewReader(b)
}

// Runs only with TEST_DATABASE_URL (see liveTestDB).
func TestCvsSyncAgainstDatabase(t *testing.T) {
	db := liveTestDB(t)
	ctx := context.Background()
	db.Exec(ctx, `DELETE FROM cvs_sync_runs`)
	db.Exec(ctx, `DELETE FROM cvs_stores WHERE store_code LIKE 'T%'`)
	t.Cleanup(func() {
		db.Exec(ctx, `DELETE FROM cvs_sync_runs`)
		db.Exec(ctx, `DELETE FROM cvs_stores WHERE store_code LIKE 'T%'`)
	})
	h := &CvsSyncHandler{DB: db, Token: "tok"}
	send := func(payload any) (int, string) {
		req := httptest.NewRequest(http.MethodPost, "/api/internal/cvs-sync", syncBody(t, payload))
		req.Header.Set("Authorization", "Bearer tok")
		w := httptest.NewRecorder()
		h.Import(w, req)
		return w.Code, w.Body.String()
	}
	store := func(chain, id, name string) map[string]any {
		return map[string]any{"chain": chain, "store_id": id, "name": name, "address": "addr", "city": "台北市", "district": "中正區", "phone": "02", "longitude": "121.5", "latitude": 25.0}
	}
	count := func(chain string) (n int) {
		db.QueryRow(ctx, `SELECT COUNT(*) FROM cvs_stores WHERE chain_type=$1 AND store_code LIKE 'T%'`, chain).Scan(&n)
		return
	}

	// 1. both chains succeed
	code, body := send(map[string]any{
		"generated_at": "2026-11-24T03:00:00+08:00",
		"stores":       []any{store("7eleven", "T00001", "A"), store("7eleven", "T00002", "B"), store("familymart", "T00003", "C")},
		"summary": map[string]any{
			"7eleven":    map[string]any{"status": "success", "count": 2, "errors": []any{}},
			"familymart": map[string]any{"status": "success", "count": 1, "errors": []any{}},
		},
	})
	if code != 200 || count("cvs_711") != 2 || count("cvs_familymart") != 1 {
		t.Fatalf("first import: %d %s", code, body)
	}

	// 2. FamilyMart fails: its stores stay, 7-ELEVEN still updates, failure is recorded
	code, body = send(map[string]any{
		"generated_at": "2026-11-25T03:00:00+08:00",
		"stores":       []any{store("7eleven", "T00001", "A renamed"), store("7eleven", "T00002", "B"), store("7eleven", "T00004", "D")},
		"summary": map[string]any{
			"7eleven":    map[string]any{"status": "success", "count": 3, "errors": []any{}},
			"familymart": map[string]any{"status": "failed", "count": 900, "errors": []any{map[string]any{"city": "台北市", "area": "中正區", "error": "HTTP 503"}}},
		},
	})
	if code != 200 || count("cvs_711") != 3 || count("cvs_familymart") != 1 {
		t.Fatalf("second import: %d %s", code, body)
	}
	var name string
	db.QueryRow(ctx, `SELECT store_name FROM cvs_stores WHERE chain_type='cvs_711' AND store_code='T00001'`).Scan(&name)
	if name != "A renamed" {
		t.Errorf("upsert did not update name: %q", name)
	}
	var st string
	var applied bool
	var prev *int
	var pct *float64
	db.QueryRow(ctx, `SELECT status, applied FROM cvs_sync_runs WHERE chain_type='cvs_familymart' ORDER BY id DESC LIMIT 1`).Scan(&st, &applied)
	if st != "partial" || applied {
		t.Errorf("familymart run: %s applied=%v", st, applied)
	}
	db.QueryRow(ctx, `SELECT previous_count, change_pct::float8 FROM cvs_sync_runs WHERE chain_type='cvs_711' ORDER BY id DESC LIMIT 1`).Scan(&prev, &pct)
	if prev == nil || *prev != 2 || pct == nil || *pct != 50 {
		t.Errorf("7-ELEVEN previous/pct: %v %v", prev, pct)
	}

	// 3. invalid payload changes nothing and records nothing
	var runsBefore int
	db.QueryRow(ctx, `SELECT COUNT(*) FROM cvs_sync_runs`).Scan(&runsBefore)
	code, _ = send(map[string]any{
		"stores":  []any{store("7eleven", "T00009", "X"), store("7eleven", "T00009", "dup")},
		"summary": map[string]any{"7eleven": map[string]any{"status": "success", "count": 2}},
	})
	var runsAfter int
	db.QueryRow(ctx, `SELECT COUNT(*) FROM cvs_sync_runs`).Scan(&runsAfter)
	if code != http.StatusUnprocessableEntity || runsAfter != runsBefore || count("cvs_711") != 3 {
		t.Errorf("bad payload: code=%d runs %d->%d", code, runsBefore, runsAfter)
	}

	// 4. status endpoint reflects the latest run per chain
	req := httptest.NewRequest(http.MethodGet, "/api/cvs-sync/status", nil)
	w := httptest.NewRecorder()
	h.Status(w, req)
	var out struct {
		Chains []struct {
			Chain         string  `json:"chain"`
			LastSuccessAt *string `json:"last_success_at"`
			LastRun       *struct {
				Status string `json:"status"`
			} `json:"last_run"`
		} `json:"chains"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil || len(out.Chains) != 2 {
		t.Fatalf("status: %v %s", err, w.Body.String())
	}
	if out.Chains[0].LastRun.Status != "success" || out.Chains[1].LastRun.Status != "partial" || out.Chains[1].LastSuccessAt == nil {
		t.Errorf("status content: %s", w.Body.String())
	}
}
