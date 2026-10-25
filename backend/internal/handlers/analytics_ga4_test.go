package handlers

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func testServiceAccount(t *testing.T, tokenURL string) []byte {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	der, _ := x509.MarshalPKCS8PrivateKey(key)
	pemKey := pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der})
	b, _ := json.Marshal(map[string]string{"client_email": "sa@test.iam.gserviceaccount.com", "private_key": string(pemKey), "token_uri": tokenURL})
	return b
}

// fakeGoogle answers the token endpoint and runReport; the page-path report returns the paths given.
func fakeGoogle(t *testing.T, paths map[string]string) (*httptest.Server, *int) {
	t.Helper()
	tokens := 0
	mux := http.NewServeMux()
	mux.HandleFunc("/token", func(w http.ResponseWriter, r *http.Request) {
		r.ParseForm()
		if r.Form.Get("grant_type") != "urn:ietf:params:oauth:grant-type:jwt-bearer" || strings.Count(r.Form.Get("assertion"), ".") != 2 {
			http.Error(w, "bad", 400)
			return
		}
		tokens++
		json.NewEncoder(w).Encode(map[string]interface{}{"access_token": "tok", "expires_in": 3600})
	})
	mux.HandleFunc("/v1beta/properties/123:runReport", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer tok" {
			http.Error(w, "no", 401)
			return
		}
		var req struct {
			Dimensions []struct{ Name string } `json:"dimensions"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		row := func(dims []string, ms ...string) map[string]interface{} {
			dv, mv := []map[string]string{}, []map[string]string{}
			for _, d := range dims {
				dv = append(dv, map[string]string{"value": d})
			}
			for _, m := range ms {
				mv = append(mv, map[string]string{"value": m})
			}
			return map[string]interface{}{"dimensionValues": dv, "metricValues": mv}
		}
		rows := []map[string]interface{}{}
		switch {
		case len(req.Dimensions) == 0:
			rows = append(rows, row(nil, "50", "20", "80", "300", "95.5", "0.62"))
		case req.Dimensions[0].Name == "sessionDefaultChannelGroup":
			rows = append(rows, row([]string{"Organic Search"}, "40", "30"), row([]string{"Direct"}, "20", "15"))
		default:
			for p, v := range paths {
				rows = append(rows, row([]string{p}, v))
			}
		}
		json.NewEncoder(w).Encode(map[string]interface{}{"rows": rows})
	})
	return httptest.NewServer(mux), &tokens
}

func TestGA4ReportAgainstFakeGoogle(t *testing.T) {
	db := liveTestDB(t)
	ctx := context.Background()
	tx, err := db.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	var pid int
	if err := tx.QueryRow(ctx, `INSERT INTO products (name, sku) VALUES ('GA Dress', 'GA-001') RETURNING id`).Scan(&pid); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO content_pages (type, slug, title) VALUES ('topic','ga-test-article','{"id":"Artikel GA"}')`); err != nil {
		t.Fatal(err)
	}
	pidPath := "/p/" + itoa(pid)
	srv, tokens := fakeGoogle(t, map[string]string{
		pidPath: "10", "/en" + pidPath + "?utm=x": "5", "/p/99999999": "7", // a deleted product is skipped
		"/style/ga-test-article": "4", "/id/style/ga-test-article": "2", "/": "100", "/cart": "9",
	})
	defer srv.Close()
	c, err := newGA4Client("123", testServiceAccount(t, srv.URL+"/token"))
	if err != nil {
		t.Fatal(err)
	}
	c.APIBase = srv.URL + "/v1beta"
	rep, err := buildGA4Report(ctx, c, tx, "2026-10-01", "2026-10-07")
	if err != nil {
		t.Fatal(err)
	}
	if rep.Overview.Sessions != 80 || rep.Overview.PageViews != 300 || rep.Overview.EngagementPct != 0.62 {
		t.Fatalf("overview %+v", rep.Overview)
	}
	if len(rep.Sources) != 2 || rep.Sources[0].Channel != "Organic Search" {
		t.Fatalf("sources %+v", rep.Sources)
	}
	if len(rep.Products) != 1 || rep.Products[0].Code != "GA-001" || rep.Products[0].Views != 15 {
		t.Fatalf("products %+v", rep.Products)
	}
	if len(rep.Articles) != 1 || rep.Articles[0].Title != "Artikel GA" || rep.Articles[0].Views != 6 {
		t.Fatalf("articles %+v", rep.Articles)
	}
	if _, err := c.run(ctx, "2026-10-01", "2026-10-07", nil, []string{"sessions"}, "", 1); err != nil || *tokens != 1 {
		t.Fatalf("token should be reused: tokens=%d err=%v", *tokens, err)
	}
}

func TestGA4NotConnectedAndBadRange(t *testing.T) {
	h := &WebsiteAnalyticsHandler{}
	w := httptest.NewRecorder()
	h.Report(w, httptest.NewRequest("GET", "/analytics/website?from=2026-10-01&to=2026-10-02", nil))
	var got ga4Report
	json.NewDecoder(w.Body).Decode(&got)
	if w.Code != 200 || got.Configured {
		t.Fatalf("not connected should answer configured=false, got %d %+v", w.Code, got)
	}
	srv, _ := fakeGoogle(t, nil)
	defer srv.Close()
	c, _ := newGA4Client("123", testServiceAccount(t, srv.URL+"/token"))
	h = &WebsiteAnalyticsHandler{Client: c, cache: map[string]cachedGA4{}}
	w = httptest.NewRecorder()
	h.Report(w, httptest.NewRequest("GET", "/analytics/website?from=2026-10-09&to=2026-10-02", nil))
	if w.Code != 400 {
		t.Fatalf("reversed range: %d", w.Code)
	}
}

func TestGA4MeasurementID(t *testing.T) {
	for in, want := range map[string]string{"G-ABC1234567": "G-ABC1234567", "": "", "UA-1-1": "", "G-x<script>": ""} {
		t.Setenv("GA4_MEASUREMENT_ID", in)
		if got := gaMeasurementID(); got != want {
			t.Errorf("%q -> %q, want %q", in, got, want)
		}
	}
}
