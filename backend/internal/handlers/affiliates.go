package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// AffiliateHandler manages the minimal Affiliate reference list used by the Website Sales
// Channel (Sales Channel & Sales Data Attribution PDF, items 040-045). The PDF explicitly
// scopes out the full Affiliate/Agent system for now - this is just the reference list
// Order Creation's Affiliate select and the analytics pages' Affiliate filter both need,
// same shape/pattern as HostLocationHandler (host_locations.go).
type AffiliateHandler struct {
	DB *pgxpool.Pool
}

type affiliateView struct {
	ID       int    `json:"id"`
	Name     string `json:"name"`
	IsActive bool   `json:"is_active"`
}

// List returns active affiliates by default; pass ?include_inactive=true for management.
func (h *AffiliateHandler) List(w http.ResponseWriter, r *http.Request) {
	query := `SELECT id, name, is_active FROM affiliates`
	if r.URL.Query().Get("include_inactive") != "true" {
		query += ` WHERE is_active = true`
	}
	query += ` ORDER BY name`

	rows, err := h.DB.Query(r.Context(), query)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch affiliates")
		return
	}
	defer rows.Close()

	list := []affiliateView{}
	for rows.Next() {
		var a affiliateView
		rows.Scan(&a.ID, &a.Name, &a.IsActive)
		list = append(list, a)
	}
	respondJSON(w, http.StatusOK, list)
}

type affiliateRequest struct {
	Name     string `json:"name"`
	IsActive *bool  `json:"is_active"`
}

func (h *AffiliateHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req affiliateRequest
	if err := decodeJSON(r, &req); err != nil || strings.TrimSpace(req.Name) == "" {
		respondError(w, http.StatusBadRequest, "name is required")
		return
	}
	var id int
	err := h.DB.QueryRow(r.Context(), `
		INSERT INTO affiliates (name) VALUES ($1) RETURNING id`, strings.TrimSpace(req.Name)).Scan(&id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create affiliate")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]int{"id": id})
}

func (h *AffiliateHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid affiliate id")
		return
	}
	var req affiliateRequest
	if err := decodeJSON(r, &req); err != nil || strings.TrimSpace(req.Name) == "" {
		respondError(w, http.StatusBadRequest, "name is required")
		return
	}
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}
	ct, err := h.DB.Exec(r.Context(), `
		UPDATE affiliates SET name=$1, is_active=$2 WHERE id=$3`,
		strings.TrimSpace(req.Name), isActive, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to update affiliate")
		return
	}
	if ct.RowsAffected() == 0 {
		respondError(w, http.StatusNotFound, "affiliate not found")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *AffiliateHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid affiliate id")
		return
	}
	_, err = h.DB.Exec(r.Context(), `DELETE FROM affiliates WHERE id=$1`, id)
	if err != nil {
		if strings.Contains(err.Error(), "foreign key") || strings.Contains(err.Error(), "violates") {
			respondError(w, http.StatusConflict, "affiliate is assigned to existing orders; deactivate it instead")
			return
		}
		respondError(w, http.StatusInternalServerError, "failed to delete affiliate")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
