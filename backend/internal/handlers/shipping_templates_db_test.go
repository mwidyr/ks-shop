package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/go-chi/chi/v5"

	"ordermgmt/internal/auth"
	appmw "ordermgmt/internal/middleware"
)

// Runs only with TEST_DATABASE_URL: upload, serve, refuse an older version, restore, back to built-in.
func TestShippingTemplateUploadFlow(t *testing.T) {
	db := liveTestDB(t)
	ctx := context.Background()
	var userID int
	if err := db.QueryRow(ctx, `SELECT id FROM users ORDER BY id LIMIT 1`).Scan(&userID); err != nil {
		t.Fatal(err)
	}
	db.Exec(ctx, `DELETE FROM shipping_templates`)
	t.Cleanup(func() { db.Exec(ctx, `DELETE FROM shipping_templates`) })

	h := &ShippingWorkbenchHandler{DB: db}
	r := chi.NewRouter()
	r.Get("/templates/{provider}/file", h.TemplateFile)
	r.Post("/templates/{provider}", h.UploadTemplate)
	r.Post("/templates/{provider}/activate/{id}", h.ActivateTemplate)
	do := func(method, url string, body *bytes.Buffer, ct string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, url, body)
		if ct != "" {
			req.Header.Set("Content-Type", ct)
		}
		req = req.WithContext(context.WithValue(req.Context(), appmw.ClaimsKey, &auth.Claims{UserID: userID}))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w
	}
	upload := func(provider, name string, data []byte) *httptest.ResponseRecorder {
		var buf bytes.Buffer
		mw := multipart.NewWriter(&buf)
		fw, _ := mw.CreateFormFile("file", name)
		fw.Write(data)
		mw.Close()
		return do(http.MethodPost, "/templates/"+provider, &buf, mw.FormDataContentType())
	}

	if w := do(http.MethodGet, "/templates/cvs_711/file", &bytes.Buffer{}, ""); w.Code != http.StatusNotFound {
		t.Fatalf("no upload yet must be 404 (use built-in), got %d", w.Code)
	}
	v16 := loadTpl(t, "711.xlsm")
	v17 := rewrite(t, v16, func(n string, d []byte) []byte {
		if n == "xl/sharedStrings.xml" {
			return bytes.Replace(d, []byte(">1.6<"), []byte(">1.7<"), 1)
		}
		return d
	})
	if w := upload("cvs_711", "new.xlsm", v17); w.Code != http.StatusOK {
		t.Fatalf("valid 1.7 upload: %d %s", w.Code, w.Body.String())
	}
	if w := do(http.MethodGet, "/templates/cvs_711/file", &bytes.Buffer{}, ""); w.Code != http.StatusOK || !bytes.Equal(w.Body.Bytes(), v17) {
		t.Fatalf("the active template must be served byte for byte (%d)", w.Code)
	}
	if w := upload("cvs_711", "old.xlsm", v16); w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("older version 1.6 after 1.7 must be refused, got %d %s", w.Code, w.Body.String())
	}
	if w := upload("cvs_711", "x.xlsm", []byte("junk")); w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("junk must be refused, got %d", w.Code)
	}
	var active, total int
	db.QueryRow(ctx, `SELECT count(*) FILTER (WHERE active), count(*) FROM shipping_templates WHERE provider='cvs_711'`).Scan(&active, &total)
	if active != 1 || total != 1 {
		t.Fatalf("refused uploads must store nothing: active=%d total=%d", active, total)
	}
	var logged int
	db.QueryRow(ctx, `SELECT count(*) FROM activity_log WHERE entity_type='shipping_template' AND action='template_uploaded'`).Scan(&logged)
	if logged < 1 {
		t.Fatal("the upload must be in the audit log")
	}
	if w := upload("cvs_711", "same.xlsm", v17); w.Code != http.StatusOK {
		t.Fatalf("same version again is fine: %d", w.Code)
	}
	var out []templateProviderView
	w := upload("cvs_711", "again.xlsm", v17)
	json.Unmarshal(w.Body.Bytes(), &out)
	if len(out) != 2 || out[0].Active == nil || len(out[0].History) != 2 {
		t.Fatalf("history should list the 2 earlier uploads: %+v", out)
	}
	first := out[0].History[len(out[0].History)-1].ID
	if w := do(http.MethodPost, "/templates/cvs_711/activate/"+strconv.Itoa(first), &bytes.Buffer{}, ""); w.Code != http.StatusOK {
		t.Fatalf("restore: %d", w.Code)
	}
	if w := do(http.MethodPost, "/templates/cvs_711/activate/builtin", &bytes.Buffer{}, ""); w.Code != http.StatusOK {
		t.Fatalf("builtin: %d", w.Code)
	}
	if w := do(http.MethodGet, "/templates/cvs_711/file", &bytes.Buffer{}, ""); w.Code != http.StatusNotFound {
		t.Fatalf("after switching to built-in the file is 404, got %d", w.Code)
	}
	if w := do(http.MethodPost, "/templates/cvs_familymart/activate/"+strconv.Itoa(first), &bytes.Buffer{}, ""); w.Code != http.StatusNotFound {
		t.Fatalf("a template of another provider cannot be activated, got %d", w.Code)
	}
}
