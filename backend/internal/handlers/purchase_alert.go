package handlers

import (
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5/pgxpool"
)

// PurchaseAlertHandler flags variants likely to run out of stock soon, based on real average
// daily consumption (order_created stock_movements) over a selectable period.
type PurchaseAlertHandler struct {
	DB *pgxpool.Pool
}

type purchaseAlertRow struct {
	VariantID         int      `json:"variant_id"`
	ProductName       string   `json:"product_name"`
	SKU               string   `json:"sku"`
	Color             string   `json:"color"`
	Size              string   `json:"size"`
	AvailableStock    int      `json:"available_stock"`
	AvgDailyQty       float64  `json:"avg_daily_qty"`
	EstimatedDaysLeft *float64 `json:"estimated_days_left"`
}

// List returns every variant with real recent sales velocity, sorted by soonest-to-stock-out
// first. ?days=7|14|30 selects the lookback window (default 30). A variant only appears with an
// EstimatedDaysLeft when it has sold at least once in the window (zero velocity means "can't
// estimate", not "safe forever").
func (h *PurchaseAlertHandler) List(w http.ResponseWriter, r *http.Request) {
	days := 30
	if d, err := strconv.Atoi(r.URL.Query().Get("days")); err == nil && (d == 7 || d == 14 || d == 30) {
		days = d
	}
	onlyAtRisk := r.URL.Query().Get("at_risk_only") == "true"

	rows, err := h.DB.Query(r.Context(), `
		SELECT pv.id, p.name, pv.sku, pv.color, pv.size, sb.available_stock,
		       COALESCE((
		           SELECT SUM(sm.qty) FROM stock_movements sm
		           WHERE sm.variant_id = pv.id AND sm.event_type = 'order_created'
		             AND sm.created_at >= now() - make_interval(days => $1)
		       ), 0)::float / $1::float
		FROM product_variants pv
		JOIN products p ON p.id = pv.product_id
		JOIN stock_buckets sb ON sb.variant_id = pv.id
		WHERE p.is_active = true
		ORDER BY p.name, pv.sku`, days)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to compute purchase alert")
		return
	}
	defer rows.Close()

	list := []purchaseAlertRow{}
	for rows.Next() {
		var row purchaseAlertRow
		if err := rows.Scan(&row.VariantID, &row.ProductName, &row.SKU, &row.Color, &row.Size, &row.AvailableStock, &row.AvgDailyQty); err != nil {
			continue
		}
		if row.AvgDailyQty > 0 {
			days := float64(row.AvailableStock) / row.AvgDailyQty
			row.EstimatedDaysLeft = &days
		}
		if onlyAtRisk && (row.EstimatedDaysLeft == nil || *row.EstimatedDaysLeft > 7) {
			continue
		}
		list = append(list, row)
	}
	respondJSON(w, http.StatusOK, list)
}
