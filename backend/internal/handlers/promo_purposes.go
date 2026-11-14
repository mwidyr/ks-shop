package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
)

// Promotion Purposes: the editable list CS picks from when applying a promotion (Promotion Management > Purpose
// Settings). A purpose is never deleted, only disabled, and every usage record keeps a copy of the name it had.

type purposeView struct {
	ID         int    `json:"id"`
	Name       string `json:"name"`
	SortOrder  int    `json:"sort_order"`
	IsActive   bool   `json:"is_active"`
	IsSystem   bool   `json:"is_system"` // recorded for automatic promotions and typed codes; cannot be disabled
	UsageCount int    `json:"usage_count"`
}

// Purposes lists them in their order. ?active=1 (the order forms) leaves out the disabled ones.
func (h *PromotionHandler) Purposes(w http.ResponseWriter, r *http.Request) {
	where := ""
	if r.URL.Query().Get("active") == "1" {
		where = "WHERE pp.is_active"
	}
	rows, err := h.DB.Query(r.Context(), `
		SELECT pp.id, pp.name, pp.sort_order, pp.is_active, pp.is_system,
		       (SELECT COUNT(*) FROM promotion_redemptions pr WHERE pr.purpose_id = pp.id)
		FROM promotion_purposes pp `+where+` ORDER BY pp.sort_order, pp.id`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch purposes")
		return
	}
	defer rows.Close()
	out := []purposeView{}
	for rows.Next() {
		var p purposeView
		if rows.Scan(&p.ID, &p.Name, &p.SortOrder, &p.IsActive, &p.IsSystem, &p.UsageCount) == nil {
			out = append(out, p)
		}
	}
	respondJSON(w, http.StatusOK, out)
}

type purposeRequest struct {
	Name     *string `json:"name"`
	IsActive *bool   `json:"is_active"`
}

func cleanPurposeName(n string) (string, string) {
	n = strings.TrimSpace(n)
	if n == "" || len([]rune(n)) > 80 {
		return "", "nama purpose wajib diisi (maks. 80 karakter)"
	}
	return n, ""
}

func (h *PromotionHandler) purposeNameTaken(r *http.Request, name string, exceptID int) bool {
	var taken bool
	h.DB.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM promotion_purposes WHERE lower(name) = lower($1) AND id <> $2)`, name, exceptID).Scan(&taken)
	return taken
}

// CreatePurpose adds a purpose at the end of the list.
func (h *PromotionHandler) CreatePurpose(w http.ResponseWriter, r *http.Request) {
	var req purposeRequest
	if err := decodeJSON(r, &req); err != nil || req.Name == nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	name, msg := cleanPurposeName(*req.Name)
	if msg != "" {
		respondError(w, http.StatusBadRequest, msg)
		return
	}
	if h.purposeNameTaken(r, name, 0) {
		respondError(w, http.StatusConflict, "nama purpose ini sudah ada")
		return
	}
	var id int
	if err := h.DB.QueryRow(r.Context(), `
		INSERT INTO promotion_purposes (name, sort_order) VALUES ($1, COALESCE((SELECT MAX(sort_order) FROM promotion_purposes), 0) + 1) RETURNING id`, name).Scan(&id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create purpose")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]int{"id": id})
}

// UpdatePurpose renames and / or enables / disables one purpose. Records already saved keep the old name.
func (h *PromotionHandler) UpdatePurpose(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	var req purposeRequest
	if err != nil || decodeJSON(r, &req) != nil || (req.Name == nil && req.IsActive == nil) {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	var isSystem bool
	if h.DB.QueryRow(r.Context(), `SELECT is_system FROM promotion_purposes WHERE id=$1`, id).Scan(&isSystem) != nil {
		respondError(w, http.StatusNotFound, "purpose not found")
		return
	}
	if req.Name != nil {
		name, msg := cleanPurposeName(*req.Name)
		if msg != "" {
			respondError(w, http.StatusBadRequest, msg)
			return
		}
		if h.purposeNameTaken(r, name, id) {
			respondError(w, http.StatusConflict, "nama purpose ini sudah ada")
			return
		}
		if _, err := h.DB.Exec(r.Context(), `UPDATE promotion_purposes SET name=$2, updated_at=now() WHERE id=$1`, id, name); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to update purpose")
			return
		}
	}
	if req.IsActive != nil {
		if !*req.IsActive && isSystem {
			respondError(w, http.StatusConflict, "purpose ini dipakai untuk promo otomatis dan kode yang diketik, jadi tidak bisa dinonaktifkan (boleh diganti namanya)")
			return
		}
		if _, err := h.DB.Exec(r.Context(), `UPDATE promotion_purposes SET is_active=$2, updated_at=now() WHERE id=$1`, id, *req.IsActive); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to update purpose")
			return
		}
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ReorderPurposes saves the order of the whole list: ids in the new order (every purpose exactly once).
func (h *PromotionHandler) ReorderPurposes(w http.ResponseWriter, r *http.Request) {
	var req struct {
		IDs []int `json:"ids"`
	}
	if err := decodeJSON(r, &req); err != nil || len(req.IDs) == 0 {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	ctx := r.Context()
	var total int
	h.DB.QueryRow(ctx, `SELECT COUNT(*) FROM promotion_purposes`).Scan(&total)
	seen := map[int]bool{}
	for _, id := range req.IDs {
		seen[id] = true
	}
	if len(seen) != len(req.IDs) || len(req.IDs) != total {
		respondError(w, http.StatusBadRequest, "ids must list every purpose exactly once")
		return
	}
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(ctx)
	for i, id := range req.IDs {
		ct, err := tx.Exec(ctx, `UPDATE promotion_purposes SET sort_order=$2 WHERE id=$1`, id, i+1)
		if err != nil || ct.RowsAffected() == 0 {
			respondError(w, http.StatusBadRequest, "unknown purpose")
			return
		}
	}
	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "db commit failed")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
