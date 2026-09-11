package handlers

import (
	"fmt"
	"math/rand"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	appmw "ordermgmt/internal/middleware"
)

type OrderHandler struct {
	DB *pgxpool.Pool
}

var validTransitions = map[string][]string{
	"pending":   {"confirm", "cancelled"},
	"confirm":   {"packing", "cancelled"},
	"packing":   {"picking", "cancelled"},
	"picking":   {"shipped", "cancelled"},
	"shipped":   {"delivered", "cancelled", "return"},
	"delivered": {"return"},
}

type orderListItem struct {
	ID              int     `json:"id"`
	OrderNo         string  `json:"order_no"`
	Status          string  `json:"status"`
	CustomerName    string  `json:"customer_name"`
	CustomerPhone   string  `json:"customer_phone"`
	PickupChainName string  `json:"pickup_chain_name"`
	PickupStoreName string  `json:"pickup_store_name"`
	PickupStoreCode string  `json:"pickup_store_code"`
	HostNames       string  `json:"host_names"`
	TotalQty        int     `json:"total_qty"`
	Total           float64 `json:"total"`
	CreatedAt       string  `json:"created_at"`
}

// List returns orders, filtered by role (sales sees only their own), plus optional
// filters: status, date_from/date_to, host_id, category, pickup_chain_id, q
// (customer name/phone search). Paginated.
func (h *OrderHandler) List(w http.ResponseWriter, r *http.Request) {
	claims := appmw.GetClaims(r)
	q := r.URL.Query()

	baseWhere := " WHERE 1=1 "
	args := []interface{}{}
	argN := 1

	addArg := func(a interface{}) string {
		args = append(args, a)
		p := "$" + itoa(argN)
		argN++
		return p
	}

	if claims.Role == "sales" {
		baseWhere += " AND o.sales_id = " + addArg(claims.UserID)
	}
	if status := q.Get("status"); status != "" {
		statuses := strings.Split(status, ",")
		if len(statuses) == 1 {
			baseWhere += " AND o.status = " + addArg(statuses[0])
		} else {
			baseWhere += " AND o.status = ANY(" + addArg(statuses) + ")"
		}
	}
	if dateFrom := q.Get("date_from"); dateFrom != "" {
		baseWhere += " AND o.created_at >= " + addArg(dateFrom)
	}
	if dateTo := q.Get("date_to"); dateTo != "" {
		baseWhere += " AND o.created_at < " + addArg(dateTo) + "::date + interval '1 day'"
	}
	if pickupChainID := q.Get("pickup_chain_id"); pickupChainID != "" {
		baseWhere += " AND o.pickup_chain_id = " + addArg(pickupChainID)
	}
	if hostID := q.Get("host_id"); hostID != "" {
		baseWhere += " AND EXISTS (SELECT 1 FROM order_items oih WHERE oih.order_id = o.id AND oih.host_id = " + addArg(hostID) + ")"
	}
	if category := q.Get("category"); category != "" {
		baseWhere += ` AND EXISTS (
			SELECT 1 FROM order_items oic
			JOIN product_variants pvc ON pvc.id = oic.variant_id
			JOIN products pc ON pc.id = pvc.product_id
			WHERE oic.order_id = o.id AND pc.category = ` + addArg(category) + `)`
	}
	if search := q.Get("q"); search != "" {
		like := "%" + search + "%"
		baseWhere += " AND (c.name ILIKE " + addArg(like) + " OR c.phone ILIKE " + addArg(like) + ")"
	}

	page := 1
	if p, err := strconv.Atoi(q.Get("page")); err == nil && p > 0 {
		page = p
	}
	pageSize := 20
	if ps, err := strconv.Atoi(q.Get("page_size")); err == nil && ps > 0 {
		pageSize = ps
	}

	var total int
	countQuery := "SELECT COUNT(*) FROM orders o JOIN customers c ON c.id = o.customer_id" + baseWhere
	h.DB.QueryRow(r.Context(), countQuery, args...).Scan(&total)

	listArgs := append([]interface{}{}, args...)
	limitPlaceholder := "$" + itoa(argN)
	listArgs = append(listArgs, pageSize)
	argN++
	offsetPlaceholder := "$" + itoa(argN)
	listArgs = append(listArgs, (page-1)*pageSize)

	query := `
		SELECT o.id, o.order_no, o.status, c.name, c.phone, pc.name,
		       COALESCE(o.pickup_store_name,''), COALESCE(o.pickup_store_code,''), o.created_at,
		       COALESCE(SUM(oi.qty * oi.price_at_order),0) - o.discount_amount + o.additional_amount,
		       COALESCE((SELECT SUM(oi3.qty) FROM order_items oi3 WHERE oi3.order_id = o.id), 0),
		       COALESCE((SELECT string_agg(DISTINCT h.name, ', ') FROM order_items oi2
		                 JOIN hosts h ON h.id = oi2.host_id WHERE oi2.order_id = o.id), '-')
		FROM orders o
		JOIN customers c ON c.id = o.customer_id
		JOIN pickup_chains pc ON pc.id = o.pickup_chain_id
		LEFT JOIN order_items oi ON oi.order_id = o.id` +
		baseWhere +
		" GROUP BY o.id, c.name, c.phone, pc.name ORDER BY o.created_at DESC LIMIT " + limitPlaceholder + " OFFSET " + offsetPlaceholder

	rows, err := h.DB.Query(r.Context(), query, listArgs...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch orders")
		return
	}
	defer rows.Close()

	list := []orderListItem{}
	for rows.Next() {
		var o orderListItem
		var createdAt time.Time
		if err := rows.Scan(&o.ID, &o.OrderNo, &o.Status, &o.CustomerName, &o.CustomerPhone, &o.PickupChainName,
			&o.PickupStoreName, &o.PickupStoreCode, &createdAt, &o.Total, &o.TotalQty, &o.HostNames); err != nil {
			continue
		}
		o.CreatedAt = createdAt.Format(time.RFC3339)
		list = append(list, o)
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"items": list, "total": total, "page": page, "page_size": pageSize,
	})
}

