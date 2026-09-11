package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// CategoryHandler manages the first-class category list (Manajemen Kategori) - simple flat
// CRUD, matching the reference exactly: name in, list out, delete.
type CategoryHandler struct {
	DB *pgxpool.Pool
}

type categoryView struct {
	ID           int    `json:"id"`
	Name         string `json:"name"`
	ProductCount int    `json:"product_count"`
}

// List returns every category with how many products currently use its name.
func (h *CategoryHandler) List(w http.ResponseWriter, r *http.Request) {
	rows, err := h.DB.Query(r.Context(), `
		SELECT c.id, c.name, COUNT(p.id)
		FROM categories c
		LEFT JOIN products p ON p.category = c.name
		GROUP BY c.id, c.name ORDER BY c.name`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch categories")
		return
	}
	defer rows.Close()

	list := []categoryView{}
	for rows.Next() {
		var c categoryView
		if err := rows.Scan(&c.ID, &c.Name, &c.ProductCount); err != nil {
			continue
		}
		list = append(list, c)
	}
	respondJSON(w, http.StatusOK, list)
}

type categoryRequest struct {
	Name string `json:"name"`
}

func (h *CategoryHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req categoryRequest
	if err := decodeJSON(r, &req); err != nil || strings.TrimSpace(req.Name) == "" {
		respondError(w, http.StatusBadRequest, "name is required")
		return
	}
	var id int
	if err := h.DB.QueryRow(r.Context(), `
		INSERT INTO categories (name) VALUES ($1) RETURNING id`, strings.TrimSpace(req.Name)).Scan(&id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create category (mungkin sudah ada)")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]int{"id": id})
}

func (h *CategoryHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid category id")
		return
	}
	if _, err := h.DB.Exec(r.Context(), `DELETE FROM categories WHERE id=$1`, id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to delete category")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
