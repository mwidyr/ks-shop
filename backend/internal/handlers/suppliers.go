package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SupplierHandler manages basic supplier records (Manajemen Supplier).
type SupplierHandler struct {
	DB *pgxpool.Pool
}

type supplierView struct {
	ID          int    `json:"id"`
	Name        string `json:"name"`
	ContactName string `json:"contact_name"`
	Phone       string `json:"phone"`
	Address     string `json:"address"`
	IsActive    bool   `json:"is_active"`
}

func (h *SupplierHandler) List(w http.ResponseWriter, r *http.Request) {
	query := `SELECT id, name, COALESCE(contact_name,''), COALESCE(phone,''), COALESCE(address,''), is_active FROM suppliers`
	if r.URL.Query().Get("include_inactive") != "true" {
		query += ` WHERE is_active = true`
	}
	query += ` ORDER BY name`

	rows, err := h.DB.Query(r.Context(), query)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch suppliers")
		return
	}
	defer rows.Close()

	list := []supplierView{}
	for rows.Next() {
		var s supplierView
		rows.Scan(&s.ID, &s.Name, &s.ContactName, &s.Phone, &s.Address, &s.IsActive)
		list = append(list, s)
	}
	respondJSON(w, http.StatusOK, list)
}

type supplierRequest struct {
	Name        string `json:"name"`
	ContactName string `json:"contact_name"`
	Phone       string `json:"phone"`
	Address     string `json:"address"`
	IsActive    *bool  `json:"is_active"`
}

func (h *SupplierHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req supplierRequest
	if err := decodeJSON(r, &req); err != nil || req.Name == "" {
		respondError(w, http.StatusBadRequest, "name is required")
		return
	}
	var id int
	err := h.DB.QueryRow(r.Context(), `
		INSERT INTO suppliers (name, contact_name, phone, address) VALUES ($1,$2,$3,$4) RETURNING id`,
		req.Name, req.ContactName, req.Phone, req.Address).Scan(&id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create supplier")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]int{"id": id})
}

func (h *SupplierHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid supplier id")
		return
	}
	var req supplierRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}
	ct, err := h.DB.Exec(r.Context(), `
		UPDATE suppliers SET name=$1, contact_name=$2, phone=$3, address=$4, is_active=$5 WHERE id=$6`,
		req.Name, req.ContactName, req.Phone, req.Address, isActive, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to update supplier")
		return
	}
	if ct.RowsAffected() == 0 {
		respondError(w, http.StatusNotFound, "supplier not found")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *SupplierHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid supplier id")
		return
	}
	_, err = h.DB.Exec(r.Context(), `DELETE FROM suppliers WHERE id=$1`, id)
	if err != nil {
		if strings.Contains(err.Error(), "foreign key") || strings.Contains(err.Error(), "violates") {
			respondError(w, http.StatusConflict, "supplier has purchase history; deactivate it instead")
			return
		}
		respondError(w, http.StatusInternalServerError, "failed to delete supplier")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