type orderItemView struct {
	ID              int     `json:"id"`
	VariantID       int     `json:"variant_id"`
	ProductName     string  `json:"product_name"`
	ImageURL        string  `json:"image_url"`
	Color           string  `json:"color"`
	Size            string  `json:"size"`
	SKU             string  `json:"sku"`
	Qty             int     `json:"qty"`
	PickedQty       int     `json:"picked_qty"`
	Price           float64 `json:"price"`
	HostID          *int    `json:"host_id"`
	HostName        string  `json:"host_name"`
	AvailableToPick int     `json:"available_to_pick"`
	PhysicalStock   int     `json:"physical_stock"`
	IsOversell      bool    `json:"is_oversell"`
}

type orderDetailView struct {
	ID               int             `json:"id"`
	OrderNo          string          `json:"order_no"`
	Status           string          `json:"status"`
	CustomerName     string          `json:"customer_name"`
	CustomerPhone    string          `json:"customer_phone"`
	ShippingAddress  string          `json:"shipping_address"`
	PickupChainName  string          `json:"pickup_chain_name"`
	PickupStoreName  string          `json:"pickup_store_name"`
	PickupStoreCode  string          `json:"pickup_store_code"`
	Items            []orderItemView `json:"items"`
	Subtotal         float64         `json:"subtotal"`
	DiscountAmount   float64         `json:"discount_amount"`
	AdditionalAmount float64         `json:"additional_amount"`
	Total            float64         `json:"total"`
	InternalNotes    string          `json:"internal_notes"`
	Attachments      []string        `json:"attachments"`
	CreatedBy        string          `json:"created_by"`
	CreatedAt        string          `json:"created_at"`
	StatusHistory    []statusLogView `json:"status_history"`
}

type statusLogView struct {
	StatusFrom string `json:"status_from"`
	StatusTo   string `json:"status_to"`
	ChangedBy  string `json:"changed_by"`
	Reason     string `json:"reason"`
	CreatedAt  string `json:"created_at"`
}

