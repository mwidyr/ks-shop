package handlers

import "net/http"

// skuReportRow is one variant whose SKU still needs attention before go-live.
type skuReportRow struct {
	ProductID   int    `json:"product_id"`
	ProductCode string `json:"product_code"`
	ProductName string `json:"product_name"`
	VariantID   int    `json:"variant_id"`
	SKU         string `json:"sku"`
	Color       string `json:"color"`
	Size        string `json:"size"`
	// Issue: placeholder_code (product still on the auto PRD-#### code), color_not_in_master (color
	// kept as typed, not a Color Master name), color_no_english (master color without an English
	// name yet, so the SKU still carries the stored text), suffixed (got a -N because the SKU
	// collided - usually a duplicate variant), manual (typed by a super_user).
	Issue string `json:"issue"`
}

// SKUReport handles GET /products/sku-report (super_user): variants to tidy up so every SKU is
// PRODUCT CODE - English COLOR - SIZE without suffixes.
func (h *ProductHandler) SKUReport(w http.ResponseWriter, r *http.Request) {
	if !isAdmin(r) {
		respondError(w, http.StatusForbidden, "admin only")
		return
	}
	rows, err := h.DB.Query(r.Context(), `
		SELECT p.id, COALESCE(p.sku,''), p.name, pv.id, pv.sku, COALESCE(pv.color,''), COALESCE(pv.size,''), x.issue
		FROM product_variants pv
		JOIN products p ON p.id = pv.product_id
		CROSS JOIN LATERAL (VALUES
		    (CASE WHEN COALESCE(p.sku,'') ~ '^PRD-[0-9]+$' THEN 'placeholder_code' END),
		    (CASE WHEN btrim(COALESCE(pv.color,'')) <> '' AND NOT EXISTS (
		        SELECT 1 FROM colors c WHERE c.name_zh = btrim(pv.color) OR lower(c.name_id) = lower(btrim(pv.color))
		                                  OR lower(c.name_en) = lower(btrim(pv.color))) THEN 'color_not_in_master' END),
		    (CASE WHEN EXISTS (
		        SELECT 1 FROM colors c WHERE COALESCE(c.name_en,'') = ''
		          AND (c.name_zh = btrim(pv.color) OR lower(c.name_id) = lower(btrim(pv.color)))) THEN 'color_no_english' END),
		    (CASE WHEN NOT pv.sku_manual AND pv.sku ~ '-[1-9]$' AND EXISTS (
		        SELECT 1 FROM product_variants o WHERE o.id <> pv.id AND o.sku = left(pv.sku, length(pv.sku) - 2)) THEN 'suffixed' END),
		    (CASE WHEN pv.sku_manual THEN 'manual' END)
		) AS x(issue)
		WHERE p.deleted_at IS NULL AND x.issue IS NOT NULL
		ORDER BY p.sku NULLS LAST, pv.id, x.issue
		LIMIT 1000`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to build the SKU report")
		return
	}
	defer rows.Close()
	list := []skuReportRow{}
	for rows.Next() {
		var row skuReportRow
		if rows.Scan(&row.ProductID, &row.ProductCode, &row.ProductName, &row.VariantID, &row.SKU, &row.Color, &row.Size, &row.Issue) == nil {
			list = append(list, row)
		}
	}
	respondJSON(w, http.StatusOK, list)
}
