package handlers

import (
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type DashboardHandler struct {
	DB *pgxpool.Pool
}

// dateRange resolves the from/to query params to a [from, to) window.
// Defaults to "all time" (zero time -> now) when not provided.
func dateRange(r *http.Request) (time.Time, time.Time, bool) {
	q := r.URL.Query()
	fromStr, toStr := q.Get("from"), q.Get("to")
	if fromStr == "" && toStr == "" {
		return time.Time{}, time.Time{}, false
	}
	from, _ := time.Parse("2006-01-02", fromStr)
	to, err := time.Parse("2006-01-02", toStr)
	if err == nil {
		to = to.Add(24 * time.Hour)
	} else {
		to = time.Now()
	}
	return from, to, true
}

// Summary returns order counts and revenue by status, optionally filtered to a date range.
func (h *DashboardHandler) Summary(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	from, to, filtered := dateRange(r)

	statusCounts := map[string]int{}
	statusQuery := `SELECT status, COUNT(*) FROM orders o WHERE 1=1`
	var statusArgs []interface{}
	if filtered {
		statusQuery += ` AND o.created_at >= $1 AND o.created_at < $2`
		statusArgs = append(statusArgs, from, to)
	}
	statusQuery += ` GROUP BY status`
	rows, err := h.DB.Query(ctx, statusQuery, statusArgs...)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var s string
			var c int
			rows.Scan(&s, &c)
			statusCounts[s] = c
		}
	}

	statusRevenue := map[string]float64{}
	var totalQty int
	var totalRevenue float64
	// Per-order totals (item subtotal - discount + additional) are computed once via the
	// LATERAL join, then aggregated by status - a plain SUM over a LEFT JOIN would otherwise
	// double-count the order-level discount/additional once per item row.
	revQuery := `
		SELECT o.status, COALESCE(SUM(ord.total),0), COALESCE(SUM(ord.qty),0)
		FROM orders o
		JOIN LATERAL (
			SELECT COALESCE(SUM(oi.qty * oi.price_at_order),0) - o.discount_amount + o.additional_amount AS total,
			       COALESCE(SUM(oi.qty),0) AS qty
			FROM order_items oi WHERE oi.order_id = o.id
		) ord ON true
		WHERE 1=1`
	var revArgs []interface{}
	if filtered {
		revQuery += ` AND o.created_at >= $1 AND o.created_at < $2`
		revArgs = append(revArgs, from, to)
	}
	revQuery += ` GROUP BY o.status`
	revRows, err := h.DB.Query(ctx, revQuery, revArgs...)
	if err == nil {
		defer revRows.Close()
		for revRows.Next() {
			var s string
			var rev float64
			var qty int
			revRows.Scan(&s, &rev, &qty)
			statusRevenue[s] = rev
			totalRevenue += rev
			totalQty += qty
		}
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"order_status_counts":  statusCounts,
		"order_status_revenue": statusRevenue,
		"total_qty":            totalQty,
		"total_revenue":        totalRevenue,
	})
}

type graphPoint struct {
	Day     string  `json:"day"`
	HostID  int     `json:"host_id"`
	Host    string  `json:"host"`
	Qty     int     `json:"qty"`
	Revenue float64 `json:"revenue"`
}

// Graph returns per-day, per-host quantity sold and revenue, for the dashboard chart.
// Cancelled/returned orders are excluded from "sold" metrics.
func (h *DashboardHandler) Graph(w http.ResponseWriter, r *http.Request) {
	from, to, filtered := dateRange(r)
	if !filtered {
		to = time.Now()
		from = to.AddDate(0, 0, -30)
	}

	rows, err := h.DB.Query(r.Context(), `
		SELECT date_trunc('day', o.created_at)::date::text AS day, h.id, h.name,
		       SUM(oi.qty) AS qty, SUM(oi.qty * oi.price_at_order) AS revenue
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		JOIN hosts h ON h.id = oi.host_id
		WHERE o.created_at >= $1 AND o.created_at < $2
		  AND o.status NOT IN ('cancelled','return')
		GROUP BY day, h.id, h.name
		ORDER BY day`, from, to)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch graph data")
		return
	}
	defer rows.Close()

	points := []graphPoint{}
	for rows.Next() {
		var p graphPoint
		if err := rows.Scan(&p.Day, &p.HostID, &p.Host, &p.Qty, &p.Revenue); err != nil {
			continue
		}
		points = append(points, p)
	}
	respondJSON(w, http.StatusOK, points)
}

