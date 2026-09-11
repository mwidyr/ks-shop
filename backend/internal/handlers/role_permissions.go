package handlers

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
)

// RolePermissionHandler stores a configurable role/permission matrix. IMPORTANT: this is
// storage + a Settings UI only - none of the existing appmw.RequireRole(...) route gates read
// from this table yet. The client's real role/permission matrix (Admin/CS/Warehouse) is still
// pending a meeting; wiring enforcement to this table is a deliberate follow-up once that
// matrix is confirmed, not part of this pass.
type RolePermissionHandler struct {
	DB *pgxpool.Pool
}

type permissionView struct {
	Key         string `json:"key"`
	Description string `json:"description"`
	GroupName   string `json:"group_name"`
}

// Permissions returns the full permission catalog.
func (h *RolePermissionHandler) Permissions(w http.ResponseWriter, r *http.Request) {
	rows, err := h.DB.Query(r.Context(), `SELECT key, description, group_name FROM permissions ORDER BY group_name, key`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch permissions")
		return
	}
	defer rows.Close()

	list := []permissionView{}
	for rows.Next() {
		var p permissionView
		if err := rows.Scan(&p.Key, &p.Description, &p.GroupName); err != nil {
			continue
		}
		list = append(list, p)
	}
	respondJSON(w, http.StatusOK, list)
}

// Matrix returns every role name and, for each, the set of permission keys it currently has.
func (h *RolePermissionHandler) Matrix(w http.ResponseWriter, r *http.Request) {
	roleRows, err := h.DB.Query(r.Context(), `SELECT name FROM roles ORDER BY name`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch roles")
		return
	}
	roles := []string{}
	for roleRows.Next() {
		var name string
		roleRows.Scan(&name)
		roles = append(roles, name)
	}
	roleRows.Close()

	permRows, err := h.DB.Query(r.Context(), `SELECT role_name, permission_key FROM role_permissions`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch role permissions")
		return
	}
	defer permRows.Close()

	matrix := map[string][]string{}
	for _, role := range roles {
		matrix[role] = []string{}
	}
	for permRows.Next() {
		var role, key string
		if err := permRows.Scan(&role, &key); err != nil {
			continue
		}
		matrix[role] = append(matrix[role], key)
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"roles": roles, "matrix": matrix})
}

type updateMatrixRequest struct {
	Matrix map[string][]string `json:"matrix"`
}

// UpdateMatrix replaces the full role -> permission-keys assignment.
func (h *RolePermissionHandler) UpdateMatrix(w http.ResponseWriter, r *http.Request) {
	var req updateMatrixRequest
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

	if _, err := tx.Exec(ctx, `DELETE FROM role_permissions`); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to reset matrix")
		return
	}
	for role, keys := range req.Matrix {
		for _, key := range keys {
			if _, err := tx.Exec(ctx, `INSERT INTO role_permissions (role_name, permission_key) VALUES ($1,$2) ON CONFLICT DO NOTHING`, role, key); err != nil {
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
