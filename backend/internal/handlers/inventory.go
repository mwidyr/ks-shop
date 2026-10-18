package handlers

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"ordermgmt/internal/cache"
)

// inventoryVariant / inventoryItem: what the Inventory page shows, nothing else. (The variant price,
// cost, broken / reserve stock and the product description are not part of it.)
type inventoryVariant struct {
	ID                int     `json:"id"`
	SKU               string  `json:"sku"`
	Color             string  `json:"color"`
	Size              string  `json:"size"`
	AvailableStock    int     `json:"available_stock"` // Actual
	IncomingStock     int     `json:"incoming_stock"`
	IncomingETA       *string `json:"incoming_eta"`
	IncomingOpenPO    bool    `json:"incoming_open_po"`
	ReservedForOrders int     `json:"reserved_for_orders"` // Ordered
	TotalStock        int     `json:"total_stock"`         // Available
	MinimumStock      int     `json:"minimum_stock"`
}

type inventoryItem struct {
	ID       int                `json:"id"`
	SKU      string             `json:"sku"`
	Name     string             `json:"name"`
	Images   []ProductImage     `json:"images"` // the first image only
	Variants []inventoryVariant `json:"variants"`
}

type inventorySummary struct {
	TotalActual  int `json:"total_available"` // Actual stock over every variant
	TotalOrdered int `json:"total_ordered"`
	LowStock     int `json:"low_stock"`
	Oversell     int `json:"oversell"`
}

const inventorySummaryTTL = 15 * time.Second

func (h *ProductHandler) inventorySummary(r *http.Request) (inventorySummary, error) {
	return cache.Get("inventory:summary", inventorySummaryTTL, func() (inventorySummary, error) {
		var s inventorySummary
		err := h.DB.QueryRow(r.Context(), `
			SELECT COALESCE(SUM(sb.available_stock),0)::int, COALESCE(SUM(COALESCE(rv.qty,0)),0)::int,
			       COUNT(*) FILTER (WHERE sb.minimum_stock > 0 AND sb.available_stock <= sb.minimum_stock),
			       COUNT(*) FILTER (WHERE sb.available_stock < 0)
			FROM product_variants pv
			JOIN products p ON p.id = pv.product_id AND p.deleted_at IS NULL
			JOIN stock_buckets sb ON sb.variant_id = pv.id
			LEFT JOIN `+orderedByVariantSQL+` rv ON rv.variant_id = pv.id`).
			Scan(&s.TotalActual, &s.TotalOrdered, &s.LowStock, &s.Oversell)
		return s, err
	})
}

// Inventory serves GET /inventory?q=&page=&page_size=: one page of products with their variants'
// stock, searched on the server (product name / code, variant code / color / size), plus the totals of
// the summary cards over the WHOLE catalogue.
func (h *ProductHandler) Inventory(w http.ResponseWriter, r *http.Request) {
	pg := parsePage(r, 30, 100)
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	where := " WHERE p.deleted_at IS NULL"
	var args []any
	if q != "" {
		args = append(args, likePattern(q))
		where += " AND " + productSearchSQL("p", "$1")
	}
	var total int
	if err := h.DB.QueryRow(r.Context(), "SELECT COUNT(*) FROM products p"+where, args...).Scan(&total); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch inventory")
		return
	}
	pageArgs := append(append([]any{}, args...), pg.Size, pg.Offset)
	rows, err := h.DB.Query(r.Context(), "SELECT p.id FROM products p"+where+
		" ORDER BY p.id LIMIT $"+strconv.Itoa(len(pageArgs)-1)+" OFFSET $"+strconv.Itoa(len(pageArgs)), pageArgs...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch inventory")
		return
	}
	ids := []int{}
	for rows.Next() {
		var id int
		if rows.Scan(&id) == nil {
			ids = append(ids, id)
		}
	}
	rows.Close()
	products, err := h.loadProducts(r, ids)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch inventory")
		return
	}
	items := make([]inventoryItem, 0, len(products))
	for _, p := range inIDOrder(products, ids) {
		it := inventoryItem{ID: p.ID, SKU: p.SKU, Name: p.Name, Images: []ProductImage{}, Variants: make([]inventoryVariant, 0, len(p.Variants))}
		if len(p.Images) > 0 {
			it.Images = p.Images[:1]
		}
		for _, v := range p.Variants {
			it.Variants = append(it.Variants, inventoryVariant{
				ID: v.ID, SKU: v.SKU, Color: v.Color, Size: v.Size, AvailableStock: v.AvailableStock, IncomingStock: v.IncomingStock,
				IncomingETA: v.IncomingETA, IncomingOpenPO: v.IncomingOpenPO, ReservedForOrders: v.ReservedForOrders,
				TotalStock: v.TotalStock, MinimumStock: v.MinimumStock,
			})
		}
		items = append(items, it)
	}
	summary, err := h.inventorySummary(r)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch inventory")
		return
	}
	resp := pageResponse(items, total, pg)
	resp["summary"] = summary
	respondJSON(w, http.StatusOK, resp)
}

type updateVariantStockRequest struct {
	AvailableStock int `json:"available_stock"`
	IncomingStock  int `json:"incoming_stock"`
}

// UpdateVariantStock serves PATCH /variants/{variantId}/stock: the two numbers the Inventory page edits
// (Actual and Incoming). Everything else on the variant (price, cost, broken / reserve / minimum stock,
// code, color, size) stays as it is - unlike UpdateVariant, which replaces the whole variant. Every
// change is logged in stock_movements like before.
func (h *ProductHandler) UpdateVariantStock(w http.ResponseWriter, r *http.Request) {
	variantID, err := strconv.Atoi(chi.URLParam(r, "variantId"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid variant id")
		return
	}
	var req updateVariantStockRequest
	if err := decodeJSON(r, &req); err != nil || req.IncomingStock < 0 {
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

	var beforeActual, beforeIncoming int
	if err := tx.QueryRow(ctx, `SELECT available_stock, incoming_stock FROM stock_buckets WHERE variant_id=$1 FOR UPDATE`, variantID).
		Scan(&beforeActual, &beforeIncoming); err != nil {
		respondError(w, http.StatusNotFound, "variant not found")
		return
	}
	if _, err := tx.Exec(ctx, `UPDATE stock_buckets SET available_stock=$1, incoming_stock=$2 WHERE variant_id=$3`,
		req.AvailableStock, req.IncomingStock, variantID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to update stock")
		return
	}
	claims := getClaimsSafe(r)
	logAdjustment(ctx, tx, variantID, "available_stock", beforeActual, req.AvailableStock, claims)
	logAdjustment(ctx, tx, variantID, "incoming_stock", beforeIncoming, req.IncomingStock, claims)
	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "db commit failed")
		return
	}
	cache.Invalidate("inventory:")
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