type hostRankingRow struct {
	HostID  int     `json:"host_id"`
	Host    string  `json:"host"`
	Qty     int     `json:"qty"`
	Revenue float64 `json:"revenue"`
}

// HostRanking returns total quantity sold and revenue per host within the date range.
func (h *DashboardHandler) HostRanking(w http.ResponseWriter, r *http.Request) {
	from, to, filtered := dateRange(r)
	if !filtered {
		to = time.Now()
		from = to.AddDate(0, 0, -30)
	}

	rows, err := h.DB.Query(r.Context(), `
		SELECT h.id, h.name, SUM(oi.qty) AS qty, SUM(oi.qty * oi.price_at_order) AS revenue
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		JOIN hosts h ON h.id = oi.host_id
		WHERE o.created_at >= $1 AND o.created_at < $2
		  AND o.status NOT IN ('cancelled','return')
		GROUP BY h.id, h.name
		ORDER BY qty DESC`, from, to)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch host ranking")
		return
	}
	defer rows.Close()

	list := []hostRankingRow{}
	for rows.Next() {
		var row hostRankingRow
		if err := rows.Scan(&row.HostID, &row.Host, &row.Qty, &row.Revenue); err != nil {
			continue
		}
		list = append(list, row)
	}
	respondJSON(w, http.StatusOK, list)
}

type topProductRow struct {
	ProductID int     `json:"product_id"`
	Name      string  `json:"name"`
	ImageURL  string  `json:"image_url"`
	Qty       int     `json:"qty"`
	Revenue   float64 `json:"revenue"`
}

// TopProducts returns the top 5 best-selling products (by qty) within the date range.
func (h *DashboardHandler) TopProducts(w http.ResponseWriter, r *http.Request) {
	from, to, filtered := dateRange(r)
	if !filtered {
		to = time.Now()
		from = to.AddDate(0, 0, -30)
	}

	rows, err := h.DB.Query(r.Context(), `
		SELECT p.id, p.name,
		       COALESCE((SELECT pi.url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order LIMIT 1), ''),
		       SUM(oi.qty) AS qty, SUM(oi.qty * oi.price_at_order) AS revenue
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		JOIN product_variants pv ON pv.id = oi.variant_id
		JOIN products p ON p.id = pv.product_id
		WHERE o.created_at >= $1 AND o.created_at < $2
		  AND o.status NOT IN ('cancelled','return')
		GROUP BY p.id, p.name
		ORDER BY qty DESC
		LIMIT 5`, from, to)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch top products")
		return
	}
	defer rows.Close()

	list := []topProductRow{}
	for rows.Next() {
		var row topProductRow
		if err := rows.Scan(&row.ProductID, &row.Name, &row.ImageURL, &row.Qty, &row.Revenue); err != nil {
			continue
		}
		list = append(list, row)
	}
	respondJSON(w, http.StatusOK, list)
}

type profitBreakdown struct {
	GrossSales      float64 `json:"gross_sales"`
	Discount        float64 `json:"discount"`
	PlatformFee     float64 `json:"platform_fee"`
	PaymentFee      float64 `json:"payment_fee"`
	ShippingSubsidy float64 `json:"shipping_subsidy"`
	AdCost          float64 `json:"ad_cost"`
	Refund          float64 `json:"refund"`
	COGS            float64 `json:"cogs"`
	NetSales        float64 `json:"net_sales"`
	NetProfit       float64 `json:"net_profit"`
	MarginPct       float64 `json:"margin_pct"`
}

