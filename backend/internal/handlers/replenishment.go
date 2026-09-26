package handlers

import (
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ReplenishmentHandler powers Replenishment Planning (replaces Purchase Alert): a data-based
// view of which products need reordering and roughly how much, combining Inventory, Order
// history, and Supplier lead time. Confirmed with client: Avg Daily Sales uses ALL sales data
// (no LIVE Data gating - unlike Performance Dashboard/Host Analytics/Heatmap, unrelated), since
// they're planning a future website and mixing channels would make a LIVE-only average wrong
// here specifically.
type ReplenishmentHandler struct {
	DB *pgxpool.Pool
}

var validSalesBasis = map[int]bool{7: true, 14: true, 30: true}

type replenishmentRow struct {
	VariantID           int      `json:"variant_id"`
	ProductID           int      `json:"product_id"`
	ProductSKU          string   `json:"product_sku"`
	ProductName         string   `json:"product_name"`
	Category            string   `json:"category"`
	SupplierID          *int     `json:"supplier_id"`
	SupplierName        string   `json:"supplier_name"`
	Color               string   `json:"color"`
	Size                string   `json:"size"`
	PhysicalStock       int      `json:"physical_stock"`
	IncomingStock       int      `json:"incoming_stock"`
	OrderedQty          int      `json:"ordered_qty"` // stock already committed to unfulfilled customer orders (stock_buckets.order_stock)
	SellableStock       int      `json:"sellable_stock"`
	Sales7D             int      `json:"sales_7d"`
	Sales14D            int      `json:"sales_14d"`
	Sales30D            int      `json:"sales_30d"`
	AvgDailySales       *float64 `json:"avg_daily_sales"`
	EstimatedStockDays  *float64 `json:"estimated_stock_days"`
	SuggestedReorderQty int      `json:"suggested_reorder_qty"`
	LeadTimeDays        *int     `json:"lead_time_days"`
	StockStatus         string   `json:"stock_status"` // critical, requires_replenishment, ok
}

// List returns the full replenishment planning table. Query params: ?basis=7|14|30 (default 30,
// which window Avg Daily Sales is computed from), ?target_stock_days= (default 30, used for the
// Suggested Reorder QTY formula), ?supplier_id=, ?category=, ?stock_status=critical|requires_replenishment|ok.
func (h *ReplenishmentHandler) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	basis := 30
	if b, err := strconv.Atoi(q.Get("basis")); err == nil && validSalesBasis[b] {
		basis = b
	}
	targetStockDays := 30
	if t, err := strconv.Atoi(q.Get("target_stock_days")); err == nil && t > 0 {
		targetStockDays = t
	}

	where := " WHERE p.is_active = true"
	args := []interface{}{}
	argN := 1
	if supplierID := q.Get("supplier_id"); supplierID != "" {
		args = append(args, supplierID)
		where += " AND p.supplier_id = $" + strconv.Itoa(argN)
		argN++
	}
	if category := q.Get("category"); category != "" {
		args = append(args, category)
		where += " AND p.category = $" + strconv.Itoa(argN)
		argN++
	}

	query := `
		WITH sales_agg AS (
			SELECT oi.variant_id,
			       SUM(CASE WHEN o.created_at >= now() - interval '7 days' THEN oi.qty ELSE 0 END) AS sales_7d,
			       SUM(CASE WHEN o.created_at >= now() - interval '14 days' THEN oi.qty ELSE 0 END) AS sales_14d,
			       SUM(CASE WHEN o.created_at >= now() - interval '30 days' THEN oi.qty ELSE 0 END) AS sales_30d
			FROM order_items oi
			JOIN orders o ON o.id = oi.order_id
			WHERE o.status NOT IN ('cancelled','return') AND o.created_at >= now() - interval '30 days'
			GROUP BY oi.variant_id
		)
		SELECT pv.id, p.id, COALESCE(p.sku,''), p.name, COALESCE(p.category,''), p.supplier_id, COALESCE(s.name,'-'),
		       pv.color, pv.size, sb.available_stock, sb.incoming_stock, sb.order_stock,
		       COALESCE(sa.sales_7d,0), COALESCE(sa.sales_14d,0), COALESCE(sa.sales_30d,0), s.default_lead_time_days
		FROM product_variants pv
		JOIN products p ON p.id = pv.product_id
		JOIN stock_buckets sb ON sb.variant_id = pv.id
		LEFT JOIN suppliers s ON s.id = p.supplier_id
		LEFT JOIN sales_agg sa ON sa.variant_id = pv.id` + where + `
		ORDER BY p.name, pv.color, pv.size`

	rows, err := h.DB.Query(r.Context(), query, args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch replenishment data")
		return
	}
	defer rows.Close()

	statusFilter := q.Get("stock_status")
	list := []replenishmentRow{}
	for rows.Next() {
		var row replenishmentRow
		if err := rows.Scan(&row.VariantID, &row.ProductID, &row.ProductSKU, &row.ProductName, &row.Category,
			&row.SupplierID, &row.SupplierName, &row.Color, &row.Size, &row.PhysicalStock, &row.IncomingStock,
			&row.OrderedQty, &row.Sales7D, &row.Sales14D, &row.Sales30D, &row.LeadTimeDays); err != nil {
			continue
		}
		row.SellableStock = row.PhysicalStock + row.IncomingStock - row.OrderedQty

		var salesForBasis int
		switch basis {
		case 7:
			salesForBasis = row.Sales7D
		case 14:
			salesForBasis = row.Sales14D
		default:
			salesForBasis = row.Sales30D
		}
		avgDaily := float64(salesForBasis) / float64(basis)
		if salesForBasis > 0 {
			row.AvgDailySales = &avgDaily
			estDays := float64(row.SellableStock) / avgDaily
			row.EstimatedStockDays = &estDays

			leadTime := 0
			if row.LeadTimeDays != nil {
				leadTime = *row.LeadTimeDays
			}
			projectedAtArrival := float64(row.SellableStock) - (avgDaily * float64(leadTime))
			suggested := (avgDaily * float64(targetStockDays)) - projectedAtArrival
			if suggested < 0 {
				suggested = 0
			}
			row.SuggestedReorderQty = int(suggested + 0.999999) // ceil, without importing math for one call

			if estDays <= float64(leadTime) || row.SellableStock <= 0 {
				row.StockStatus = "critical"
			} else if row.SuggestedReorderQty > 0 {
				row.StockStatus = "requires_replenishment"
			} else {
				row.StockStatus = "ok"
			}
		} else {
			// No sales in the window - can't estimate, per spec ("no sales yet"), so no
			// suggestion and no critical/requires_replenishment flag either.
			row.StockStatus = "ok"
			if row.SellableStock <= 0 {
				row.StockStatus = "critical"
			}
		}

		if statusFilter != "" && row.StockStatus != statusFilter {
			continue
		}
		list = append(list, row)
	}
	respondJSON(w, http.StatusOK, list)
}
