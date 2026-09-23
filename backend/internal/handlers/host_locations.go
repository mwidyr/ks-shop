package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// HostLocationHandler manages the Location Tag reference list used by Host
// Management (item 021). Unlike categories (which are joined to products by
// name only), locations are a real FK on hosts.location_id, so deleting a
// location that's still assigned is blocked - deactivating it is always
// available instead.
type HostLocationHandler struct {
	DB *pgxpool.Pool
}

type hostLocationView struct {
	ID       int    `json:"id"`
	Name     string `json:"name"`
	IsActive bool   `json:"is_active"`
}

// List returns active locations by default; pass ?include_inactive=true for
// the Host Management manager.
func (h *HostLocationHandler) List(w http.ResponseWriter, r *http.Request) {
	query := `SELECT id, name, is_active FROM host_locations`
	if r.URL.Query().Get("include_inactive") != "true" {
		query += ` WHERE is_active = true`
	}
	query += ` ORDER BY name`

	rows, err := h.DB.Query(r.Context(), query)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch locations")
		return
	}
	defer rows.Close()

	list := []hostLocationView{}
	for rows.Next() {
		var loc hostLocationView
		rows.Scan(&loc.ID, &loc.Name, &loc.IsActive)
		list = append(list, loc)
	}
	respondJSON(w, http.StatusOK, list)
}

type hostLocationRequest struct {
	Name     string `json:"name"`
	IsActive *bool  `json:"is_active"`
}

func (h *HostLocationHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req hostLocationRequest
	if err := decodeJSON(r, &req); err != nil || strings.TrimSpace(req.Name) == "" {
		respondError(w, http.StatusBadRequest, "name is required")
		return
	}
	var id int
	err := h.DB.QueryRow(r.Context(), `
		INSERT INTO host_locations (name) VALUES ($1) RETURNING id`, strings.TrimSpace(req.Name)).Scan(&id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create location")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]int{"id": id})
}

func (h *HostLocationHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid location id")
		return
	}
	var req hostLocationRequest
	if err := decodeJSON(r, &req); err != nil || strings.TrimSpace(req.Name) == "" {
		respondError(w, http.StatusBadRequest, "name is required")
		return
	}
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}
	ct, err := h.DB.Exec(r.Context(), `
		UPDATE host_locations SET name=$1, is_active=$2 WHERE id=$3`,
		strings.TrimSpace(req.Name), isActive, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to update location")
		return
	}
	if ct.RowsAffected() == 0 {
		respondError(w, http.StatusNotFound, "location not found")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *HostLocationHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid location id")
		return
	}
	_, err = h.DB.Exec(r.Context(), `DELETE FROM host_locations WHERE id=$1`, id)
	if err != nil {
		if strings.Contains(err.Error(), "foreign key") || strings.Contains(err.Error(), "violates") {
			respondError(w, http.StatusConflict, "location is assigned to existing hosts; reassign or deactivate it instead")
			return
		}
		respondError(w, http.StatusInternalServerError, "failed to delete location")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
