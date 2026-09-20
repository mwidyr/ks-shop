package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// pctOf returns part/total*100, or 0 when total is 0.
func pctOf(part, total float64) float64 {
	if total > 0 {
		return part / total * 100
	}
	return 0
}

// ReportsHandler powers Laporan's real, filterable report tabs. "Produk" is a genuinely
// different shape (aggregated per product); the Pelanggan/Host/Staf tabs all show the same
// underlying order-item rows (GET /reports/orders), just with a different emphasis/filter in
// the frontend - building three near-identical row-level endpoints wouldn't add real value.
type ReportsHandler struct {
	DB *pgxpool.Pool
}

type reportSummary struct {
	NetSales   float64 `json:"net_sales"`
	OrderCount int     `json:"order_count"`
	AvgOrder   float64 `json:"avg_order"`
}

func (h *ReportsHandler) loadSummary(r *http.Request, from, to time.Time) reportSummary {
	var s reportSummary
	h.DB.QueryRow(r.Context(), `
		SELECT COALESCE(SUM(ord.total),0), COUNT(*)
		FROM orders o
		JOIN LATERAL (
			SELECT COALESCE(SUM(oi.qty * oi.price_at_order),0) - o.discount_amount + o.additional_amount AS total
			FROM order_items oi WHERE oi.order_id = o.id
		) ord ON true
		WHERE o.status <> 'cancelled' AND o.created_at >= $1 AND o.created_at < $2`, from, to).
		Scan(&s.NetSales, &s.OrderCount)
	if s.OrderCount > 0 {
		s.AvgOrder = s.NetSales / float64(s.OrderCount)
	}
	return s
}

type productReportRow struct {
	ProductID  int     `json:"product_id"`
	Name       string  `json:"name"`
	SKU        string  `json:"sku"`
	Color      string  `json:"color"`
	Size       string  `json:"size"`
	OrderCount int     `json:"order_count"`
	Qty        int     `json:"qty"`
	QtyReturn  int     `json:"qty_return"`
	Revenue    float64 `json:"revenue"`
}

// Products aggregates per product+variant: order count, qty sold, qty returned, revenue.
func (h *ReportsHandler) Products(w http.ResponseWriter, r *http.Request) {
	from, to, filtered := dateRange(r)
	if !filtered {
		to = time.Now()
		from = to.AddDate(0, 0, -30)
	}

	rows, err := h.DB.Query(r.Context(), `
		SELECT p.id, p.name, pv.sku, pv.color, pv.size,
		       COUNT(DISTINCT oi.order_id),
		       COALESCE(SUM(oi.qty) FILTER (WHERE o.status <> 'cancelled'),0),
		       COALESCE(SUM(oi.qty) FILTER (WHERE o.status = 'return'),0),
		       COALESCE(SUM(oi.qty * oi.price_at_order) FILTER (WHERE o.status <> 'cancelled'),0)
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		JOIN product_variants pv ON pv.id = oi.variant_id
		JOIN products p ON p.id = pv.product_id
		WHERE o.created_at >= $1 AND o.created_at < $2
		GROUP BY p.id, p.name, pv.id, pv.sku, pv.color, pv.size
		ORDER BY 7 DESC`, from, to)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch product report")
		return
	}
	defer rows.Close()

	items := []productReportRow{}
	for rows.Next() {
		var row productReportRow
		if err := rows.Scan(&row.ProductID, &row.Name, &row.SKU, &row.Color, &row.Size,
			&row.OrderCount, &row.Qty, &row.QtyReturn, &row.Revenue); err != nil {
			continue
		}
		items = append(items, row)
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"summary": h.loadSummary(r, from, to), "items": items,
	})
}

type categoryAnalysisRow struct {
	Category string  `json:"category"`
	Qty      int     `json:"qty"`
	GMV      float64 `json:"gmv"`
	GMVPct   float64 `json:"gmv_pct"`
}

type variantAnalysisRow struct {
	SKU         string  `json:"sku"`
	ProductSKU  string  `json:"product_sku"` // the product's own code (distinct from the variant SKU above) - links this row back to its by_product ranking row
	Category    string  `json:"category"`
	ProductName string  `json:"product_name"`
	Color       string  `json:"color"`
	Qty         int     `json:"qty"`
	GMV         float64 `json:"gmv"`
	GMVPct      float64 `json:"gmv_pct"`
}

