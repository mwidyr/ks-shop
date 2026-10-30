package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"ordermgmt/internal/auth"
)

func hostRequest(method, target, role string) *http.Request {
	r := httptest.NewRequest(method, target, nil)
	return r.WithContext(context.WithValue(r.Context(), ClaimsKey, &auth.Claims{UserID: 1, Role: role}))
}

// A host account can only GET its own performance routes; everything else is refused before any DB access.
func TestHostScopeRefusesEverythingOutsideTheAllowList(t *testing.T) {
	called := false
	h := HostScope(nil)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { called = true }))
	for _, c := range []struct{ method, target string }{
		{"GET", "/api/orders"}, {"GET", "/api/customers"}, {"GET", "/api/users"}, {"GET", "/api/hosts"},
		{"GET", "/api/heatmap/grid"}, {"GET", "/api/live-sessions/1"}, {"GET", "/api/live-sessions/1/screenshots"},
		{"POST", "/api/host-analytics/summary"}, {"PATCH", "/api/users/1"}, {"POST", "/api/live-sessions"},
		{"PATCH", "/api/live-sessions/1/go-live"}, {"GET", "/api/performance-dashboard/other"},
	} {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, hostRequest(c.method, c.target, "host"))
		if rec.Code != http.StatusForbidden || called {
			t.Fatalf("%s %s: got %d (handler called=%v), want 403", c.method, c.target, rec.Code, called)
		}
	}
}

// Other roles are not touched by HostScope (their access stays the permission matrix).
func TestHostScopeLeavesOtherRolesAlone(t *testing.T) {
	called := false
	h := HostScope(nil)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { called = true }))
	h.ServeHTTP(httptest.NewRecorder(), hostRequest("GET", "/api/orders", "sales"))
	if !called {
		t.Fatal("sales request should pass through")
	}
}