func (h *OrderHandler) Detail(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid order id")
		return
	}
	ctx := r.Context()

	var o orderDetailView
	var createdAt time.Time
	err = h.DB.QueryRow(ctx, `
		SELECT o.id, o.order_no, o.status, c.name, c.phone, o.shipping_address, pc.name,
		       COALESCE(o.pickup_store_name,''), COALESCE(o.pickup_store_code,''), o.discount_amount, o.additional_amount,
		       COALESCE(o.internal_notes,''), COALESCE(u.name,'system'), o.created_at
		FROM orders o
		JOIN customers c ON c.id=o.customer_id
		JOIN pickup_chains pc ON pc.id = o.pickup_chain_id
		LEFT JOIN users u ON u.id = o.sales_id
		WHERE o.id=$1`, id).
		Scan(&o.ID, &o.OrderNo, &o.Status, &o.CustomerName, &o.CustomerPhone, &o.ShippingAddress, &o.PickupChainName,
			&o.PickupStoreName, &o.PickupStoreCode, &o.DiscountAmount, &o.AdditionalAmount,
			&o.InternalNotes, &o.CreatedBy, &createdAt)
	if err != nil {
		respondError(w, http.StatusNotFound, "order not found")
		return
	}
	o.CreatedAt = createdAt.Format(time.RFC3339)

	rows, err := h.DB.Query(ctx, `
		SELECT oi.id, oi.variant_id, p.name,
		       COALESCE((SELECT pi.url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order LIMIT 1), ''),
		       pv.color, pv.size, pv.sku, oi.qty, oi.picked_qty, oi.price_at_order, oi.host_id, COALESCE(h.name,'-'),
		       sb.available_stock, sb.available_stock + sb.reserve_stock + sb.broken_stock
		FROM order_items oi
		JOIN product_variants pv ON pv.id = oi.variant_id
		JOIN products p ON p.id = pv.product_id
		JOIN stock_buckets sb ON sb.variant_id = pv.id
		LEFT JOIN hosts h ON h.id = oi.host_id
		WHERE oi.order_id = $1`, id)
	if err == nil {
		defer rows.Close()
		o.Items = []orderItemView{}
		for rows.Next() {
			var it orderItemView
			rows.Scan(&it.ID, &it.VariantID, &it.ProductName, &it.ImageURL, &it.Color, &it.Size, &it.SKU, &it.Qty, &it.PickedQty,
				&it.Price, &it.HostID, &it.HostName, &it.AvailableToPick, &it.PhysicalStock)
			it.IsOversell = it.AvailableToPick < 0
			o.Subtotal += it.Price * float64(it.Qty)
			o.Items = append(o.Items, it)
		}
	}
	o.Total = o.Subtotal - o.DiscountAmount + o.AdditionalAmount

	attRows, err := h.DB.Query(ctx, `SELECT url FROM order_attachments WHERE order_id=$1 ORDER BY created_at`, id)
	if err == nil {
		defer attRows.Close()
		o.Attachments = []string{}
		for attRows.Next() {
			var url string
			attRows.Scan(&url)
			o.Attachments = append(o.Attachments, url)
		}
	}

	logRows, err := h.DB.Query(ctx, `
		SELECT COALESCE(status_from,'-'), status_to, COALESCE(u.name,'system'), COALESCE(reason,''), l.created_at::text
		FROM order_status_log l LEFT JOIN users u ON u.id = l.changed_by
		WHERE order_id=$1 ORDER BY l.created_at`, id)
	if err == nil {
		defer logRows.Close()
		o.StatusHistory = []statusLogView{}
		for logRows.Next() {
			var s statusLogView
			logRows.Scan(&s.StatusFrom, &s.StatusTo, &s.ChangedBy, &s.Reason, &s.CreatedAt)
			o.StatusHistory = append(o.StatusHistory, s)
		}
	}

	respondJSON(w, http.StatusOK, o)
}

type createOrderCustomer struct {
	ID      *int   `json:"id"`
	Name    string `json:"name"`
	Phone   string `json:"phone"`
	Address string `json:"address"`
}

type createOrderItem struct {
	HostID    int `json:"host_id"`
	VariantID int `json:"variant_id"`
	Qty       int `json:"qty"`
}

type createOrderRequest struct {
	Customer         createOrderCustomer `json:"customer"`
	ShippingAddress  string              `json:"shipping_address"`
	PickupChainID    int                 `json:"pickup_chain_id"`
	PickupStoreName  string              `json:"pickup_store_name"`
	PickupStoreCode  string              `json:"pickup_store_code"`
	Items            []createOrderItem   `json:"items"`
	DiscountAmount   float64             `json:"discount_amount"`
	AdditionalAmount float64             `json:"additional_amount"`
}