type productAnalysisRow struct {
	SKU         string  `json:"sku"`
	Category    string  `json:"category"`
	ProductName string  `json:"product_name"`
	Qty         int     `json:"qty"`
	GMV         float64 `json:"gmv"`
	GMVPct      float64 `json:"gmv_pct"`
}

// ProductAnalysis mirrors the client's own Google Sheet structure for this report: a
// Ringkasan (total qty/GMV for the scope, optionally one host), Analisis Penjualan (by
// category), and a SKU/variant-level breakdown - both with GMV% of the period total.
func (h *ReportsHandler) ProductAnalysis(w http.ResponseWriter, r *http.Request) {
	from, to, filtered := dateRange(r)
	if !filtered {
		to = time.Now()
		from = to.AddDate(0, 0, -30)
	}
	q := r.URL.Query()

	where := " WHERE o.status <> 'cancelled' AND o.created_at >= $1 AND o.created_at < $2 "
	args := []interface{}{from, to}
	var hostName string
	if hostID := q.Get("host_id"); hostID != "" {
		where += " AND oi.host_id = $3 "
		args = append(args, hostID)
		h.DB.QueryRow(r.Context(), `SELECT name FROM hosts WHERE id=$1`, hostID).Scan(&hostName)
	}

	var totalQty int
	var totalGMV float64
	h.DB.QueryRow(r.Context(), `
		SELECT COALESCE(SUM(oi.qty),0), COALESCE(SUM(oi.qty*oi.price_at_order),0)
		FROM order_items oi JOIN orders o ON o.id = oi.order_id`+where, args...).Scan(&totalQty, &totalGMV)

	catRows, err := h.DB.Query(r.Context(), `
		SELECT COALESCE(p.category,'-'), SUM(oi.qty), SUM(oi.qty*oi.price_at_order)
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		JOIN product_variants pv ON pv.id = oi.variant_id
		JOIN products p ON p.id = pv.product_id`+where+`
		GROUP BY p.category ORDER BY 3 DESC`, args...)
	byCategory := []categoryAnalysisRow{}
	if err == nil {
		defer catRows.Close()
		for catRows.Next() {
			var c categoryAnalysisRow
			if err := catRows.Scan(&c.Category, &c.Qty, &c.GMV); err != nil {
				continue
			}
			if totalGMV > 0 {
				c.GMVPct = c.GMV / totalGMV * 100
			}
			byCategory = append(byCategory, c)
		}
	}

	// Aggregated per product (across colors) - mirrors the reference sheet's "Host Product
	// Ranking" (per-host drill-down) and "GMV/QTY Ranking" (Overview, no host filter) sections.
	prodRows, err := h.DB.Query(r.Context(), `
		SELECT COALESCE(p.sku,'-'), COALESCE(p.category,'-'), p.name, SUM(oi.qty), SUM(oi.qty*oi.price_at_order)
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		JOIN product_variants pv ON pv.id = oi.variant_id
		JOIN products p ON p.id = pv.product_id`+where+`
		GROUP BY p.id, p.sku, p.category, p.name ORDER BY 5 DESC LIMIT 100`, args...)
	byProduct := []productAnalysisRow{}
	if err == nil {
		defer prodRows.Close()
		for prodRows.Next() {
			var p productAnalysisRow
			if err := prodRows.Scan(&p.SKU, &p.Category, &p.ProductName, &p.Qty, &p.GMV); err != nil {
				continue
			}
			if totalGMV > 0 {
				p.GMVPct = p.GMV / totalGMV * 100
			}
			byProduct = append(byProduct, p)
		}
	}

	varRows, err := h.DB.Query(r.Context(), `
		SELECT pv.sku, COALESCE(p.sku,'-'), COALESCE(p.category,'-'), p.name, pv.color, SUM(oi.qty), SUM(oi.qty*oi.price_at_order)
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		JOIN product_variants pv ON pv.id = oi.variant_id
		JOIN products p ON p.id = pv.product_id`+where+`
		GROUP BY pv.id, pv.sku, p.sku, p.category, p.name, pv.color ORDER BY 7 DESC LIMIT 100`, args...)
	byVariant := []variantAnalysisRow{}
	if err == nil {
		defer varRows.Close()
		for varRows.Next() {
			var v variantAnalysisRow
			if err := varRows.Scan(&v.SKU, &v.ProductSKU, &v.Category, &v.ProductName, &v.Color, &v.Qty, &v.GMV); err != nil {
				continue
			}
			if totalGMV > 0 {
				v.GMVPct = v.GMV / totalGMV * 100
			}
			byVariant = append(byVariant, v)
		}
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"summary":     map[string]interface{}{"qty": totalQty, "gmv": totalGMV, "host_name": hostName},
		"by_category": byCategory,
		"by_product":  byProduct,
		"by_variant":  byVariant,
	})
}

