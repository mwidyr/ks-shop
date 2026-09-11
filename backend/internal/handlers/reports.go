package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

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
		where + " ORDER BY o.created_at DESC LIMIT 500"

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
