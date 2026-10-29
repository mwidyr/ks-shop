package middleware

import (
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// hostAllowedPaths are the only API routes a Host account may call: its own performance data.
// Everything else answers 403 for that role, so a new route is closed to hosts by default.
var hostAllowedPaths = map[string]bool{
	"/api/my-access":                         true,
	"/api/host-analytics/lifetime":           true,
	"/api/host-analytics/summary":            true,
	"/api/host-analytics/period-summary":     true,
	"/api/host-analytics/sales-distribution": true,
	"/api/host-analytics/historical-best":    true,
	"/api/host-analytics/performance-data":   true,
	"/api/reports/product-analysis":          true,
	"/api/reports/product-trend":             true,
	"/api/reports/product-performance":       true,
	"/api/reports/product-color-pair":        true,
	"/api/reports/product-options":           true,
}

// HostScope confines a 'host' account to its own data. Other roles pass untouched (their access stays
// the per-tab permission matrix). For a host: only hostAllowedPaths are reachable, and the query string
// is rewritten before any handler or response cache sees it, so the handler can only ever compute the
// host's own numbers: host_id is forced to the linked host, channel to LIVE, and every other scope
// (location, affiliate) is dropped.
func HostScope(db *pgxpool.Pool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims := GetClaims(r)
			if claims == nil || claims.Role != "host" {
				next.ServeHTTP(w, r)
				return
			}
			if !hostAllowedPaths[strings.TrimSuffix(r.URL.Path, "/")] || r.Method != http.MethodGet {
				http.Error(w, `{"error":"forbidden: host accounts only see their own performance data"}`, http.StatusForbidden)
				return
			}
			var hostID *int
			var active bool
			if err := db.QueryRow(r.Context(), `SELECT host_id, is_active FROM users WHERE id=$1`, claims.UserID).Scan(&hostID, &active); err != nil || hostID == nil || !active {
				http.Error(w, `{"error":"forbidden: this account is not linked to a host"}`, http.StatusForbidden)
				return
			}
			q := r.URL.Query()
			for _, k := range []string{"location_id", "affiliate_id", "host_id", "channel"} {
				q.Del(k)
			}
			q.Set("host_id", strconv.Itoa(*hostID))
			q.Set("channel", "live")
			r2 := r.Clone(r.Context())
			r2.URL = &url.URL{Path: r.URL.Path, RawQuery: q.Encode()}
			r2.RequestURI = r2.URL.RequestURI()
			next.ServeHTTP(w, r2)
		})
	}
}
