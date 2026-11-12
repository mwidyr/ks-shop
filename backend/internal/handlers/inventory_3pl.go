package handlers

import (
	"fmt"
	"net/http"
	"sort"
	"strings"

	"ordermgmt/internal/cache"
)

// 3PL stock sync: the 3PL's own SKU codes have no hyphens (P023-KHAKI-L -> P023KHAKIL), so SKUs are
// matched with hyphens and case ignored. Nothing is changed by the preview; the apply step only
// touches rows the admin ticked, and only Actual stock (available_stock).

type tplLine struct {
	SKU string `json:"sku"`
	Qty int    `json:"qty"`
}

type tplSystemVariant struct {
	ID     int
	SKU    string
	Actual int
}

type tplRow struct {
	VariantID int    `json:"variant_id"`
	SKU       string `json:"sku"`
	Before    int    `json:"before"`
	After     int    `json:"after"`
	Diff      int    `json:"diff"`
}

type tplPreview struct {
	Rows         []tplRow `json:"rows"`          // matched SKUs, including unchanged ones
	UnknownInSys []string `json:"unknown"`       // in the file, not in our system
	Ambiguous    []string `json:"ambiguous"`     // file SKU matching two or more of ours
	MissingInTPL []string `json:"missing"`       // in our system, not in the file (left unchanged)
	DuplicateSKU []string `json:"duplicate_sku"` // file SKU listed more than once (last one ignored)
}

func tplKey(sku string) string {
	return strings.ToUpper(strings.ReplaceAll(strings.TrimSpace(sku), "-", ""))
}

// buildTPLPreview matches file lines against system variants. Pure function, no database.
func buildTPLPreview(lines []tplLine, sys []tplSystemVariant) tplPreview {
	byKey := map[string][]tplSystemVariant{}
	for _, v := range sys {
		k := tplKey(v.SKU)
		byKey[k] = append(byKey[k], v)
	}
	p := tplPreview{Rows: []tplRow{}, UnknownInSys: []string{}, Ambiguous: []string{}, MissingInTPL: []string{}, DuplicateSKU: []string{}}
	seen := map[string]bool{}
	for _, l := range lines {
		k := tplKey(l.SKU)
		if k == "" {
			continue
		}
		if seen[k] {
			p.DuplicateSKU = append(p.DuplicateSKU, l.SKU)
			continue
		}
		seen[k] = true
		m := byKey[k]
		switch {
		case len(m) == 0:
			p.UnknownInSys = append(p.UnknownInSys, l.SKU)
		case len(m) > 1:
			p.Ambiguous = append(p.Ambiguous, l.SKU)
		default:
			p.Rows = append(p.Rows, tplRow{VariantID: m[0].ID, SKU: m[0].SKU, Before: m[0].Actual, After: l.Qty, Diff: l.Qty - m[0].Actual})
		}
	}
	for _, v := range sys {
		if !seen[tplKey(v.SKU)] {
			p.MissingInTPL = append(p.MissingInTPL, v.SKU)
		}
	}
	sort.Strings(p.MissingInTPL)
	return p
}

func (h *ProductHandler) loadTPLSystem(r *http.Request) ([]tplSystemVariant, error) {
	rows, err := h.DB.Query(r.Context(), `
		SELECT v.id, v.sku, sb.available_stock
		FROM product_variants v JOIN stock_buckets sb ON sb.variant_id = v.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []tplSystemVariant
	for rows.Next() {
		var v tplSystemVariant
		if err := rows.Scan(&v.ID, &v.SKU, &v.Actual); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

type tplRequest struct {
	Lines []tplLine `json:"lines"`
}

func validTPLLines(lines []tplLine) bool {
	if len(lines) == 0 || len(lines) > 5000 {
		return false
	}
	for _, l := range lines {
		if l.Qty < 0 || l.Qty > 1000000 {
			return false
		}
	}
	return true
}

// TPLPreview compares the 3PL file with our Actual stock. Read only.
func (h *ProductHandler) TPLPreview(w http.ResponseWriter, r *http.Request) {
	var req tplRequest
	if err := decodeJSON(r, &req); err != nil || !validTPLLines(req.Lines) {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	sys, err := h.loadTPLSystem(r)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load inventory")
		return
	}
	respondJSON(w, http.StatusOK, buildTPLPreview(req.Lines, sys))
}

type tplApplyRequest struct {
	Lines []tplLine `json:"lines"` // only the rows the admin ticked
}

// TPLApply overwrites Actual stock for the ticked SKUs, in one transaction, logging every change.
// The "before" value is re-read under a row lock, so the history is right even if stock moved
// since the preview. SKUs are re-matched here; unknown or ambiguous ones fail the whole request.
func (h *ProductHandler) TPLApply(w http.ResponseWriter, r *http.Request) {
	var req tplApplyRequest
	if err := decodeJSON(r, &req); err != nil || !validTPLLines(req.Lines) {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	sys, err := h.loadTPLSystem(r)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load inventory")
		return
	}
	pv := buildTPLPreview(req.Lines, sys)
	if len(pv.UnknownInSys) > 0 || len(pv.Ambiguous) > 0 {
		respondError(w, http.StatusBadRequest, "some SKUs cannot be matched")
		return
	}
	ctx := r.Context()
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(ctx)
	claims := getClaimsSafe(r)
	var userID *int
	if claims != nil {
		userID = &claims.UserID
	}
	changed := 0
	for _, row := range pv.Rows {
		var before int
		if err := tx.QueryRow(ctx, `SELECT available_stock FROM stock_buckets WHERE variant_id=$1 FOR UPDATE`, row.VariantID).Scan(&before); err != nil {
			respondError(w, http.StatusNotFound, "variant not found")
			return
		}
		if before == row.After {
			continue
		}
		if _, err := tx.Exec(ctx, `UPDATE stock_buckets SET available_stock=$1 WHERE variant_id=$2`, row.After, row.VariantID); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to update stock")
			return
		}
		qty, dir := row.After-before, "increase"
		if qty < 0 {
			qty, dir = -qty, "decrease"
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO stock_movements (variant_id, bucket_from, bucket_to, qty, event_type, user_id, note)
			VALUES ($1,'available_stock','available_stock',$2,'stock_adjustment',$3,$4)`,
			row.VariantID, qty, userID, fmt.Sprintf("%s via 3PL stock sync (%d -> %d)", dir, before, row.After)); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to log stock change")
			return
		}
		changed++
	}
	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "db commit failed")
		return
	}
	cache.Invalidate("inventory:")
	respondJSON(w, http.StatusOK, map[string]int{"changed": changed})
}
