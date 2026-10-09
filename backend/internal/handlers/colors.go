package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ColorHandler manages the Color master list (Color Management) - mirrors CategoryHandler
// exactly: name_zh is the canonical value product_variants.color is matched against (free
// text, not an FK, same as categories), name_id is a pure display-layer translation.
type ColorHandler struct {
	DB *pgxpool.Pool
}

type colorView struct {
	ID     int    `json:"id"`
	NameZh string `json:"name_zh"`
	NameID string `json:"name_id"`
	// UsedCount = number of different PRODUCTS (styles) with at least one variant in this color -
	// not variants and not stock. Matches the variant color stored as either the Chinese name
	// (canonical) or the Indonesian name (legacy free-text entered before Color Master existed).
	UsedCount int `json:"used_count"`
}

func (h *ColorHandler) List(w http.ResponseWriter, r *http.Request) {
	rows, err := h.DB.Query(r.Context(), `
		SELECT c.id, c.name_zh, c.name_id, COUNT(DISTINCT p.id)
		FROM colors c
		LEFT JOIN product_variants v ON v.color = c.name_zh OR v.color = c.name_id
		LEFT JOIN products p ON p.id = v.product_id AND p.deleted_at IS NULL
		GROUP BY c.id, c.name_zh, c.name_id ORDER BY c.name_zh`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch colors")
		return
	}
	defer rows.Close()

	list := []colorView{}
	for rows.Next() {
		var c colorView
		if err := rows.Scan(&c.ID, &c.NameZh, &c.NameID, &c.UsedCount); err != nil {
			continue
		}
		list = append(list, c)
	}
	respondJSON(w, http.StatusOK, list)
}

type colorRequest struct {
	NameZh string `json:"name_zh"`
	NameID string `json:"name_id"`
}

func (h *ColorHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req colorRequest
	if err := decodeJSON(r, &req); err != nil || strings.TrimSpace(req.NameZh) == "" || strings.TrimSpace(req.NameID) == "" {
		respondError(w, http.StatusBadRequest, "name_zh and name_id are required")
		return
	}
	var id int
	if err := h.DB.QueryRow(r.Context(), `
		INSERT INTO colors (name_zh, name_id) VALUES ($1, $2) RETURNING id`,
		strings.TrimSpace(req.NameZh), strings.TrimSpace(req.NameID)).Scan(&id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create color (mungkin sudah ada)")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]int{"id": id})
}

// Update edits only the Indonesian translation - see CategoryHandler.Update for why name_zh
// (the join key) is intentionally immutable here.
func (h *ColorHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid color id")
		return
	}
	var req colorRequest
	if err := decodeJSON(r, &req); err != nil || strings.TrimSpace(req.NameID) == "" {
		respondError(w, http.StatusBadRequest, "name_id is required")
		return
	}
	if _, err := h.DB.Exec(r.Context(), `UPDATE colors SET name_id=$1 WHERE id=$2`, strings.TrimSpace(req.NameID), id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to update color")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

type mergeColorRequest struct {
	IntoID int `json:"into_id"`
}

// Merge folds a color into another - see CategoryHandler.Merge for the rationale (reassigns
// every variant currently using the source color's name, then removes the source row).
func (h *ColorHandler) Merge(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid color id")
		return
	}
	var req mergeColorRequest
	if err := decodeJSON(r, &req); err != nil || req.IntoID == 0 {
		respondError(w, http.StatusBadRequest, "into_id is required")
		return
	}
	if req.IntoID == id {
		respondError(w, http.StatusBadRequest, "cannot merge a color into itself")
		return
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to merge color")
		return
	}
	defer tx.Rollback(ctx)

	var sourceName, targetName string
	if err := tx.QueryRow(ctx, `SELECT name_zh FROM colors WHERE id=$1`, id).Scan(&sourceName); err != nil {
		respondError(w, http.StatusNotFound, "color not found")
		return
	}
	if err := tx.QueryRow(ctx, `SELECT name_zh FROM colors WHERE id=$1`, req.IntoID).Scan(&targetName); err != nil {
		respondError(w, http.StatusNotFound, "target color not found")
		return
	}
	if _, err := tx.Exec(ctx, `UPDATE product_variants SET color=$1 WHERE color=$2`, targetName, sourceName); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to reassign variants")
		return
	}
	if _, err := tx.Exec(ctx, `DELETE FROM colors WHERE id=$1`, id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to delete merged color")
		return
	}
	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to merge color")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *ColorHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid color id")
		return
	}
	if _, err := h.DB.Exec(r.Context(), `DELETE FROM colors WHERE id=$1`, id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to delete color")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
