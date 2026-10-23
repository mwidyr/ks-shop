package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ColorHandler manages the Color master list (Color Management) - mirrors CategoryHandler:
// name_zh is the canonical value product_variants.color is matched against (free text, not an
// FK, same as categories), name_id is a display-layer translation, and name_en is the English
// name used both for display and as the color part of every variant SKU (resolveSKUColor) - so
// changing it, or merging colors, recomputes the affected automatic SKUs.
type ColorHandler struct {
	DB *pgxpool.Pool
}

type colorView struct {
	ID     int    `json:"id"`
	NameZh string `json:"name_zh"`
	NameID string `json:"name_id"`
	NameEn string `json:"name_en"`
	// UsedCount = number of different PRODUCTS (styles) with at least one variant in this color -
	// not variants and not stock. Matches the variant color stored as either the Chinese name
	// (canonical) or the Indonesian name (legacy free-text entered before Color Master existed).
	UsedCount int `json:"used_count"`
}

func (h *ColorHandler) List(w http.ResponseWriter, r *http.Request) {
	rows, err := h.DB.Query(r.Context(), `
		SELECT c.id, c.name_zh, c.name_id, COALESCE(c.name_en,''), COUNT(DISTINCT p.id)
		FROM colors c
		LEFT JOIN product_variants v ON v.color = c.name_zh OR v.color = c.name_id OR v.color = c.name_en
		LEFT JOIN products p ON p.id = v.product_id AND p.deleted_at IS NULL
		GROUP BY c.id, c.name_zh, c.name_id, c.name_en ORDER BY c.name_zh`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch colors")
		return
	}
	defer rows.Close()

	list := []colorView{}
	for rows.Next() {
		var c colorView
		if err := rows.Scan(&c.ID, &c.NameZh, &c.NameID, &c.NameEn, &c.UsedCount); err != nil {
			continue
		}
		list = append(list, c)
	}
	respondJSON(w, http.StatusOK, list)
}

type colorRequest struct {
	NameZh string  `json:"name_zh"`
	NameID string  `json:"name_id"`
	NameEn *string `json:"name_en"`
}

func (h *ColorHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req colorRequest
	if err := decodeJSON(r, &req); err != nil || strings.TrimSpace(req.NameZh) == "" || strings.TrimSpace(req.NameID) == "" ||
		req.NameEn == nil || strings.TrimSpace(*req.NameEn) == "" {
		respondError(w, http.StatusBadRequest, "name_zh, name_id and name_en are required")
		return
	}
	var id int
	if err := h.DB.QueryRow(r.Context(), `
		INSERT INTO colors (name_zh, name_id, name_en) VALUES ($1, $2, $3) RETURNING id`,
		strings.TrimSpace(req.NameZh), strings.TrimSpace(req.NameID), strings.TrimSpace(*req.NameEn)).Scan(&id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create color (mungkin sudah ada)")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]int{"id": id})
}

// Update edits the Indonesian and/or English name - see CategoryHandler.Update for why name_zh
// (the join key) is intentionally immutable here. A new English name flows into the SKUs.
func (h *ColorHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid color id")
		return
	}
	var req colorRequest
	if err := decodeJSON(r, &req); err != nil || (strings.TrimSpace(req.NameID) == "" && req.NameEn == nil) ||
		(req.NameEn != nil && strings.TrimSpace(*req.NameEn) == "") {
		respondError(w, http.StatusBadRequest, "name_id or a non-empty name_en is required")
		return
	}
	ctx := r.Context()
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to update color")
		return
	}
	defer tx.Rollback(ctx)
	var zh, oldID, oldEn string
	if err := tx.QueryRow(ctx, `SELECT name_zh, name_id, COALESCE(name_en,'') FROM colors WHERE id=$1 FOR UPDATE`, id).Scan(&zh, &oldID, &oldEn); err != nil {
		respondError(w, http.StatusNotFound, "color not found")
		return
	}
	newID, newEn := oldID, oldEn
	if v := strings.TrimSpace(req.NameID); v != "" {
		newID = v
	}
	if req.NameEn != nil {
		newEn = strings.TrimSpace(*req.NameEn)
	}
	if _, err := tx.Exec(ctx, `UPDATE colors SET name_id=$1, name_en=$2 WHERE id=$3`, newID, newEn, id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to update color")
		return
	}
	if newEn != oldEn {
		if err := regenerateColorVariantSKUsTx(ctx, tx, []string{zh, oldID, newID, oldEn, newEn}, "color_rename", actorID(r)); err != nil {
			respondError(w, http.StatusConflict, "failed to update the SKUs of this color: "+err.Error())
			return
		}
	}
	if err := tx.Commit(ctx); err != nil {
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
	if err := regenerateColorVariantSKUsTx(ctx, tx, []string{targetName}, "color_merge", actorID(r)); err != nil {
		respondError(w, http.StatusConflict, "failed to update the SKUs of the merged color: "+err.Error())
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

// actorID is the signed-in staff user, for audit rows (nil when unknown).
func actorID(r *http.Request) *int {
	if c := getClaimsSafe(r); c != nil {
		return &c.UserID
	}
	return nil
}
