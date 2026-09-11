package middleware

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
)

// RequireTabView allows the request if the caller's role has 'view' or 'edit' access to tabKey
// (per role_tab_access), or if the caller is super_user (Admin always has full access, not a
// configurable cell). Intended for GET routes.
func RequireTabView(db *pgxpool.Pool, tabKey string) func(http.Handler) http.Handler {
	return requireTabLevel(db, tabKey, "view")
}

// RequireTabEdit allows the request only if the caller's role has 'edit' access to tabKey, or if
// the caller is super_user. Intended for POST/PATCH/PUT/DELETE routes.
func RequireTabEdit(db *pgxpool.Pool, tabKey string) func(http.Handler) http.Handler {
	return requireTabLevel(db, tabKey, "edit")
}

func requireTabLevel(db *pgxpool.Pool, tabKey string, minLevel string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims := GetClaims(r)
			if claims == nil {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}
			if claims.Role == "super_user" {
				next.ServeHTTP(w, r)
				return
			}
			var level string
			err := db.QueryRow(r.Context(), `
				SELECT access_level FROM role_tab_access WHERE role_name=$1 AND tab_key=$2`,
				claims.Role, tabKey).Scan(&level)
			if err != nil {
				http.Error(w, `{"error":"forbidden: no access to this section"}`, http.StatusForbidden)
				return
			}
			allowed := level == "edit" || (level == "view" && minLevel == "view")
			if !allowed {
				http.Error(w, `{"error":"forbidden: read-only or no access to this section"}`, http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
