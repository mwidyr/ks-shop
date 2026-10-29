package handlers

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// Ordering needs a website member session: without one (or with a bad token) the order is refused
// before anything touches the database.
func TestCreateOrderRequiresMemberLogin(t *testing.T) {
	h := &StorefrontHandler{JWTSecret: "test"}
	for name, header := range map[string]string{"guest": "", "bad token": "Bearer nope"} {
		req := httptest.NewRequest(http.MethodPost, "/public/store/orders", strings.NewReader(`{"name":"A","phone":"0912345678","email":"a@b.co","items":[{"variant_id":1,"qty":1}],"pickup_chain_id":1}`))
		if header != "" {
			req.Header.Set("Authorization", header)
		}
		rec := httptest.NewRecorder()
		h.CreateOrder(rec, req)
		if rec.Code != http.StatusUnauthorized {
			t.Errorf("%s: status %d, want 401", name, rec.Code)
		}
	}
}
