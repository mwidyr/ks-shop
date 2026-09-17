package handlers

import (
	"context"
	"fmt"
	"math/rand"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	appmw "ordermgmt/internal/middleware"
)

// querier is satisfied by both *pgxpool.Pool and pgx.Tx, so validation helpers can run
// either inside or outside a transaction.
type querier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

type OrderHandler struct {
	DB *pgxpool.Pool
}

var validTransitions = map[string][]string{
	"pending":       {"picking", "cancelled"},
	"picking":       {"ready_to_ship", "cancelled"},
	"ready_to_ship": {"shipped", "cancelled"},
	"shipped":       {"delivered", "cancelled", "return"},
	"delivered":     {"return"},
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
	CustomerBlocked bool    `json:"customer_blacklisted"`
	IsUrgent        bool    `json:"is_urgent"`
	IsMerged        bool    `json:"is_merged"`
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
		likeArg := addArg(like)
		baseWhere += " AND (c.name ILIKE " + likeArg + " OR c.phone ILIKE " + likeArg + " OR o.order_no ILIKE " + likeArg + ")"
	}
	if q.Get("blacklist_only") == "true" {
		baseWhere += " AND EXISTS (SELECT 1 FROM customer_labels cl WHERE cl.customer_id = o.customer_id AND cl.label = 'blacklist')"
	}
	if sessionID := q.Get("session_id"); sessionID != "" {
		baseWhere += " AND EXISTS (SELECT 1 FROM order_items ois WHERE ois.order_id = o.id AND ois.live_session_id = " + addArg(sessionID) + ")"
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

	orderBy := "o.created_at DESC"
	switch q.Get("sort") {
	case "oldest":
		orderBy = "o.created_at ASC"
	case "total_desc":
		orderBy = "total_amount DESC"
	case "total_asc":
		orderBy = "total_amount ASC"
	}

	query := `
		SELECT o.id, o.order_no, o.status, c.name, c.phone, pc.name,
		       COALESCE(o.pickup_store_name,''), COALESCE(o.pickup_store_code,''), o.created_at,
		       COALESCE(SUM(oi.qty * oi.price_at_order),0) - o.discount_amount + o.additional_amount +
		       CASE WHEN EXISTS (
		           SELECT 1 FROM order_shipment_group_members gm
		           JOIN order_shipment_groups g ON g.id = gm.group_id
		           WHERE gm.order_id = o.id AND g.shipping_fee_order_id != o.id
		       ) THEN 0 ELSE o.shipping_fee END AS total_amount,
		       COALESCE((SELECT SUM(oi3.qty) FROM order_items oi3 WHERE oi3.order_id = o.id), 0),
		       COALESCE((SELECT string_agg(DISTINCT h.name, ', ') FROM order_items oi2
		                 JOIN hosts h ON h.id = oi2.host_id WHERE oi2.order_id = o.id), '-'),
		       EXISTS (SELECT 1 FROM customer_labels cl2 WHERE cl2.customer_id = o.customer_id AND cl2.label = 'blacklist'),
		       o.is_urgent,
		       EXISTS (SELECT 1 FROM order_shipment_group_members gm2 WHERE gm2.order_id = o.id)
		FROM orders o
		JOIN customers c ON c.id = o.customer_id
		JOIN pickup_chains pc ON pc.id = o.pickup_chain_id
		LEFT JOIN order_items oi ON oi.order_id = o.id` +
		baseWhere +
		" GROUP BY o.id, c.name, c.phone, pc.name ORDER BY " + orderBy + " LIMIT " + limitPlaceholder + " OFFSET " + offsetPlaceholder

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
			&o.PickupStoreName, &o.PickupStoreCode, &createdAt, &o.Total, &o.TotalQty, &o.HostNames, &o.CustomerBlocked, &o.IsUrgent, &o.IsMerged); err != nil {
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
	AvailableToPick int     `json:"available_to_pick"` // total_stock = available_stock - order_stock: the actual pick-time gate value
	PhysicalStock   int     `json:"physical_stock"`    // raw available_stock, for staff reference
	IsOversell      bool    `json:"is_oversell"`
}

