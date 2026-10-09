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
	NameZh       string `json:"name_zh"`
	NameID       string `json:"name_id"`
	ProductCount int    `json:"product_count"`
}

// List returns every category with how many products currently use its name.
func (h *CategoryHandler) List(w http.ResponseWriter, r *http.Request) {
	rows, err := h.DB.Query(r.Context(), `
		SELECT c.id, c.name, c.name_zh, c.name_id, COUNT(p.id)
		FROM categories c
		LEFT JOIN products p ON p.category = c.name AND p.deleted_at IS NULL
		GROUP BY c.id, c.name, c.name_zh, c.name_id ORDER BY c.name`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch categories")
		return
	}
	defer rows.Close()

	list := []categoryView{}
	for rows.Next() {
		var c categoryView
		if err := rows.Scan(&c.ID, &c.Name, &c.NameZh, &c.NameID, &c.ProductCount); err != nil {
			continue
		}
		list = append(list, c)
	}
	respondJSON(w, http.StatusOK, list)
}

// categoryRequest's Name field stays for backward compatibility with any caller that still
// sends the old single-name shape (treated as the Chinese/canonical name); NameZh/NameID are
// the current two-language contract used by the Category Management UI.
type categoryRequest struct {
	Name   string `json:"name"`
	NameZh string `json:"name_zh"`
	NameID string `json:"name_id"`
}

func (h *CategoryHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req categoryRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request")
		return
	}
	nameZh := strings.TrimSpace(req.NameZh)
	if nameZh == "" {
		nameZh = strings.TrimSpace(req.Name)
	}
	nameID := strings.TrimSpace(req.NameID)
	if nameID == "" {
		nameID = nameZh
	}
	if nameZh == "" {
		respondError(w, http.StatusBadRequest, "name_zh is required")
		return
	}
	var id int
	if err := h.DB.QueryRow(r.Context(), `
		INSERT INTO categories (name, name_zh, name_id) VALUES ($1, $1, $2) RETURNING id`, nameZh, nameID).Scan(&id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create category (mungkin sudah ada)")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]int{"id": id})
}

// Update edits only the Indonesian translation - name/name_zh is the join key products.category
// is matched against, so it's intentionally immutable here to avoid silently orphaning every
// product currently using it.
func (h *CategoryHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid category id")
		return
	}
	var req categoryRequest
	if err := decodeJSON(r, &req); err != nil || strings.TrimSpace(req.NameID) == "" {
		respondError(w, http.StatusBadRequest, "name_id is required")
		return
	}
	if _, err := h.DB.Exec(r.Context(), `UPDATE categories SET name_id=$1 WHERE id=$2`, strings.TrimSpace(req.NameID), id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to update category")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

type mergeCategoryRequest struct {
	IntoID int `json:"into_id"`
}

// Merge folds a category into another: every product currently using the source category's
// name is reassigned to the target's name, then the source row is removed. Added because
// migration 076 introduced the 8 official (Chinese-named) categories alongside whatever ad hoc
// free-text categories already existed in production (e.g. "Aksesoris" the old free-text entry
// vs "配件" the new official one, which also happens to translate to "Aksesoris" under the
// Indonesian locale) - this lets staff consolidate those duplicates deliberately rather than
// the migration guessing an ambiguous mapping on their behalf.
func (h *CategoryHandler) Merge(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid category id")
		return
	}
	var req mergeCategoryRequest
	if err := decodeJSON(r, &req); err != nil || req.IntoID == 0 {
		respondError(w, http.StatusBadRequest, "into_id is required")
		return
	}
	if req.IntoID == id {
		respondError(w, http.StatusBadRequest, "cannot merge a category into itself")
		return
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to merge category")
		return
	}
	defer tx.Rollback(ctx)

	var sourceName, targetName string
	if err := tx.QueryRow(ctx, `SELECT name FROM categories WHERE id=$1`, id).Scan(&sourceName); err != nil {
		respondError(w, http.StatusNotFound, "category not found")
		return
	}
	if err := tx.QueryRow(ctx, `SELECT name FROM categories WHERE id=$1`, req.IntoID).Scan(&targetName); err != nil {
		respondError(w, http.StatusNotFound, "target category not found")
		return
	}
	if _, err := tx.Exec(ctx, `UPDATE products SET category=$1 WHERE category=$2`, targetName, sourceName); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to reassign products")
		return
	}
	if _, err := tx.Exec(ctx, `DELETE FROM categories WHERE id=$1`, id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to delete merged category")
		return
	}
	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to merge category")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
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