// Create builds a manual order directly (no cart/checkout step): resolves/creates the
// buyer, decrements available_stock -> order_stock per line item in one transaction.
func (h *OrderHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req createOrderRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.ShippingAddress == "" {
		respondError(w, http.StatusBadRequest, "shipping_address is required")
		return
	}
	if req.PickupChainID == 0 {
		respondError(w, http.StatusBadRequest, "pickup_chain_id is required")
		return
	}
	if len(req.Items) == 0 {
		respondError(w, http.StatusBadRequest, "at least one item is required")
		return
	}
	for _, it := range req.Items {
		if it.Qty <= 0 || it.VariantID == 0 || it.HostID == 0 {
			respondError(w, http.StatusBadRequest, "each item requires host_id, variant_id and a positive qty")
			return
		}
	}
	if req.DiscountAmount < 0 || req.AdditionalAmount < 0 {
		respondError(w, http.StatusBadRequest, "discount_amount and additional_amount cannot be negative")
		return
	}

	claims := appmw.GetClaims(r)
	ctx := r.Context()

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(ctx)

	customerID := req.Customer.ID
	if customerID == nil {
		if req.Customer.Name == "" || req.Customer.Phone == "" {
			respondError(w, http.StatusBadRequest, "customer name and phone are required for a new customer")
			return
		}
		var newID int
		if err := tx.QueryRow(ctx, `
			INSERT INTO customers (name, phone, address) VALUES ($1,$2,$3) RETURNING id`,
			req.Customer.Name, req.Customer.Phone, req.Customer.Address).Scan(&newID); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to create customer")
			return
		}
		customerID = &newID
	}

	orderNo := fmt.Sprintf("ORD-%d-%04d", time.Now().Unix(), rand.Intn(9999))
	var orderID int
	if err := tx.QueryRow(ctx, `
		INSERT INTO orders (order_no, customer_id, sales_id, status, shipping_address, pickup_chain_id, pickup_store_name, pickup_store_code, discount_amount, additional_amount)
		VALUES ($1,$2,$3,'pending',$4,$5,$6,$7,$8,$9) RETURNING id`,
		orderNo, *customerID, claims.UserID, req.ShippingAddress, req.PickupChainID, req.PickupStoreName, req.PickupStoreCode,
		req.DiscountAmount, req.AdditionalAmount).Scan(&orderID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create order")
		return
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO order_status_log (order_id, status_from, status_to, changed_by)
		VALUES ($1, NULL, 'pending', $2)`, orderID, claims.UserID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to log order status")
		return
	}

	for _, it := range req.Items {
		var available int
		var price float64
		var allowOversell bool
		if err := tx.QueryRow(ctx, `
			SELECT sb.available_stock, pv.price, p.allow_oversell FROM stock_buckets sb
			JOIN product_variants pv ON pv.id = sb.variant_id
			JOIN products p ON p.id = pv.product_id
			WHERE sb.variant_id=$1 FOR UPDATE`, it.VariantID).Scan(&available, &price, &allowOversell); err != nil {
			respondError(w, http.StatusBadRequest, "variant not found")
			return
		}
		if available < it.Qty && !allowOversell {
			respondError(w, http.StatusConflict, fmt.Sprintf("stock tidak cukup untuk variant %d (tersedia %d, diminta %d)", it.VariantID, available, it.Qty))
			return
		}
		if _, err := tx.Exec(ctx, `
			UPDATE stock_buckets SET available_stock = available_stock - $1, order_stock = order_stock + $1
			WHERE variant_id = $2`, it.Qty, it.VariantID); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to update stock")
			return
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO stock_movements (variant_id, order_id, bucket_from, bucket_to, qty, event_type, user_id)
			VALUES ($1,$2,'available_stock','order_stock',$3,'order_created',$4)`,
			it.VariantID, orderID, it.Qty, claims.UserID); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to log stock movement")
			return
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO order_items (order_id, variant_id, qty, price_at_order, host_id)
			VALUES ($1,$2,$3,$4,$5)`, orderID, it.VariantID, it.Qty, price, it.HostID); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to create order item")
			return
		}
	}

	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "db commit failed")
		return
	}

	respondJSON(w, http.StatusCreated, map[string]interface{}{
		"order_id": orderID, "order_no": orderNo, "status": "pending",
	})
}

type updateStatusRequest struct {
	Status string `json:"status"`
	Reason string `json:"reason"`
}

// UpdateStatus validates the transition and triggers the corresponding stock movement.
func (h *OrderHandler) UpdateStatus(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid order id")
		return
	}
	var req updateStatusRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	claims := appmw.GetClaims(r)
	ctx := r.Context()

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(ctx)

	var currentStatus string
	if err := tx.QueryRow(ctx, `SELECT status FROM orders WHERE id=$1 FOR UPDATE`, id).
		Scan(&currentStatus); err != nil {
		respondError(w, http.StatusNotFound, "order not found")
		return
	}

	allowed := validTransitions[currentStatus]
	isValid := false
	for _, s := range allowed {
		if s == req.Status {
			isValid = true
			break
		}
	}
	if !isValid {
		respondError(w, http.StatusBadRequest, "transisi status tidak valid: "+currentStatus+" -> "+req.Status)
		return
	}
	if (req.Status == "cancelled" || req.Status == "return") && req.Reason == "" {
		respondError(w, http.StatusBadRequest, "reason is required for cancelled/return")
		return
	}

	rows, err := tx.Query(ctx, `SELECT variant_id, qty FROM order_items WHERE order_id=$1`, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load order items")
		return
	}
	type item struct {
		VariantID int
		Qty       int
	}
	var items []item
	for rows.Next() {
		var it item
		rows.Scan(&it.VariantID, &it.Qty)
		items = append(items, it)
	}
	rows.Close()

	for _, it := range items {
		switch req.Status {
		case "delivered":
			// order_stock decreases (sale finalized). total_stock unaffected (already decreased at Pending).
			tx.Exec(ctx, `UPDATE stock_buckets SET order_stock = order_stock - $1 WHERE variant_id=$2`, it.Qty, it.VariantID)
			tx.Exec(ctx, `INSERT INTO stock_movements (variant_id, order_id, bucket_from, bucket_to, qty, event_type, user_id, note)
				VALUES ($1,$2,'order_stock','(finalized)',$3,'order_delivered',$4,$5)`,
				it.VariantID, id, it.Qty, claims.UserID, req.Reason)
		case "cancelled":
			// order_stock -> available_stock, total_stock increases back.
			tx.Exec(ctx, `UPDATE stock_buckets SET order_stock = order_stock - $1, available_stock = available_stock + $1 WHERE variant_id=$2`, it.Qty, it.VariantID)
			tx.Exec(ctx, `INSERT INTO stock_movements (variant_id, order_id, bucket_from, bucket_to, qty, event_type, user_id, note)
				VALUES ($1,$2,'order_stock','available_stock',$3,'order_cancelled',$4,$5)`,
				it.VariantID, id, it.Qty, claims.UserID, req.Reason)
		case "return":
			// order_stock -> broken_stock (if still present, e.g. from Shipped), total_stock increases.
			// If coming from 'delivered', order_stock was already 0, so this just adds to broken_stock (physical item returned).
			if currentStatus == "delivered" {
				tx.Exec(ctx, `UPDATE stock_buckets SET broken_stock = broken_stock + $1 WHERE variant_id=$2`, it.Qty, it.VariantID)
			} else {
				tx.Exec(ctx, `UPDATE stock_buckets SET order_stock = order_stock - $1, broken_stock = broken_stock + $1 WHERE variant_id=$2`, it.Qty, it.VariantID)
			}
			tx.Exec(ctx, `INSERT INTO stock_movements (variant_id, order_id, bucket_from, bucket_to, qty, event_type, user_id, note)
				VALUES ($1,$2,'order_stock','broken_stock',$3,'order_return',$4,$5)`,
				it.VariantID, id, it.Qty, claims.UserID, req.Reason)
		}
	}

	if _, err := tx.Exec(ctx, `UPDATE orders SET status=$1, updated_at=now() WHERE id=$2`, req.Status, id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to update order status")
		return
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO order_status_log (order_id, status_from, status_to, changed_by, reason)
		VALUES ($1,$2,$3,$4,$5)`, id, currentStatus, req.Status, claims.UserID, req.Reason); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to log status change")
		return
	}

	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "db commit failed")
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": req.Status})
}