// groupItemView is an orderItemView plus the source order's number, used only for the combined
// cross-order item list shown when an order is part of a shipment group (see Detail).
type groupItemView struct {
	orderItemView
	OrderNo string `json:"order_no"`
}

type orderDetailView struct {
	ID                       int             `json:"id"`
	OrderNo                  string          `json:"order_no"`
	Status                   string          `json:"status"`
	CustomerName             string          `json:"customer_name"`
	CustomerPhone            string          `json:"customer_phone"`
	CustomerBlocked          bool            `json:"customer_blacklisted"`
	ShippingAddress          string          `json:"shipping_address"`
	PickupChainID            int             `json:"pickup_chain_id"`
	PickupChainName          string          `json:"pickup_chain_name"`
	PickupStoreName          string          `json:"pickup_store_name"`
	PickupStoreCode          string          `json:"pickup_store_code"`
	Items                    []orderItemView `json:"items"`
	Subtotal                 float64         `json:"subtotal"`
	DiscountAmount           float64         `json:"discount_amount"`
	AdditionalAmount         float64         `json:"additional_amount"`
	Total                    float64         `json:"total"`
	InternalNotes            string          `json:"internal_notes"`
	IsUrgent                 bool            `json:"is_urgent"`
	NotesDeadline            *string         `json:"notes_deadline"`
	Attachments              []string        `json:"attachments"`
	CreatedBy                string          `json:"created_by"`
	CreatedAt                string          `json:"created_at"`
	KeepDate                 *string         `json:"keep_date"`
	ShippingFee              float64         `json:"shipping_fee"`
	FreeShippingOverride     bool            `json:"free_shipping_override"`
	ShipmentGroupID          *int            `json:"shipment_group_id"`
	ShipmentGroupOrders      []string        `json:"shipment_group_order_nos"`
	ShipmentGroupItems       []groupItemView `json:"shipment_group_items,omitempty"`
	ShipmentGroupTotal       float64         `json:"shipment_group_total"`
	ShipmentGroupShippingFee float64         `json:"shipment_group_shipping_fee"`
	StatusHistory            []statusLogView `json:"status_history"`
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
	var keepDate *time.Time
	var notesDeadline *time.Time
	err = h.DB.QueryRow(ctx, `
		SELECT o.id, o.order_no, o.status, c.name, c.phone,
		       EXISTS(SELECT 1 FROM customer_labels cl WHERE cl.customer_id = c.id AND cl.label = 'blacklist'),
		       o.shipping_address, pc.id, pc.name,
		       COALESCE(o.pickup_store_name,''), COALESCE(o.pickup_store_code,''), o.discount_amount, o.additional_amount,
		       COALESCE(o.internal_notes,''), o.is_urgent, o.notes_deadline, COALESCE(u.name,'system'), o.created_at, o.keep_date,
		       o.shipping_fee, o.free_shipping_override
		FROM orders o
		JOIN customers c ON c.id=o.customer_id
		JOIN pickup_chains pc ON pc.id = o.pickup_chain_id
		LEFT JOIN users u ON u.id = o.sales_id
		WHERE o.id=$1`, id).
		Scan(&o.ID, &o.OrderNo, &o.Status, &o.CustomerName, &o.CustomerPhone, &o.CustomerBlocked,
			&o.ShippingAddress, &o.PickupChainID, &o.PickupChainName,
			&o.PickupStoreName, &o.PickupStoreCode, &o.DiscountAmount, &o.AdditionalAmount,
			&o.InternalNotes, &o.IsUrgent, &notesDeadline, &o.CreatedBy, &createdAt, &keepDate,
			&o.ShippingFee, &o.FreeShippingOverride)
	if err != nil {
		respondError(w, http.StatusNotFound, "order not found")
		return
	}
	o.CreatedAt = createdAt.Format(time.RFC3339)
	if keepDate != nil {
		v := keepDate.Format("2006-01-02")
		o.KeepDate = &v
	}
	if notesDeadline != nil {
		v := notesDeadline.Format(time.RFC3339)
		o.NotesDeadline = &v
	}

	rows, err := h.DB.Query(ctx, `
		SELECT oi.id, oi.variant_id, p.name,
		       COALESCE((SELECT pi.url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order LIMIT 1), ''),
		       pv.color, pv.size, pv.sku, oi.qty, oi.picked_qty, oi.price_at_order, oi.host_id, COALESCE(h.name,'-'),
		       sb.available_stock - sb.order_stock, sb.available_stock
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
	var groupID, feeOrderID *int
	if err := h.DB.QueryRow(ctx, `
		SELECT m.group_id, g.shipping_fee_order_id
		FROM order_shipment_group_members m
		JOIN order_shipment_groups g ON g.id = m.group_id
		WHERE m.order_id=$1`, id).Scan(&groupID, &feeOrderID); err == nil && groupID != nil {
		o.ShipmentGroupID = groupID
		if feeOrderID != nil && *feeOrderID != id {
			// Fee is charged once on the group's designated order - this order's own stored
			// shipping_fee is left untouched in the DB (historical record), only the displayed
			// figure is zeroed so it isn't double-charged to the customer.
			o.ShippingFee = 0
		}
		groupRows, err := h.DB.Query(ctx, `
			SELECT o2.order_no FROM order_shipment_group_members m2
			JOIN orders o2 ON o2.id = m2.order_id
			WHERE m2.group_id = $1 AND m2.order_id != $2`, *groupID, id)
		if err == nil {
			defer groupRows.Close()
			o.ShipmentGroupOrders = []string{}
			for groupRows.Next() {
				var no string
				groupRows.Scan(&no)
				o.ShipmentGroupOrders = append(o.ShipmentGroupOrders, no)
			}
		}

		// The real, one-time shipping fee for the whole group lives on the fee-holder order -
		// every member's own o.ShippingFee is display-zeroed above except the holder's, so this
		// is the only reliable way to get it regardless of which member is being viewed.
		if feeOrderID != nil {
			h.DB.QueryRow(ctx, `SELECT shipping_fee FROM orders WHERE id=$1`, *feeOrderID).Scan(&o.ShipmentGroupShippingFee)
		}

		itemRows, err := h.DB.Query(ctx, `
			SELECT oi.id, oi.variant_id, p.name,
			       COALESCE((SELECT pi.url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order LIMIT 1), ''),
			       pv.color, pv.size, pv.sku, oi.qty, oi.picked_qty, oi.price_at_order, oi.host_id, COALESCE(h2.name,'-'),
			       sb.available_stock - sb.order_stock, sb.available_stock, o2.order_no
			FROM order_shipment_group_members m2
			JOIN orders o2 ON o2.id = m2.order_id
			JOIN order_items oi ON oi.order_id = o2.id
			JOIN product_variants pv ON pv.id = oi.variant_id
			JOIN products p ON p.id = pv.product_id
			JOIN stock_buckets sb ON sb.variant_id = pv.id
			LEFT JOIN hosts h2 ON h2.id = oi.host_id
			WHERE m2.group_id = $1
			ORDER BY o2.created_at, oi.id`, *groupID)
		if err == nil {
			defer itemRows.Close()
			o.ShipmentGroupItems = []groupItemView{}
			for itemRows.Next() {
				var it groupItemView
				itemRows.Scan(&it.ID, &it.VariantID, &it.ProductName, &it.ImageURL, &it.Color, &it.Size, &it.SKU, &it.Qty, &it.PickedQty,
					&it.Price, &it.HostID, &it.HostName, &it.AvailableToPick, &it.PhysicalStock, &it.OrderNo)
				it.IsOversell = it.AvailableToPick < 0
				o.ShipmentGroupTotal += it.Price * float64(it.Qty)
				o.ShipmentGroupItems = append(o.ShipmentGroupItems, it)
			}
		}

		var groupDiscount, groupAdditional float64
		h.DB.QueryRow(ctx, `
			SELECT COALESCE(SUM(o2.discount_amount),0), COALESCE(SUM(o2.additional_amount),0)
			FROM order_shipment_group_members m2
			JOIN orders o2 ON o2.id = m2.order_id
			WHERE m2.group_id = $1`, *groupID).Scan(&groupDiscount, &groupAdditional)
		o.ShipmentGroupTotal = o.ShipmentGroupTotal - groupDiscount + groupAdditional + o.ShipmentGroupShippingFee
	}
	o.Total = o.Subtotal - o.DiscountAmount + o.AdditionalAmount + o.ShippingFee

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
	HostID        int  `json:"host_id"`
	VariantID     int  `json:"variant_id"`
	Qty           int  `json:"qty"`
	LiveSessionID *int `json:"live_session_id"`
}

type createOrderRequest struct {
	Customer             createOrderCustomer `json:"customer"`
	ShippingAddress      string              `json:"shipping_address"`
	PickupChainID        int                 `json:"pickup_chain_id"`
	PickupStoreName      string              `json:"pickup_store_name"`
	PickupStoreCode      string              `json:"pickup_store_code"`
	Items                []createOrderItem   `json:"items"`
	DiscountAmount       float64             `json:"discount_amount"`
	AdditionalAmount     float64             `json:"additional_amount"`
	KeepDate             *string             `json:"keep_date"`
	FreeShippingOverride bool                `json:"free_shipping_override"`
	ShippingFeeOverride  *float64            `json:"shipping_fee_override"`
	InternalNotes        string              `json:"internal_notes"`
	IsUrgent             bool                `json:"is_urgent"`
	NotesDeadline        *string             `json:"notes_deadline"`
}

var cvsStoreCodePattern = regexp.MustCompile(`^\d{6}$`)

// resolvePickupAddress validates the pickup fields for a chain (looked up by chainID) and
// returns the final shipping_address to store. CVS chains (7-Eleven/FamilyMart) require a
// 6-digit store code and get a fallback address composed from store name/code, since many
// pages display shipping_address unconditionally; other chains require a non-empty address
// as typed. badRequestMsg is non-empty (and finalAddress should be ignored) on validation
// failure. Shared by Create and UpdatePickup so both stay in sync.
func resolvePickupAddress(ctx context.Context, db querier, chainID int, storeCode, storeName, address string) (finalAddress string, badRequestMsg string) {
	var chainType string
	if err := db.QueryRow(ctx, `SELECT chain_type FROM pickup_chains WHERE id=$1`, chainID).Scan(&chainType); err != nil {
		return "", "invalid pickup_chain_id"
	}
	if chainType == "cvs_711" || chainType == "cvs_familymart" {
		if !cvsStoreCodePattern.MatchString(storeCode) {
			return "", "Kode Toko harus 6 digit angka"
		}
		if address == "" {
			address = strings.TrimSpace(storeName + " " + storeCode)
			if address == "" {
				address = "-"
			}
		}
		return address, ""
	}
	if address == "" {
		return "", "shipping_address is required"
	}
	return address, ""
}

// Create builds a manual order directly (no cart/checkout step): resolves/creates the
// buyer, decrements available_stock -> order_stock per line item in one transaction.
func (h *OrderHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req createOrderRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
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

	finalAddress, badRequest := resolvePickupAddress(ctx, h.DB, req.PickupChainID, req.PickupStoreCode, req.PickupStoreName, req.ShippingAddress)
	if badRequest != "" {
		respondError(w, http.StatusBadRequest, badRequest)
		return
	}
	req.ShippingAddress = finalAddress

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
		INSERT INTO orders (order_no, customer_id, sales_id, status, shipping_address, pickup_chain_id, pickup_store_name, pickup_store_code, discount_amount, additional_amount, keep_date, internal_notes, is_urgent, notes_deadline)
		VALUES ($1,$2,$3,'pending',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
		orderNo, *customerID, claims.UserID, req.ShippingAddress, req.PickupChainID, req.PickupStoreName, req.PickupStoreCode,
		req.DiscountAmount, req.AdditionalAmount, req.KeepDate, req.InternalNotes, req.IsUrgent, req.NotesDeadline).Scan(&orderID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create order")
		return
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO order_status_log (order_id, status_from, status_to, changed_by)
		VALUES ($1, NULL, 'pending', $2)`, orderID, claims.UserID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to log order status")
		return
	}

	// Order creation never validates or touches stock - the only enforcement point is
	// PickItem, gated on total_stock (available_stock - order_stock) staying positive. This
	// deliberately allows an order to be created even with zero/insufficient stock on hand.
	var subtotal float64
	for _, it := range req.Items {
		var price float64
		if err := tx.QueryRow(ctx, `SELECT price FROM product_variants WHERE id=$1`, it.VariantID).Scan(&price); err != nil {
			respondError(w, http.StatusBadRequest, "variant not found")
			return
		}
		subtotal += price * float64(it.Qty)
		if _, err := tx.Exec(ctx, `
			INSERT INTO order_items (order_id, variant_id, qty, price_at_order, host_id, live_session_id)
			VALUES ($1,$2,$3,$4,$5,$6)`, orderID, it.VariantID, it.Qty, price, it.HostID, it.LiveSessionID); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to create order item")
			return
		}
	}

	shippingFee := 0.0
	freeShippingOverride := req.FreeShippingOverride
	if req.ShippingFeeOverride != nil {
		// A caller-chosen fee wins outright - skip the settings/chain-based computation.
		shippingFee = *req.ShippingFeeOverride
		freeShippingOverride = shippingFee == 0
	} else {
		shippingFee, err = ComputeShippingFee(ctx, tx, req.PickupChainID, subtotal, req.FreeShippingOverride)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "failed to compute shipping fee")
			return
		}
	}
	if _, err := tx.Exec(ctx, `UPDATE orders SET shipping_fee=$1, free_shipping_override=$2 WHERE id=$3`,
		shippingFee, freeShippingOverride, orderID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save shipping fee")
		return
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

// findMergeableSiblings returns the order_nos of other orders belonging to the same customer,
// pickup chain and store as orderID, that are still pending/ready_to_ship (i.e. still eligible
// to merge - see order_merge.go's Suggestions/CreateGroup, which use this exact same
// eligibility) and not already grouped together with orderID.
func (h *OrderHandler) findMergeableSiblings(ctx context.Context, tx pgx.Tx, orderID int) ([]string, error) {
	rows, err := tx.Query(ctx, `
		SELECT o2.order_no
		FROM orders o1
		JOIN orders o2 ON o2.customer_id = o1.customer_id
			AND o2.pickup_chain_id = o1.pickup_chain_id
			AND COALESCE(o2.pickup_store_code,'') = COALESCE(o1.pickup_store_code,'')
			AND o2.id <> o1.id
		WHERE o1.id = $1 AND o2.status IN ('pending','ready_to_ship')
			AND NOT EXISTS (
				SELECT 1 FROM order_shipment_group_members m1
				JOIN order_shipment_group_members m2 ON m2.group_id = m1.group_id
				WHERE m1.order_id = o1.id AND m2.order_id = o2.id
			)`, orderID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var siblingOrderNos []string
	for rows.Next() {
		var no string
		if err := rows.Scan(&no); err != nil {
			continue
		}
		siblingOrderNos = append(siblingOrderNos, no)
	}
	return siblingOrderNos, nil
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

	rows, err := tx.Query(ctx, `SELECT variant_id, qty, picked_qty FROM order_items WHERE order_id=$1`, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load order items")
		return
	}
	type item struct {
		VariantID int
		Qty       int
		PickedQty int
	}
	var items []item
	for rows.Next() {
		var it item
		rows.Scan(&it.VariantID, &it.Qty, &it.PickedQty)
		items = append(items, it)
	}
	rows.Close()

	if req.Status == "picking" {
		anyPicked := false
		for _, it := range items {
			if it.PickedQty > 0 {
				anyPicked = true
				break
			}
		}
		if !anyPicked {
			respondError(w, http.StatusBadRequest, "pilih dan ambil setidaknya satu produk sebelum memulai picking")
			return
		}
	}

	// Merging only ever works pre-picking/pre-shipment (see order_merge.go's Suggestions/
	// CreateGroup eligibility: pending or ready_to_ship, never mid-picking) - so the earliest
	// useful place to warn staff about a mergeable sibling is right when picking is about to
	// start, not just at the final shipped transition. Both checks stay in place: "picking"
	// catches it as early as possible, "shipped" is the last-resort safety net in case a
	// sibling order was only created after this one had already started picking.
	if req.Status == "picking" || req.Status == "shipped" {
		siblingOrderNos, sibErr := h.findMergeableSiblings(ctx, tx, id)
		if sibErr == nil && len(siblingOrderNos) > 0 {
			respondError(w, http.StatusConflict, "pelanggan ini punya order lain yang bisa digabung sebelum dikirim: "+strings.Join(siblingOrderNos, ", "))
			return
		}
	}

	for _, it := range items {
		switch req.Status {
		case "delivered":
			// order_stock decreases (sale finalized). available_stock was already decreased at
			// pick time, so no change there - by this stage picked_qty == qty for every item.
			tx.Exec(ctx, `UPDATE stock_buckets SET order_stock = order_stock - $1 WHERE variant_id=$2`, it.PickedQty, it.VariantID)
			tx.Exec(ctx, `INSERT INTO stock_movements (variant_id, order_id, bucket_from, bucket_to, qty, event_type, user_id, note)
				VALUES ($1,$2,'order_stock','(finalized)',$3,'order_delivered',$4,$5)`,
				it.VariantID, id, it.PickedQty, claims.UserID, req.Reason)
		case "cancelled":
			// Only the actually-picked portion ever touched stock (order creation no longer
			// reserves anything) - reverse picked_qty, not the full ordered qty.
			tx.Exec(ctx, `UPDATE stock_buckets SET order_stock = order_stock - $1, available_stock = available_stock + $1 WHERE variant_id=$2`, it.PickedQty, it.VariantID)
			tx.Exec(ctx, `INSERT INTO stock_movements (variant_id, order_id, bucket_from, bucket_to, qty, event_type, user_id, note)
				VALUES ($1,$2,'order_stock','available_stock',$3,'order_cancelled',$4,$5)`,
				it.VariantID, id, it.PickedQty, claims.UserID, req.Reason)
		case "return":
			// order_stock -> available_stock (if still present, e.g. from Shipped) - returned items
			// go straight back to sellable stock. If coming from 'delivered', order_stock was
			// already 0, so this just adds the returned qty back to available_stock.
			if currentStatus == "delivered" {
				tx.Exec(ctx, `UPDATE stock_buckets SET available_stock = available_stock + $1 WHERE variant_id=$2`, it.PickedQty, it.VariantID)
			} else {
				tx.Exec(ctx, `UPDATE stock_buckets SET order_stock = order_stock - $1, available_stock = available_stock + $1 WHERE variant_id=$2`, it.PickedQty, it.VariantID)
			}
			tx.Exec(ctx, `INSERT INTO stock_movements (variant_id, order_id, bucket_from, bucket_to, qty, event_type, user_id, note)
				VALUES ($1,$2,'order_stock','available_stock',$3,'order_return',$4,$5)`,
				it.VariantID, id, it.PickedQty, claims.UserID, req.Reason)
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
	InternalNotes string  `json:"internal_notes"`
	IsUrgent      bool    `json:"is_urgent"`
	NotesDeadline *string `json:"notes_deadline"`
}

// UpdateNotes edits the order's free-text internal staff note, plus an urgent flag and an
// optional deadline shown alongside it.
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
	ct, err := h.DB.Exec(r.Context(), `UPDATE orders SET internal_notes=$1, is_urgent=$2, notes_deadline=$3 WHERE id=$4`,
		req.InternalNotes, req.IsUrgent, req.NotesDeadline, id)
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

type updatePickupRequest struct {
	PickupChainID       int      `json:"pickup_chain_id"`
	PickupStoreName     string   `json:"pickup_store_name"`
	PickupStoreCode     string   `json:"pickup_store_code"`
	ShippingAddress     string   `json:"shipping_address"`
	ShippingFeeOverride *float64 `json:"shipping_fee_override"`
}

// UpdatePickup lets staff change an existing order's pickup method/store/address after
// creation (e.g. the customer changes their mind about which CVS branch to use).
func (h *OrderHandler) UpdatePickup(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid order id")
		return
	}
	var req updatePickupRequest
	if err := decodeJSON(r, &req); err != nil || req.PickupChainID == 0 {
		respondError(w, http.StatusBadRequest, "pickup_chain_id is required")
		return
	}
	ctx := r.Context()
	finalAddress, badRequest := resolvePickupAddress(ctx, h.DB, req.PickupChainID, req.PickupStoreCode, req.PickupStoreName, req.ShippingAddress)
	if badRequest != "" {
		respondError(w, http.StatusBadRequest, badRequest)
		return
	}

	var ct pgconn.CommandTag
	if req.ShippingFeeOverride != nil {
		freeShippingOverride := *req.ShippingFeeOverride == 0
		ct, err = h.DB.Exec(ctx, `
			UPDATE orders SET pickup_chain_id=$1, pickup_store_name=$2, pickup_store_code=$3, shipping_address=$4,
			       shipping_fee=$5, free_shipping_override=$6
			WHERE id=$7`,
			req.PickupChainID, req.PickupStoreName, req.PickupStoreCode, finalAddress,
			*req.ShippingFeeOverride, freeShippingOverride, id)
	} else {
		ct, err = h.DB.Exec(ctx, `
			UPDATE orders SET pickup_chain_id=$1, pickup_store_name=$2, pickup_store_code=$3, shipping_address=$4
			WHERE id=$5`,
			req.PickupChainID, req.PickupStoreName, req.PickupStoreCode, finalAddress, id)
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to update pickup method")
		return
	}
	if ct.RowsAffected() == 0 {
		respondError(w, http.StatusNotFound, "order not found")
		return
	}

	claims := appmw.GetClaims(r)
	var userID *int
	if claims != nil {
		userID = &claims.UserID
	}
	logActivity(ctx, h.DB, "order", id, "pickup_updated", userID, fmt.Sprintf("pickup_chain_id=%d store=%s", req.PickupChainID, req.PickupStoreCode))
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

type updateKeepDateRequest struct {
	KeepDate *string `json:"keep_date"`
}

// UpdateKeepDate sets or clears the order's Keep date (nullable - clearing it makes the order
// immediately picking-queue-eligible again, see PickingHandler.Queue).
func (h *OrderHandler) UpdateKeepDate(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid order id")
		return
	}
	var req updateKeepDateRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	ct, err := h.DB.Exec(r.Context(), `UPDATE orders SET keep_date=$1 WHERE id=$2`, req.KeepDate, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save keep date")
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
// (used both from the order-detail page and the cross-order Daftar Pengambilan queue). Once
// every item on the order reaches full picked_qty, the order auto-transitions picking ->
// ready_to_ship - "ready to ship" is a derived fact (100% picked), not a staff decision, so
// there's no separate manual "mark as ready" action to forget.
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
	claims := appmw.GetClaims(r)
	ctx := r.Context()

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(ctx)

	var orderID, variantID, qty, oldPickedQty int
	if err := tx.QueryRow(ctx, `SELECT order_id, variant_id, qty, picked_qty FROM order_items WHERE id=$1`, itemID).
		Scan(&orderID, &variantID, &qty, &oldPickedQty); err != nil {
		respondError(w, http.StatusNotFound, "order item not found")
		return
	}
	if _, err := tx.Exec(ctx, `SELECT id FROM orders WHERE id=$1 FOR UPDATE`, orderID); err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}

	newPickedQty := req.PickedQty
	if newPickedQty > qty {
		newPickedQty = qty
	}
	delta := newPickedQty - oldPickedQty

	// Stock is only ever touched here, not at order creation: picking is the sole enforcement
	// point. total_stock = available_stock - order_stock must stay positive for a pick to add
	// quantity; releasing quantity (delta < 0, picked_qty being lowered) never needs a gate.
	if delta > 0 {
		var available, orderStock int
		var allowOversell bool
		if err := tx.QueryRow(ctx, `
			SELECT sb.available_stock, sb.order_stock, pv.allow_oversell FROM stock_buckets sb
			JOIN product_variants pv ON pv.id = sb.variant_id
			WHERE sb.variant_id=$1 FOR UPDATE`, variantID).Scan(&available, &orderStock, &allowOversell); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to load stock")
			return
		}
		totalStock := available - orderStock
		if totalStock <= 0 && !allowOversell {
			respondError(w, http.StatusConflict, fmt.Sprintf("stok tidak mencukupi untuk picking (total_stock: %d)", totalStock))
			return
		}
	}
	if delta != 0 {
		if _, err := tx.Exec(ctx, `
			UPDATE stock_buckets SET available_stock = available_stock - $1, order_stock = order_stock + $1
			WHERE variant_id = $2`, delta, variantID); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to update stock")
			return
		}
		eventType, bucketFrom, bucketTo, movementQty := "item_picked", "available_stock", "order_stock", delta
		if delta < 0 {
			eventType, bucketFrom, bucketTo, movementQty = "item_unpicked", "order_stock", "available_stock", -delta
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO stock_movements (variant_id, order_id, bucket_from, bucket_to, qty, event_type, user_id)
			VALUES ($1,$2,$3,$4,$5,$6,$7)`,
			variantID, orderID, bucketFrom, bucketTo, movementQty, eventType, claims.UserID); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to log stock movement")
			return
		}
	}

	if _, err := tx.Exec(ctx, `UPDATE order_items SET picked_qty = $1 WHERE id=$2`, newPickedQty, itemID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to update picked quantity")
		return
	}

	var remaining int
	if err := tx.QueryRow(ctx, `
		SELECT COUNT(*) FROM order_items WHERE order_id=$1 AND picked_qty < qty`, orderID).Scan(&remaining); err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	if remaining == 0 {
		var currentStatus string
		if err := tx.QueryRow(ctx, `SELECT status FROM orders WHERE id=$1`, orderID).Scan(&currentStatus); err == nil && currentStatus == "picking" {
			tx.Exec(ctx, `UPDATE orders SET status='ready_to_ship', updated_at=now() WHERE id=$1`, orderID)
			tx.Exec(ctx, `
				INSERT INTO order_status_log (order_id, status_from, status_to, changed_by, reason)
				VALUES ($1,'picking','ready_to_ship',$2,'system: semua item sudah dipicking')`, orderID, claims.UserID)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
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