type categoryLeaderboardEntry struct {
	HostName string `json:"host_name"`
	Qty      int    `json:"qty"`
}

type categoryLeaderboard struct {
	Category string                     `json:"category"`
	Hosts    []categoryLeaderboardEntry `json:"hosts"`
}

// HostCategoryLeaderboard mirrors the client's QUEEN sheet: for every product category, every
// host ranked by units sold in that category. No host is_active filter and no join restriction
// on hosts - the sheet itself includes inactive/test hosts in its historical rankings.
func (h *ReportsHandler) HostCategoryLeaderboard(w http.ResponseWriter, r *http.Request) {
	from, to, filtered := dateRange(r)
	if !filtered {
		to = time.Now()
		from = to.AddDate(0, 0, -30)
	}

	rows, err := h.DB.Query(r.Context(), `
		SELECT COALESCE(p.category,'-'), COALESCE(hst.name,'-'), SUM(oi.qty)
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		JOIN product_variants pv ON pv.id = oi.variant_id
		JOIN products p ON p.id = pv.product_id
		LEFT JOIN hosts hst ON hst.id = oi.host_id
		WHERE o.status <> 'cancelled' AND o.created_at >= $1 AND o.created_at < $2
		GROUP BY p.category, hst.id, hst.name
		ORDER BY p.category, 3 DESC`, from, to)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch host-category leaderboard")
		return
	}
	defer rows.Close()

	order := []string{}
	byCategory := map[string][]categoryLeaderboardEntry{}
	for rows.Next() {
		var category, hostName string
		var qty int
		if err := rows.Scan(&category, &hostName, &qty); err != nil {
			continue
		}
		if _, seen := byCategory[category]; !seen {
			order = append(order, category)
		}
		byCategory[category] = append(byCategory[category], categoryLeaderboardEntry{HostName: hostName, Qty: qty})
	}

	categories := make([]categoryLeaderboard, 0, len(order))
	for _, c := range order {
		categories = append(categories, categoryLeaderboard{Category: c, Hosts: byCategory[c]})
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{"categories": categories})
}

type orderReportRow struct {
	Date          string  `json:"date"`
	OrderNo       string  `json:"order_no"`
	Status        string  `json:"status"`
	ProductName   string  `json:"product_name"`
	Variant       string  `json:"variant"`
	SKU           string  `json:"sku"`
	Qty           int     `json:"qty"`
	Price         float64 `json:"price"`
	Subtotal      float64 `json:"subtotal"`
	CustomerName  string  `json:"customer_name"`
	CustomerPhone string  `json:"customer_phone"`
	HostName      string  `json:"host_name"`
	StaffName     string  `json:"staff_name"`
}

