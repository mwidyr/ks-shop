package handlers

import (
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5/pgxpool"
)

// PickingHandler powers Daftar Pengambilan: a cross-order queue of every line item still
// awaiting picking, flattened out of individual orders so staff can work through them by
// product/SKU rather than order-by-order.
type PickingHandler struct {
	DB *pgxpool.Pool
}

type pickingRow struct {
	OrderID         int    `json:"order_id"`
	OrderNo         string `json:"order_no"`
	ItemID          int    `json:"item_id"`
	VariantID       int    `json:"variant_id"`
	ProductName     string `json:"product_name"`
	ImageURL        string `json:"image_url"`
	SKU             string `json:"sku"`
	Color           string `json:"color"`
	Size            string `json:"size"`
	Qty             int    `json:"qty"`
	PickedQty       int    `json:"picked_qty"`
	CustomerName    string `json:"customer_name"`
	HostName        string `json:"host_name"`
	Status          string `json:"status"`
	AvailableToPick int    `json:"available_to_pick"`
	PhysicalStock   int    `json:"physical_stock"`
	IsOversell      bool   `json:"is_oversell"`
}

// Queue lists items belonging to in-progress orders (confirm/packing/picking), optionally
// filtered by q (matches SKU, product name, customer name or order number), color, size.
func (h *PickingHandler) Queue(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	baseWhere := " WHERE o.status IN ('confirm','packing','picking') "
	args := []interface{}{}
	argN := 1
	addArg := func(a interface{}) string {
		args = append(args, a)
		p := "$" + strconv.Itoa(argN)
		argN++
		return p
	}

	if search := q.Get("q"); search != "" {
		like := "%" + search + "%"
		baseWhere += ` AND (pv.sku ILIKE ` + addArg(like) + ` OR p.name ILIKE ` + addArg(like) +
			` OR c.name ILIKE ` + addArg(like) + ` OR o.order_no ILIKE ` + addArg(like) + `)`
	}
	if color := q.Get("color"); color != "" {
		baseWhere += ` AND pv.color = ` + addArg(color)
	}
	if size := q.Get("size"); size != "" {
		baseWhere += ` AND pv.size = ` + addArg(size)
	}
	if status := q.Get("status"); status != "" {
		baseWhere += ` AND o.status = ` + addArg(status)
	}
	if q.Get("ready") == "true" {
		baseWhere += ` AND sb.available_stock >= oi.qty`
	} else if q.Get("ready") == "false" {
		baseWhere += ` AND sb.available_stock < oi.qty`
	}

	page := 1
	if p, err := strconv.Atoi(q.Get("page")); err == nil && p > 0 {
		page = p
	}
	pageSize := 50
	if ps, err := strconv.Atoi(q.Get("page_size")); err == nil && ps > 0 {
		pageSize = ps
	}

	var total int
	countQuery := `
		SELECT COUNT(*) FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		JOIN customers c ON c.id = o.customer_id
		JOIN product_variants pv ON pv.id = oi.variant_id
		JOIN products p ON p.id = pv.product_id
		JOIN stock_buckets sb ON sb.variant_id = pv.id` + baseWhere
	h.DB.QueryRow(r.Context(), countQuery, args...).Scan(&total)

	listArgs := append([]interface{}{}, args...)
	limitPlaceholder := "$" + strconv.Itoa(argN)
	listArgs = append(listArgs, pageSize)
	argN++
	offsetPlaceholder := "$" + strconv.Itoa(argN)
	listArgs = append(listArgs, (page-1)*pageSize)

	query := `
		SELECT o.id, o.order_no, oi.id, oi.variant_id, p.name,
		       COALESCE((SELECT pi.url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order LIMIT 1), ''),
		       pv.sku, pv.color, pv.size, oi.qty, oi.picked_qty, c.name, COALESCE(h.name,'-'), o.status,
		       sb.available_stock, sb.available_stock + sb.reserve_stock + sb.broken_stock
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		JOIN customers c ON c.id = o.customer_id
		JOIN product_variants pv ON pv.id = oi.variant_id
		JOIN products p ON p.id = pv.product_id
		JOIN stock_buckets sb ON sb.variant_id = pv.id
		LEFT JOIN hosts h ON h.id = oi.host_id` +
		baseWhere +
		" ORDER BY o.created_at LIMIT " + limitPlaceholder + " OFFSET " + offsetPlaceholder

	rows, err := h.DB.Query(r.Context(), query, listArgs...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch picking queue")
		return
	}
	defer rows.Close()

	list := []pickingRow{}
	for rows.Next() {
		var row pickingRow
		if err := rows.Scan(&row.OrderID, &row.OrderNo, &row.ItemID, &row.VariantID, &row.ProductName, &row.ImageURL,
			&row.SKU, &row.Color, &row.Size, &row.Qty, &row.PickedQty, &row.CustomerName, &row.HostName, &row.Status,
			&row.AvailableToPick, &row.PhysicalStock); err != nil {
			continue
		}
		row.IsOversell = row.AvailableToPick < 0
		list = append(list, row)
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"items": list, "total": total, "page": page, "page_size": pageSize,
	})
}