// Profit computes the Gross Sales -> Net Profit waterfall for the date range, using real
// order/product-cost data plus the configurable fee assumptions in app_settings (there's no
// real payment gateway/ads integration, so platform/payment fee and ad cost are % or flat
// assumptions the seller sets in Settings, not fetched live).
func (h *DashboardHandler) Profit(w http.ResponseWriter, r *http.Request) {
	from, to, filtered := dateRange(r)
	if !filtered {
		to = time.Now()
		from = to.AddDate(0, 0, -30)
	}
	ctx := r.Context()

	fees, err := loadFeeSettings(r, h.DB)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load fee settings")
		return
	}

	var gross, cogs float64
	h.DB.QueryRow(ctx, `
		SELECT COALESCE(SUM(oi.qty * oi.price_at_order),0), COALESCE(SUM(oi.qty * pv.cost_price),0)
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		JOIN product_variants pv ON pv.id = oi.variant_id
		WHERE o.created_at >= $1 AND o.created_at < $2 AND o.status <> 'cancelled'`,
		from, to).Scan(&gross, &cogs)

	var discount, additional float64
	var orderCount int
	h.DB.QueryRow(ctx, `
		SELECT COALESCE(SUM(discount_amount),0), COALESCE(SUM(additional_amount),0), COUNT(*)
		FROM orders WHERE created_at >= $1 AND created_at < $2 AND status <> 'cancelled'`,
		from, to).Scan(&discount, &additional, &orderCount)

	var refund float64
	h.DB.QueryRow(ctx, `
		SELECT COALESCE(SUM(oi.qty * oi.price_at_order),0)
		FROM order_items oi JOIN orders o ON o.id = oi.order_id
		WHERE o.created_at >= $1 AND o.created_at < $2 AND o.status = 'return'`,
		from, to).Scan(&refund)

	platformFee := gross * fees.PlatformFeePct / 100
	paymentFee := gross * fees.PaymentFeePct / 100
	shippingSubsidy := fees.ShippingSubsidyFlat * float64(orderCount)
	adCost := fees.AdCostFlat * float64(orderCount)
	netSales := gross - discount + additional
	netProfit := netSales - platformFee - paymentFee - shippingSubsidy - adCost - refund - cogs
	margin := 0.0
	if gross > 0 {
		margin = netProfit / gross * 100
	}

	respondJSON(w, http.StatusOK, profitBreakdown{
		GrossSales: gross, Discount: discount, PlatformFee: platformFee, PaymentFee: paymentFee,
		ShippingSubsidy: shippingSubsidy, AdCost: adCost, Refund: refund, COGS: cogs,
		NetSales: netSales, NetProfit: netProfit, MarginPct: margin,
	})
}

type alertsResponse struct {
	LowStockCount     int      `json:"low_stock_count"`
	ShipTodayCount    int      `json:"ship_today_count"`
	DecliningProducts []string `json:"declining_products"`
	CompletedCount    int      `json:"completed_count"`
}

// Alerts powers the Dashboard's action-center panel: low-stock variants (available <=
// minimum_stock), orders not yet shipped, products whose sales declined vs. the prior
// equal-length period, and how many orders completed in range.
func (h *DashboardHandler) Alerts(w http.ResponseWriter, r *http.Request) {
	from, to, filtered := dateRange(r)
	if !filtered {
		to = time.Now()
		from = to.AddDate(0, 0, -30)
	}
	ctx := r.Context()

	var lowStock int
	h.DB.QueryRow(ctx, `
		SELECT COUNT(*) FROM stock_buckets WHERE minimum_stock > 0 AND available_stock <= minimum_stock`).Scan(&lowStock)

	var shipToday int
	h.DB.QueryRow(ctx, `SELECT COUNT(*) FROM orders WHERE status IN ('confirm','packing','picking')`).Scan(&shipToday)

	var completed int
	h.DB.QueryRow(ctx, `
		SELECT COUNT(*) FROM orders WHERE status = 'delivered' AND created_at >= $1 AND created_at < $2`, from, to).Scan(&completed)

	periodLen := to.Sub(from)
	priorFrom := from.Add(-periodLen)

	declining := []string{}
	rows, err := h.DB.Query(ctx, `
		SELECT p.name,
		       COALESCE(SUM(CASE WHEN o.created_at >= $1 AND o.created_at < $2 THEN oi.qty ELSE 0 END),0) AS current_qty,
		       COALESCE(SUM(CASE WHEN o.created_at >= $3 AND o.created_at < $1 THEN oi.qty ELSE 0 END),0) AS prior_qty
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		JOIN product_variants pv ON pv.id = oi.variant_id
		JOIN products p ON p.id = pv.product_id
		WHERE o.status NOT IN ('cancelled','return') AND o.created_at >= $3 AND o.created_at < $2
		GROUP BY p.id, p.name
		HAVING COALESCE(SUM(CASE WHEN o.created_at >= $3 AND o.created_at < $1 THEN oi.qty ELSE 0 END),0) > 0`,
		from, to, priorFrom)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var name string
			var cur, prior int
			if err := rows.Scan(&name, &cur, &prior); err != nil {
				continue
			}
			if cur < prior {
				declining = append(declining, name)
			}
		}
	}

	respondJSON(w, http.StatusOK, alertsResponse{
		LowStockCount: lowStock, ShipTodayCount: shipToday,
		DecliningProducts: declining, CompletedCount: completed,
	})
}
