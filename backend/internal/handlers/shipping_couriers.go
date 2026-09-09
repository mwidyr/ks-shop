package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ShippingCourierHandler struct {
	DB *pgxpool.Pool
}

type courierView struct {
	ID       int    `json:"id"`
	Name     string `json:"name"`
	IsActive bool   `json:"is_active"`
}

// List returns active couriers by default; pass ?include_inactive=true for the Settings page.
func (h *ShippingCourierHandler) List(w http.ResponseWriter, r *http.Request) {
	query := `SELECT id, name, is_active FROM shipping_couriers`
	if r.URL.Query().Get("include_inactive") != "true" {
		query += ` WHERE is_active = true`
	}
	query += ` ORDER BY name`

	rows, err := h.DB.Query(r.Context(), query)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch shipping couriers")
		return
	}
	defer rows.Close()

	list := []courierView{}
	for rows.Next() {
		var c courierView
		rows.Scan(&c.ID, &c.Name, &c.IsActive)
		list = append(list, c)
	}
	respondJSON(w, http.StatusOK, list)
}

type courierRequest struct {
	Name     string `json:"name"`
	IsActive *bool  `json:"is_active"`
}

func (h *ShippingCourierHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req courierRequest
	if err := decodeJSON(r, &req); err != nil || req.Name == "" {
		respondError(w, http.StatusBadRequest, "name is required")
		return
	}
	var id int
	err := h.DB.QueryRow(r.Context(), `
		INSERT INTO shipping_couriers (name) VALUES ($1) RETURNING id`, req.Name).Scan(&id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create shipping courier (name may already exist)")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]int{"id": id})
}

func (h *ShippingCourierHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid courier id")
		return
	}
	var req courierRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}
	ct, err := h.DB.Exec(r.Context(), `
		UPDATE shipping_couriers SET name=$1, is_active=$2 WHERE id=$3`, req.Name, isActive, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to update shipping courier")
		return
	}
	if ct.RowsAffected() == 0 {
		respondError(w, http.StatusNotFound, "shipping courier not found")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *ShippingCourierHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid courier id")
		return
	}
	_, err = h.DB.Exec(r.Context(), `DELETE FROM shipping_couriers WHERE id=$1`, id)
	if err != nil {
		if strings.Contains(err.Error(), "foreign key") || strings.Contains(err.Error(), "violates") {
			respondError(w, http.StatusConflict, "shipping courier is used in existing orders; deactivate it instead")
			return
		}
		respondError(w, http.StatusInternalServerError, "failed to delete shipping courier")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