// Orders returns flat order-item rows, optionally filtered by host_id, customer name (q),
// or staff_id - shared by the Pelanggan/Host/Staf report tabs.
func (h *ReportsHandler) Orders(w http.ResponseWriter, r *http.Request) {
	from, to, filtered := dateRange(r)
	if !filtered {
		to = time.Now()
		from = to.AddDate(0, 0, -30)
	}
	q := r.URL.Query()

	where := " WHERE o.created_at >= $1 AND o.created_at < $2 "
	args := []interface{}{from, to}
	argN := 3
	if hostID := q.Get("host_id"); hostID != "" {
		where += " AND oi.host_id = $" + strconv.Itoa(argN)
		args = append(args, hostID)
		argN++
	}
	if staffID := q.Get("staff_id"); staffID != "" {
		where += " AND o.sales_id = $" + strconv.Itoa(argN)
		args = append(args, staffID)
		argN++
	}
	if search := q.Get("q"); search != "" {
		where += " AND (c.name ILIKE $" + strconv.Itoa(argN) + " OR c.phone ILIKE $" + strconv.Itoa(argN) + ")"
		args = append(args, "%"+search+"%")
		argN++
	}

	limit := 500
	if l, err := strconv.Atoi(q.Get("limit")); err == nil && l > 0 && l <= 20000 {
		limit = l
	}

	query := `
		SELECT o.created_at::date::text, o.order_no, o.status, p.name,
		       CONCAT(pv.color, '/', pv.size), pv.sku, oi.qty, oi.price_at_order, oi.qty * oi.price_at_order,
		       c.name, c.phone, COALESCE(h.name,'-'), COALESCE(u.name,'-')
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		JOIN customers c ON c.id = o.customer_id
		JOIN product_variants pv ON pv.id = oi.variant_id
		JOIN products p ON p.id = pv.product_id
		LEFT JOIN hosts h ON h.id = oi.host_id
		LEFT JOIN users u ON u.id = o.sales_id` +
		where + " ORDER BY o.created_at DESC LIMIT " + strconv.Itoa(limit)

	rows, err := h.DB.Query(r.Context(), query, args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch order report")
		return
	}
	defer rows.Close()

	items := []orderReportRow{}
	for rows.Next() {
		var row orderReportRow
		if err := rows.Scan(&row.Date, &row.OrderNo, &row.Status, &row.ProductName, &row.Variant, &row.SKU,
			&row.Qty, &row.Price, &row.Subtotal, &row.CustomerName, &row.CustomerPhone, &row.HostName, &row.StaffName); err != nil {
			continue
		}
		items = append(items, row)
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"summary": h.loadSummary(r, from, to), "items": items,
	})
}

type productPerfColorRow struct {
	Color  string  `json:"color"`
	Qty    int     `json:"qty"`
	GMV    float64 `json:"gmv"`
	GMVPct float64 `json:"gmv_pct"`
}

type productPerfHostRow struct {
	HostName string  `json:"host_name"`
	Qty      int     `json:"qty"`
	GMV      float64 `json:"gmv"`
	GMVPct   float64 `json:"gmv_pct"`
}

type colorComboRow struct {
	Colors     string  `json:"colors"`
	OrderCount int     `json:"order_count"`
	Pct        float64 `json:"pct"`
}

type crossSellRow struct {
	SKU         string  `json:"sku"`
	ProductName string  `json:"product_name"`
	OrderCount  int     `json:"order_count"`
	Pct         float64 `json:"pct"`
}

