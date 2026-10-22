package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
)

// Multi-supplier support (#125, 103_variant_suppliers.sql): every variant (SKU) of a product can be
// linked to several suppliers, each with its own product code, 1688 URL, reference price and
// currency, active flag and one preferred supplier. Editing the links never creates a new SKU.

type variantSupplierLink struct {
	ID                  int      `json:"id"`
	VariantID           int      `json:"variant_id"`
	SupplierID          int      `json:"supplier_id"`
	SupplierName        string   `json:"supplier_name"`
	SupplierProductCode string   `json:"supplier_product_code"`
	URL1688             string   `json:"url_1688"`
	RefPrice            *float64 `json:"ref_price"`
	Currency            string   `json:"currency"`
	IsActive            bool     `json:"is_active"`
	IsPreferred         bool     `json:"is_preferred"`
}

// ListVariantSuppliers handles GET /products/{id}/variant-suppliers: every link of every variant.
func (h *ProductHandler) ListVariantSuppliers(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid product id")
		return
	}
	rows, err := h.DB.Query(r.Context(), `
		SELECT vs.id, vs.variant_id, vs.supplier_id, s.name, COALESCE(vs.supplier_product_code,''), COALESCE(vs.url_1688,''),
		       vs.ref_price, vs.currency, vs.is_active, vs.is_preferred
		FROM variant_suppliers vs
		JOIN product_variants pv ON pv.id = vs.variant_id
		JOIN suppliers s ON s.id = vs.supplier_id
		WHERE pv.product_id = $1
		ORDER BY vs.variant_id, vs.is_preferred DESC, s.name`, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch variant suppliers")
		return
	}
	defer rows.Close()
	list := []variantSupplierLink{}
	for rows.Next() {
		var l variantSupplierLink
		if err := rows.Scan(&l.ID, &l.VariantID, &l.SupplierID, &l.SupplierName, &l.SupplierProductCode, &l.URL1688,
			&l.RefPrice, &l.Currency, &l.IsActive, &l.IsPreferred); err != nil {
			continue
		}
		list = append(list, l)
	}
	respondJSON(w, http.StatusOK, list)
}

type saveVariantSuppliersRequest struct {
	Links []variantSupplierLink `json:"links"`
}

// validateVariantSupplierLinks checks a full replacement list: known variants of the product, no
// supplier twice on a variant, at most one preferred (and only an active one) per variant,
// non-negative prices. Returns a user-facing message ("" when valid).
func validateVariantSupplierLinks(links []variantSupplierLink, productVariants map[int]bool) string {
	seen := map[[2]int]bool{}
	preferred := map[int]bool{}
	for _, l := range links {
		if !productVariants[l.VariantID] {
			return "variant " + strconv.Itoa(l.VariantID) + " does not belong to this product"
		}
		if l.SupplierID == 0 {
			return "every link needs a supplier"
		}
		key := [2]int{l.VariantID, l.SupplierID}
		if seen[key] {
			return "a supplier can only be linked once per variant"
		}
		seen[key] = true
		if l.RefPrice != nil && *l.RefPrice < 0 {
			return "reference price must not be negative"
		}
		if c := strings.ToUpper(strings.TrimSpace(l.Currency)); c != "" && c != "RMB" && c != "TWD" {
			return "currency must be RMB or TWD"
		}
		if l.IsPreferred {
			if !l.IsActive {
				return "an inactive supplier can't be the preferred one"
			}
			if preferred[l.VariantID] {
				return "only one preferred supplier per variant"
			}
			preferred[l.VariantID] = true
		}
	}
	return ""
}

// SaveVariantSuppliers handles PUT /products/{id}/variant-suppliers: replaces all links of the
// product's variants with the given list in one transaction.
func (h *ProductHandler) SaveVariantSuppliers(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	var req saveVariantSuppliersRequest
	if err != nil || decodeJSON(r, &req) != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	ctx := r.Context()
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(ctx)

	variants := map[int]bool{}
	vRows, err := tx.Query(ctx, `SELECT id FROM product_variants WHERE product_id=$1`, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load variants")
		return
	}
	for vRows.Next() {
		var vid int
		if vRows.Scan(&vid) == nil {
			variants[vid] = true
		}
	}
	vRows.Close()
	if len(variants) == 0 {
		respondError(w, http.StatusNotFound, "product not found or has no variants")
		return
	}
	if msg := validateVariantSupplierLinks(req.Links, variants); msg != "" {
		respondError(w, http.StatusBadRequest, msg)
		return
	}

	if _, err := tx.Exec(ctx, `DELETE FROM variant_suppliers WHERE variant_id IN (SELECT id FROM product_variants WHERE product_id=$1)`, id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save variant suppliers")
		return
	}
	for _, l := range req.Links {
		currency := strings.ToUpper(strings.TrimSpace(l.Currency))
		if currency == "" {
			currency = "RMB"
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO variant_suppliers (variant_id, supplier_id, supplier_product_code, url_1688, ref_price, currency, is_active, is_preferred)
			VALUES ($1,$2,NULLIF($3,''),NULLIF($4,''),$5,$6,$7,$8)`,
			l.VariantID, l.SupplierID, strings.TrimSpace(l.SupplierProductCode), strings.TrimSpace(l.URL1688), l.RefPrice, currency, l.IsActive, l.IsPreferred); err != nil {
			respondError(w, http.StatusBadRequest, "failed to save variant suppliers (unknown supplier?)")
			return
		}
	}
	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "db commit failed")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

type productCostChange struct {
	OldCost   float64 `json:"old_cost"`
	NewCost   float64 `json:"new_cost"`
	Currency  string  `json:"currency"`
	Source    string  `json:"source"`
	PONumber  *string `json:"po_number"`
	ChangedBy string  `json:"changed_by"`
	ChangedAt string  `json:"changed_at"`
}

// CostHistory handles GET /products/{id}/cost-history (#133): every change of the RMB default
// cost, newest first. super_user only, like the cost itself (see isAdmin).
func (h *ProductHandler) CostHistory(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid product id")
		return
	}
	if !isAdmin(r) {
		respondError(w, http.StatusForbidden, "admin only")
		return
	}
	rows, err := h.DB.Query(r.Context(), `
		SELECT h.old_cost, h.new_cost, h.currency, h.source, p.po_number, COALESCE(u.name,'-'), h.changed_at::text
		FROM product_cost_history h
		LEFT JOIN purchases p ON p.id = h.purchase_id
		LEFT JOIN users u ON u.id = h.changed_by
		WHERE h.product_id = $1 ORDER BY h.changed_at DESC, h.id DESC LIMIT 200`, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch cost history")
		return
	}
	defer rows.Close()
	list := []productCostChange{}
	for rows.Next() {
		var c productCostChange
		if rows.Scan(&c.OldCost, &c.NewCost, &c.Currency, &c.Source, &c.PONumber, &c.ChangedBy, &c.ChangedAt) == nil {
			list = append(list, c)
		}
	}
	respondJSON(w, http.StatusOK, list)
}
