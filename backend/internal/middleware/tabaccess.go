package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// A role's access level per tab is read on EVERY non-admin request, so it is cached for a short time
// (the role_tab_access table changes only when an admin saves the permission matrix, which calls
// InvalidateTabAccess). A tab with no row is cached too (level "").
const tabAccessTTL = 30 * time.Second

type tabAccessEntry struct {
	level   string
	expires time.Time
}

var (
	tabAccessMu    sync.RWMutex
	tabAccessCache = map[string]tabAccessEntry{}
)

// InvalidateTabAccess drops every cached access level; call it after the permission matrix changes.
func InvalidateTabAccess() {
	tabAccessMu.Lock()
	tabAccessCache = map[string]tabAccessEntry{}
	tabAccessMu.Unlock()
}

func cachedTabLevel(r *http.Request, db *pgxpool.Pool, role, tab string) (string, error) {
	key := role + "\x00" + tab
	tabAccessMu.RLock()
	e, ok := tabAccessCache[key]
	tabAccessMu.RUnlock()
	if ok && time.Now().Before(e.expires) {
		return e.level, nil
	}
	var level string
	err := db.QueryRow(r.Context(), `SELECT access_level FROM role_tab_access WHERE role_name=$1 AND tab_key=$2`, role, tab).Scan(&level)
	if err != nil {
		// no row = no access; any other error is not cached
		if err == pgx.ErrNoRows {
			level, err = "", nil
		} else {
			return "", err
		}
	}
	tabAccessMu.Lock()
	tabAccessCache[key] = tabAccessEntry{level: level, expires: time.Now().Add(tabAccessTTL)}
	tabAccessMu.Unlock()
	return level, nil
}

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

// RequireAnyTabView allows the request if the caller can view (or edit) ANY of tabKeys, or is
// super_user. For read-only lookup data (e.g. pickup chains) needed by more than one tab, so a
// role that can use Orders isn't also forced to be granted the admin tab that owns the data.
func RequireAnyTabView(db *pgxpool.Pool, tabKeys ...string) func(http.Handler) http.Handler {
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
			var n int
			err := db.QueryRow(r.Context(), `
				SELECT COUNT(*) FROM role_tab_access
				WHERE role_name=$1 AND tab_key = ANY($2) AND access_level IN ('view','edit')`,
				claims.Role, tabKeys).Scan(&n)
			if err != nil || n == 0 {
				http.Error(w, `{"error":"forbidden: no access to this section"}`, http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
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
			level, err := cachedTabLevel(r, db, claims.Role, tabKey)
			if err != nil || level == "" {
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