// ProductPerformance mirrors the client's per-product drill-down sheet (產品分析/Analisis Combo):
// a color breakdown, which hosts sell it most, and two market-basket analyses - "color combo"
// (does one order contain multiple colors of this same product?) and "cross-sell" (what other
// products most often ship in the same order as this one). sku identifies the product (not a
// variant SKU) and is required since this is inherently a per-product drill-down.
func (h *ReportsHandler) ProductPerformance(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	sku := q.Get("sku")
	if sku == "" {
		respondError(w, http.StatusBadRequest, "sku is required")
		return
	}

	from, to, filtered := dateRange(r)
	if !filtered {
		to = time.Now()
		from = to.AddDate(0, 0, -30)
	}

	where := " WHERE p.sku = $1 AND o.status <> 'cancelled' AND o.created_at >= $2 AND o.created_at < $3 "
	args := []interface{}{sku, from, to}
	if hostID := q.Get("host_id"); hostID != "" {
		where += " AND oi.host_id = $4 "
		args = append(args, hostID)
	}

	var productName, category string
	if err := h.DB.QueryRow(r.Context(), `SELECT name, COALESCE(category,'-') FROM products WHERE sku=$1`, sku).
		Scan(&productName, &category); err != nil {
		respondError(w, http.StatusNotFound, "product not found")
		return
	}

	var totalQty int
	var totalGMV float64
	h.DB.QueryRow(r.Context(), `
		SELECT COALESCE(SUM(oi.qty),0), COALESCE(SUM(oi.qty*oi.price_at_order),0)
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		JOIN product_variants pv ON pv.id = oi.variant_id
		JOIN products p ON p.id = pv.product_id`+where, args...).Scan(&totalQty, &totalGMV)

	colorRows, err := h.DB.Query(r.Context(), `
		SELECT pv.color, SUM(oi.qty), SUM(oi.qty*oi.price_at_order)
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		JOIN product_variants pv ON pv.id = oi.variant_id
		JOIN products p ON p.id = pv.product_id`+where+`
		GROUP BY pv.color ORDER BY 2 DESC`, args...)
	byColor := []productPerfColorRow{}
	if err == nil {
		defer colorRows.Close()
		for colorRows.Next() {
			var c productPerfColorRow
			if err := colorRows.Scan(&c.Color, &c.Qty, &c.GMV); err != nil {
				continue
			}
			c.GMVPct = pctOf(c.GMV, totalGMV)
			byColor = append(byColor, c)
		}
	}

	hostRows, err := h.DB.Query(r.Context(), `
		SELECT COALESCE(hst.name,'-'), SUM(oi.qty), SUM(oi.qty*oi.price_at_order)
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		JOIN product_variants pv ON pv.id = oi.variant_id
		JOIN products p ON p.id = pv.product_id
		LEFT JOIN hosts hst ON hst.id = oi.host_id`+where+`
		GROUP BY hst.id, hst.name ORDER BY 2 DESC`, args...)
	byHost := []productPerfHostRow{}
	if err == nil {
		defer hostRows.Close()
		for hostRows.Next() {
			var hr productPerfHostRow
			if err := hostRows.Scan(&hr.HostName, &hr.Qty, &hr.GMV); err != nil {
				continue
			}
			hr.GMVPct = pctOf(hr.GMV, totalGMV)
			byHost = append(byHost, hr)
		}
	}

	// Color combo: orders where this product appears in more than one distinct color.
	var totalOrders, multiColorOrders int
	h.DB.QueryRow(r.Context(), `
		WITH order_colors AS (
			SELECT oi.order_id, COUNT(DISTINCT pv.color) AS n_colors
			FROM order_items oi
			JOIN orders o ON o.id = oi.order_id
			JOIN product_variants pv ON pv.id = oi.variant_id
			JOIN products p ON p.id = pv.product_id`+where+`
			GROUP BY oi.order_id
		)
		SELECT COUNT(*), COUNT(*) FILTER (WHERE n_colors > 1) FROM order_colors`, args...).
		Scan(&totalOrders, &multiColorOrders)

	comboRows, err := h.DB.Query(r.Context(), `
		WITH order_colors AS (
			SELECT oi.order_id, array_agg(DISTINCT pv.color ORDER BY pv.color) AS colors, COUNT(DISTINCT pv.color) AS n_colors
			FROM order_items oi
			JOIN orders o ON o.id = oi.order_id
			JOIN product_variants pv ON pv.id = oi.variant_id
			JOIN products p ON p.id = pv.product_id`+where+`
			GROUP BY oi.order_id
		)
		SELECT array_to_string(colors, ' + '), COUNT(*)
		FROM order_colors WHERE n_colors > 1
		GROUP BY colors ORDER BY 2 DESC LIMIT 20`, args...)
	colorCombos := []colorComboRow{}
	if err == nil {
		defer comboRows.Close()
		for comboRows.Next() {
			var cc colorComboRow
			if err := comboRows.Scan(&cc.Colors, &cc.OrderCount); err != nil {
				continue
			}
			cc.Pct = pctOf(float64(cc.OrderCount), float64(totalOrders))
			colorCombos = append(colorCombos, cc)
		}
	}

	// Cross-sell: which other products most often appear in the same order as this one -
	// a self-join of order_items on order_id, excluding this product's own lines.
	crossSellRows, err := h.DB.Query(r.Context(), `
		SELECT p2.sku, p2.name, COUNT(DISTINCT oi2.order_id)
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		JOIN product_variants pv ON pv.id = oi.variant_id
		JOIN products p ON p.id = pv.product_id
		JOIN order_items oi2 ON oi2.order_id = oi.order_id
		JOIN product_variants pv2 ON pv2.id = oi2.variant_id
		JOIN products p2 ON p2.id = pv2.product_id AND p2.id <> p.id`+where+`
		GROUP BY p2.id, p2.sku, p2.name ORDER BY 3 DESC LIMIT 20`, args...)
	crossSell := []crossSellRow{}
	if err == nil {
		defer crossSellRows.Close()
		for crossSellRows.Next() {
			var cs crossSellRow
			if err := crossSellRows.Scan(&cs.SKU, &cs.ProductName, &cs.OrderCount); err != nil {
				continue
			}
			cs.Pct = pctOf(float64(cs.OrderCount), float64(totalOrders))
			crossSell = append(crossSell, cs)
		}
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"summary": map[string]interface{}{
			"sku": sku, "product_name": productName, "category": category,
			"qty": totalQty, "gmv": totalGMV,
		},
		"by_color": byColor,
		"by_host":  byHost,
		"combo": map[string]interface{}{
			"total_orders":       totalOrders,
			"multi_color_orders": multiColorOrders,
			"color_combos":       colorCombos,
		},
		"cross_sell": crossSell,
	})
}

