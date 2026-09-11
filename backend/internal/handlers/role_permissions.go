package handlers

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"ordermgmt/internal/auth"
	appmw "ordermgmt/internal/middleware"
)

// RolePermissionHandler manages the tab-based role access matrix (Manajemen Pengguna's
// Permission Matrix). Unlike the earlier action-based version, "tabs" are exactly the sidebar
// nav item keys from frontend/src/components/AppShell.jsx's navGroups, so the frontend nav
// structure and this table share one vocabulary. Real enforcement lives in
// internal/middleware/tabaccess.go, wired per-route in main.go.
type RolePermissionHandler struct {
	DB *pgxpool.Pool
}

// tabKeys mirrors AppShell.jsx's navGroups item keys plus the two standalone links
// (dashboard, settings). Keep in sync if the sidebar changes.
var tabKeys = []string{
	"dashboard",
	"panel_siaran", "orders", "picking", "shipping", "chat", "customers", "reviews",
	"products", "categories", "inventory", "warehouses", "suppliers", "purchases", "purchase_alert",
	"returns", "refunds",
	"promotions", "campaigns", "advertising",
	"sales_analytics", "product_analytics", "profit",
	"transactions", "payouts", "fees", "reports",
	"store_profile", "shipping_settings", "hosts", "store_design", "team",
	"notifications", "integrations", "roles", "audit_logs",
	"settings",
}

// configurableRoles are every real role except super_user (Admin), which always has full
// access and isn't a configurable cell.
var configurableRoles = []string{"management", "spv", "sales", "cs", "warehouse"}

// Tabs returns the static tab list - no DB read needed, it's just the sidebar vocabulary.
func (h *RolePermissionHandler) Tabs(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, tabKeys)
}

// MyAccess returns the caller's own tab -> access_level map, so the frontend can hide/grey nav
// items it has no access to - deliberately NOT gated behind the "roles" tab permission (a
// restricted role still needs to know its own access to render its own sidebar). super_user
// gets an empty map back; the frontend already treats super_user as always-full-access.
func (h *RolePermissionHandler) MyAccess(w http.ResponseWriter, r *http.Request) {
	claims := appmw.GetClaims(r)
	access := map[string]string{}
	if claims != nil && claims.Role != "super_user" {
		rows, err := h.DB.Query(r.Context(), `SELECT tab_key, access_level FROM role_tab_access WHERE role_name=$1`, claims.Role)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var tab, level string
				if rows.Scan(&tab, &level) == nil {
					access[tab] = level
				}
			}
		}
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"role": claimsRole(claims), "access": access})
}

func claimsRole(c *auth.Claims) string {
	if c == nil {
		return ""
	}
	return c.Role
}

// Matrix returns every configurable role and, for each, its tab -> access_level map (missing
// entries mean "none").
func (h *RolePermissionHandler) Matrix(w http.ResponseWriter, r *http.Request) {
	rows, err := h.DB.Query(r.Context(), `SELECT role_name, tab_key, access_level FROM role_tab_access`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch role tab access")
		return
	}
	defer rows.Close()

	matrix := map[string]map[string]string{}
	for _, role := range configurableRoles {
		matrix[role] = map[string]string{}
	}
	for rows.Next() {
		var role, tab, level string
		if err := rows.Scan(&role, &tab, &level); err != nil {
			continue
		}
		if matrix[role] == nil {
			matrix[role] = map[string]string{}
		}
		matrix[role][tab] = level
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"roles": configurableRoles, "matrix": matrix})
}

type updateTabAccessRequest struct {
	Matrix map[string]map[string]string `json:"matrix"`
}

// UpdateMatrix replaces the full role -> tab -> access_level assignment for every configurable
// role. Cells omitted (or set to anything other than "view"/"edit") mean "none" and get no row.
func (h *RolePermissionHandler) UpdateMatrix(w http.ResponseWriter, r *http.Request) {
	var req updateTabAccessRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	ctx := r.Context()
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `DELETE FROM role_tab_access`); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to reset matrix")
		return
	}
	for role, tabs := range req.Matrix {
		for tab, level := range tabs {
			if level != "view" && level != "edit" {
				continue
			}
			if _, err := tx.Exec(ctx, `
				INSERT INTO role_tab_access (role_name, tab_key, access_level) VALUES ($1,$2,$3)
				ON CONFLICT (role_name, tab_key) DO UPDATE SET access_level = $3`,
				role, tab, level); err != nil {
				respondError(w, http.StatusInternalServerError, "failed to save matrix")
				return
			}
		}
	}
	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "db commit failed")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