type updateNotesRequest struct {
	InternalNotes string `json:"internal_notes"`
}

// UpdateNotes edits the order's free-text internal staff note.
func (h *OrderHandler) UpdateNotes(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid order id")
		return
	}
	var req updateNotesRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	ct, err := h.DB.Exec(r.Context(), `UPDATE orders SET internal_notes=$1 WHERE id=$2`, req.InternalNotes, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save note")
		return
	}
	if ct.RowsAffected() == 0 {
		respondError(w, http.StatusNotFound, "order not found")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

type addAttachmentRequest struct {
	URL string `json:"url"`
}

// AddAttachment records a file (already uploaded via /uploads/image) against the order.
func (h *OrderHandler) AddAttachment(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid order id")
		return
	}
	var req addAttachmentRequest
	if err := decodeJSON(r, &req); err != nil || req.URL == "" {
		respondError(w, http.StatusBadRequest, "url is required")
		return
	}
	var attID int
	if err := h.DB.QueryRow(r.Context(), `
		INSERT INTO order_attachments (order_id, url) VALUES ($1,$2) RETURNING id`, id, req.URL).Scan(&attID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save attachment")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]int{"id": attID})
}

type pickItemRequest struct {
	PickedQty int `json:"picked_qty"`
}

// PickItem records how much of a line item has been physically gathered during picking
// (used both from the order-detail page and the cross-order Daftar Pengambilan queue).
func (h *OrderHandler) PickItem(w http.ResponseWriter, r *http.Request) {
	itemID, err := strconv.Atoi(chi.URLParam(r, "itemId"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid item id")
		return
	}
	var req pickItemRequest
	if err := decodeJSON(r, &req); err != nil || req.PickedQty < 0 {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	ct, err := h.DB.Exec(r.Context(), `
		UPDATE order_items SET picked_qty = LEAST($1, qty) WHERE id=$2`, req.PickedQty, itemID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to update picked quantity")
		return
	}
	if ct.RowsAffected() == 0 {
		respondError(w, http.StatusNotFound, "order item not found")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

type splitOrderRequest struct {
	ItemIDs []int `json:"item_ids"`
}

// Split moves a subset of an order's line items into a brand-new order (same customer, host
// attribution and pickup info), for when a customer's items can't all ship together.
func (h *OrderHandler) Split(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid order id")
		return
	}
	var req splitOrderRequest
	if err := decodeJSON(r, &req); err != nil || len(req.ItemIDs) == 0 {
		respondError(w, http.StatusBadRequest, "item_ids is required")
		return
	}

	ctx := r.Context()
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(ctx)

	var customerID, salesID, pickupChainID int
	var shippingAddress, pickupStoreName, pickupStoreCode string
	if err := tx.QueryRow(ctx, `
		SELECT customer_id, COALESCE(sales_id,0), pickup_chain_id, shipping_address,
		       COALESCE(pickup_store_name,''), COALESCE(pickup_store_code,'')
		FROM orders WHERE id=$1 FOR UPDATE`, id).
		Scan(&customerID, &salesID, &pickupChainID, &shippingAddress, &pickupStoreName, &pickupStoreCode); err != nil {
		respondError(w, http.StatusNotFound, "order not found")
		return
	}

	var totalItems int
	tx.QueryRow(ctx, `SELECT COUNT(*) FROM order_items WHERE order_id=$1`, id).Scan(&totalItems)
	if len(req.ItemIDs) >= totalItems {
		respondError(w, http.StatusBadRequest, "tidak bisa memisahkan semua item; sisakan minimal 1 item di order asal")
		return
	}

	newOrderNo := fmt.Sprintf("ORD-%d-%04d", time.Now().Unix(), rand.Intn(9999))
	var newOrderID int
	if err := tx.QueryRow(ctx, `
		INSERT INTO orders (order_no, customer_id, sales_id, status, shipping_address, pickup_chain_id, pickup_store_name, pickup_store_code, parent_order_id)
		VALUES ($1,$2,$3,(SELECT status FROM orders WHERE id=$4),$5,$6,$7,$8,$4) RETURNING id`,
		newOrderNo, customerID, salesID, id, shippingAddress, pickupChainID, pickupStoreName, pickupStoreCode).Scan(&newOrderID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create split order")
		return
	}

	itemIDs32 := make([]int32, len(req.ItemIDs))
	for i, v := range req.ItemIDs {
		itemIDs32[i] = int32(v)
	}
	ct, err := tx.Exec(ctx, `
		UPDATE order_items SET order_id=$1 WHERE id = ANY($2) AND order_id=$3`,
		newOrderID, itemIDs32, id)
	if err != nil || ct.RowsAffected() == 0 {
		respondError(w, http.StatusInternalServerError, "failed to move items to split order")
		return
	}

	claims := appmw.GetClaims(r)
	tx.Exec(ctx, `INSERT INTO order_status_log (order_id, status_from, status_to, changed_by, reason)
		VALUES ($1,NULL,(SELECT status FROM orders WHERE id=$1),$2,$3)`, newOrderID, claims.UserID, "Dipisah dari "+strconv.Itoa(id))
	tx.Exec(ctx, `INSERT INTO order_status_log (order_id, status_from, status_to, changed_by, reason)
		VALUES ($1,(SELECT status FROM orders WHERE id=$1),(SELECT status FROM orders WHERE id=$1),$2,$3)`,
		id, claims.UserID, fmt.Sprintf("Sebagian item dipisah ke order #%d", newOrderID))

	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "db commit failed")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]int{"new_order_id": newOrderID})
}

func itoa(n int) string {
	return strconv.Itoa(n)
}