type colorPairRow struct {
	ColorA     string  `json:"color_a"`
	ColorB     string  `json:"color_b"`
	OrderCount int     `json:"order_count"`
	Pct        float64 `json:"pct"`
}

// ProductColorPair answers, for two user-picked products, which color-A x color-B combinations
// were bought together in the same order - a two-product extension of the single-product
// "color combo" analysis above, modeled on the same self-join-order_items-on-order_id shape as
// colorCombos/crossSell, but with BOTH sides of the join constrained to specific products
// instead of "any other product."
func (h *ReportsHandler) ProductColorPair(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	skuA, skuB := q.Get("sku_a"), q.Get("sku_b")
	if skuA == "" || skuB == "" {
		respondError(w, http.StatusBadRequest, "sku_a and sku_b are required")
		return
	}

	from, to, filtered := dateRange(r)
	if !filtered {
		to = time.Now()
		from = to.AddDate(0, 0, -30)
	}

	args := []interface{}{skuA, skuB, from, to}
	joinWhere := `
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		JOIN product_variants pv ON pv.id = oi.variant_id
		JOIN products p ON p.id = pv.product_id
		JOIN order_items oi2 ON oi2.order_id = oi.order_id
		JOIN product_variants pv2 ON pv2.id = oi2.variant_id
		JOIN products p2 ON p2.id = pv2.product_id
		WHERE p.sku = $1 AND p2.sku = $2
		  AND o.status <> 'cancelled' AND o.created_at >= $3 AND o.created_at < $4`

	var totalOrders int
	h.DB.QueryRow(r.Context(), `SELECT COUNT(DISTINCT oi.order_id) `+joinWhere, args...).Scan(&totalOrders)

	pairRows, err := h.DB.Query(r.Context(), `
		SELECT pv.color, pv2.color, COUNT(DISTINCT oi.order_id) `+joinWhere+`
		GROUP BY pv.color, pv2.color ORDER BY 3 DESC LIMIT 50`, args...)
	pairs := []colorPairRow{}
	if err == nil {
		defer pairRows.Close()
		for pairRows.Next() {
			var cp colorPairRow
			if err := pairRows.Scan(&cp.ColorA, &cp.ColorB, &cp.OrderCount); err != nil {
				continue
			}
			cp.Pct = pctOf(float64(cp.OrderCount), float64(totalOrders))
			pairs = append(pairs, cp)
		}
	}

	var nameA, nameB string
	h.DB.QueryRow(r.Context(), `SELECT name FROM products WHERE sku=$1`, skuA).Scan(&nameA)
	h.DB.QueryRow(r.Context(), `SELECT name FROM products WHERE sku=$1`, skuB).Scan(&nameB)

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"product_a":    map[string]string{"sku": skuA, "name": nameA},
		"product_b":    map[string]string{"sku": skuB, "name": nameB},
		"total_orders": totalOrders,
		"pairs":        pairs,
	})
}
