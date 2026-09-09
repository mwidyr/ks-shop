package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type HostHandler struct {
	DB *pgxpool.Pool
}

type hostView struct {
	ID       int    `json:"id"`
	Name     string `json:"name"`
	Platform string `json:"platform"`
	IsActive bool   `json:"is_active"`
}

// List returns active hosts by default; pass ?include_inactive=true for the Settings page.
func (h *HostHandler) List(w http.ResponseWriter, r *http.Request) {
	query := `SELECT id, name, COALESCE(platform,''), is_active FROM hosts`
	if r.URL.Query().Get("include_inactive") != "true" {
		query += ` WHERE is_active = true`
	}
	query += ` ORDER BY name`

	rows, err := h.DB.Query(r.Context(), query)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch hosts")
		return
	}
	defer rows.Close()

	list := []hostView{}
	for rows.Next() {
		var host hostView
		rows.Scan(&host.ID, &host.Name, &host.Platform, &host.IsActive)
		list = append(list, host)
	}
	respondJSON(w, http.StatusOK, list)
}

type hostRequest struct {
	Name     string `json:"name"`
	Platform string `json:"platform"`
	IsActive *bool  `json:"is_active"`
}

func (h *HostHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req hostRequest
	if err := decodeJSON(r, &req); err != nil || req.Name == "" {
		respondError(w, http.StatusBadRequest, "name is required")
		return
	}
	var id int
	err := h.DB.QueryRow(r.Context(), `
		INSERT INTO hosts (name, platform) VALUES ($1,$2) RETURNING id`, req.Name, req.Platform).Scan(&id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create host")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]int{"id": id})
}

func (h *HostHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid host id")
		return
	}
	var req hostRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}
	ct, err := h.DB.Exec(r.Context(), `
		UPDATE hosts SET name=$1, platform=$2, is_active=$3 WHERE id=$4`,
		req.Name, req.Platform, isActive, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to update host")
		return
	}
	if ct.RowsAffected() == 0 {
		respondError(w, http.StatusNotFound, "host not found")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *HostHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid host id")
		return
	}
	_, err = h.DB.Exec(r.Context(), `DELETE FROM hosts WHERE id=$1`, id)
	if err != nil {
		if strings.Contains(err.Error(), "foreign key") || strings.Contains(err.Error(), "violates") {
			respondError(w, http.StatusConflict, "host is used in existing orders; deactivate it instead")
			return
		}
		respondError(w, http.StatusInternalServerError, "failed to delete host")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
