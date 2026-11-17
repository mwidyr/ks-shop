package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"

	"ordermgmt/internal/auth"
	appmw "ordermgmt/internal/middleware"
)

// Runs only with TEST_DATABASE_URL: with the default role matrix, a super user and a warehouse account can both
// open the export template card (list) and upload; a role without the Shipping Workbench tab gets nothing.
func TestShippingTemplatesAccessByRole(t *testing.T) {
	db := liveTestDB(t)
	h := &ShippingWorkbenchHandler{DB: db}
	r := chi.NewRouter()
	r.With(appmw.RequireTabView(db, "shipping_workbench")).Get("/templates", h.Templates)
	r.With(appmw.RequireTabEdit(db, "shipping_workbench")).Post("/templates/{provider}", h.UploadTemplate)
	call := func(role, method, url string) int {
		req := httptest.NewRequest(method, url, nil)
		req = req.WithContext(context.WithValue(req.Context(), appmw.ClaimsKey, &auth.Claims{UserID: 1, Role: role}))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w.Code
	}
	for _, role := range []string{"super_user", "warehouse"} {
		if c := call(role, http.MethodGet, "/templates"); c != http.StatusOK {
			t.Errorf("%s must see the templates card, got %d", role, c)
		}
		if c := call(role, http.MethodPost, "/templates/cvs_711"); c == http.StatusForbidden {
			t.Errorf("%s must be allowed to upload (it fails later for lack of a file, not for permission), got 403", role)
		}
	}
	if c := call("cs", http.MethodGet, "/templates"); c != http.StatusForbidden {
		t.Errorf("a role without the tab must be refused, got %d", c)
	}
}
