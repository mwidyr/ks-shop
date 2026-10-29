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
	// OnOrderCreated, when set, is called after a new order is committed (the Telegram notifier
	// uses it to check milestones right away instead of waiting for its timer).
	OnOrderCreated func()
}

// validTransitions are the status changes staff can make by hand. Processing and Ready to Ship are
// never set manually: the Shipping Workbench moves an order there when its batch's shipping Excel
// is exported and when the platform result is imported. Shipped/Delivered normally also come from
// imports (3PL shipment confirmation, platform delivery status); the manual path for those two is
// restricted to warehouse/super_user (see manualShipRoles) as a fallback. A shipped order can no
// longer be cancelled - it follows the return process.
var validTransitions = map[string][]string{
	"pending":       {"cancelled"},
	"processing":    {"cancelled"},
	"ready_to_ship": {"shipped", "cancelled"},
	"shipped":       {"delivered", "return"},
	"delivered":     {"return"},
}

// manualShipTargets can only be set by hand by warehouse/super_user.
var manualShipTargets = map[string]bool{"shipped": true, "delivered": true}

type orderListItem struct {
	ID              int    `json:"id"`
	OrderNo         string `json:"order_no"`
	Status          string `json:"status"`
	CustomerName    string `json:"customer_name"`
	CustomerPhone   string `json:"customer_phone"`
	PickupChainName string `json:"pickup_chain_name"`
	PickupStoreName string `json:"pickup_store_name"`
	PickupStoreCode string `json:"pickup_store_code"`
	// ShippingAddress is the delivery address; shown on the order card for home delivery (CVS
	// orders carry only the store, whose "address" is just its composed name + code).
	ShippingAddress string `json:"shipping_address"`
	PickupChainType string `json:"pickup_chain_type"`
	// StoreUnverified: a 7-Eleven/FamilyMart store code that is NOT in the cached ECPay store
	// directory. Only ever true when that directory has data for the chain (cache empty = ECPay
	// not configured / not yet loaded = unknown, never flagged), same rule as the order form's
	// "store code not found" check.
	StoreUnverified bool    `json:"store_unverified"`
	TotalQty        int     `json:"total_qty"`
	Total           float64 `json:"total"`
	CreatedAt       string  `json:"created_at"`
	CustomerBlocked bool    `json:"customer_blacklisted"`
	IsUrgent        bool    `json:"is_urgent"`
	IsMerged        bool    `json:"is_merged"`
	// Source: staff (created in Ralulu Hub), self_checkout (customer website) or cs_assisted.
	Source string `json:"source"`
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
		baseWhere += " AND o.created_at >= (" + addArg(dateFrom) + "::date)::timestamp AT TIME ZONE 'Asia/Jakarta'"
	}
	if dateTo := q.Get("date_to"); dateTo != "" {
		baseWhere += " AND o.created_at < (" + addArg(dateTo) + "::date + 1)::timestamp AT TIME ZONE 'Asia/Jakarta'"
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
		likeArg := addArg(likePattern(search))
		baseWhere += " AND (c.name ILIKE " + likeArg + " OR c.phone ILIKE " + likeArg + " OR COALESCE(c.address,'') ILIKE " + likeArg +
			" OR o.order_no ILIKE " + likeArg + " OR COALESCE(o.platform_order_no,'') ILIKE " + likeArg + " OR COALESCE(o.tracking_number,'') ILIKE " + likeArg +
			" OR COALESCE(o.shipping_address,'') ILIKE " + likeArg + " OR COALESCE(o.recipient_email,'') ILIKE " + likeArg +
			" OR COALESCE(o.pickup_store_name,'') ILIKE " + likeArg + " OR COALESCE(o.pickup_store_code,'') ILIKE " + likeArg +
			" OR EXISTS (SELECT 1 FROM order_items osi JOIN product_variants osv ON osv.id = osi.variant_id JOIN products osp ON osp.id = osv.product_id" +
			" WHERE osi.order_id = o.id AND (osv.sku ILIKE " + likeArg +
			" OR EXISTS (SELECT 1 FROM variant_sku_history osh WHERE osh.variant_id = osv.id AND osh.old_sku ILIKE " + likeArg + ")" +
			" OR COALESCE(osp.sku,'') ILIKE " + likeArg + " OR osp.name ILIKE " + likeArg + " OR osp.names_search ILIKE " + likeArg + ")))"
	}
	if q.Get("blacklist_only") == "true" {
		baseWhere += " AND EXISTS (SELECT 1 FROM customer_labels cl WHERE cl.customer_id = o.customer_id AND cl.label = 'blacklist')"
	}
	if sessionID := q.Get("session_id"); sessionID != "" {
		baseWhere += " AND EXISTS (SELECT 1 FROM order_items ois WHERE ois.order_id = o.id AND ois.live_session_id = " + addArg(sessionID) + ")"
	}

	pg := parsePage(r, 20, 100)
	pageSize := pg.Size

	// The customers join is only needed by the text search; the count skips it (and so a join per
	// counted row) when nothing searches on the customer.
	countFrom := "FROM orders o"
	if q.Get("q") != "" {
		countFrom = "FROM orders o JOIN customers c ON c.id = o.customer_id"
	}
	var total int
	if err := h.DB.QueryRow(r.Context(), "SELECT COUNT(*) "+countFrom+baseWhere, args...).Scan(&total); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to count orders")
		return
	}

	listArgs := append([]interface{}{}, args...)
	limitPlaceholder := "$" + itoa(argN)
	listArgs = append(listArgs, pageSize)
	argN++
	offsetPlaceholder := "$" + itoa(argN)
	listArgs = append(listArgs, pg.Offset)

	orderBy := pickSort(q.Get("sort"), map[string]string{
		"oldest":     "o.created_at ASC, o.id ASC",
		"total_desc": "total_amount DESC, o.id DESC",
		"total_asc":  "total_amount ASC, o.id ASC",
	}, "o.created_at DESC, o.id DESC")

	// Line items are aggregated once per order in a lateral join (no GROUP BY over the item rows, and
	// the item sum and quantity share one scan of order_items instead of two).
	const selectCols = `
		SELECT o.id, o.order_no, o.status, c.name, c.phone, pc.name,
		       COALESCE(o.pickup_store_name,''), COALESCE(o.pickup_store_code,''), o.created_at,
		       COALESCE(oi.subtotal,0) - o.discount_amount - o.promotion_discount_amount + o.additional_amount +
		       CASE WHEN EXISTS (
		           SELECT 1 FROM order_shipment_group_members gm
		           JOIN order_shipment_groups g ON g.id = gm.group_id
		           WHERE gm.order_id = o.id AND g.shipping_fee_order_id != o.id
		       ) THEN 0 ELSE o.shipping_fee END AS total_amount,
		       COALESCE(oi.qty,0),
		       EXISTS (SELECT 1 FROM customer_labels cl2 WHERE cl2.customer_id = o.customer_id AND cl2.label = 'blacklist'),
		       o.is_urgent,
		       EXISTS (SELECT 1 FROM order_shipment_group_members gm2 WHERE gm2.order_id = o.id),
		       COALESCE(o.shipping_address,''), pc.chain_type,
		       ((pc.chain_type IN ('cvs_711','cvs_familymart') AND COALESCE(o.pickup_store_code,'') <> ''
		        AND EXISTS (SELECT 1 FROM cvs_stores cs0 WHERE cs0.chain_type = pc.chain_type)
		        AND NOT EXISTS (SELECT 1 FROM cvs_stores cs WHERE cs.chain_type = pc.chain_type AND cs.store_code = o.pickup_store_code))
		        OR NOT o.pickup_store_verified),
		       o.source`
	const joinRest = `
		JOIN pickup_chains pc ON pc.id = o.pickup_chain_id
		LEFT JOIN LATERAL (
		    SELECT SUM(i.qty * i.price_at_order) AS subtotal, SUM(i.qty) AS qty
		    FROM order_items i WHERE i.order_id = o.id
		) oi ON true`

	var query string
	if strings.HasPrefix(orderBy, "total_amount") {
		// Sorting by the computed total has to compute it for every matching order first.
		query = selectCols + `
		FROM orders o
		JOIN customers c ON c.id = o.customer_id` + joinRest + baseWhere +
			" ORDER BY " + orderBy + " LIMIT " + limitPlaceholder + " OFFSET " + offsetPlaceholder
	} else {
		// Sorting by date: pick the page's ids first (an index scan that stops after offset + size rows),
		// and only then build the rows - so a deep page does not aggregate the thousands of orders
		// before it.
		pageFrom := "FROM orders o"
		if q.Get("q") != "" {
			pageFrom = "FROM orders o JOIN customers c ON c.id = o.customer_id"
		}
		query = "WITH page AS (SELECT o.id " + pageFrom + baseWhere +
			" ORDER BY " + orderBy + " LIMIT " + limitPlaceholder + " OFFSET " + offsetPlaceholder + ")" +
			selectCols + `
		FROM page
		JOIN orders o ON o.id = page.id
		JOIN customers c ON c.id = o.customer_id` + joinRest +
			" ORDER BY " + orderBy
	}

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
			&o.PickupStoreName, &o.PickupStoreCode, &createdAt, &o.Total, &o.TotalQty, &o.CustomerBlocked, &o.IsUrgent, &o.IsMerged,
			&o.ShippingAddress, &o.PickupChainType, &o.StoreUnverified, &o.Source); err != nil {
			continue
		}
		o.CreatedAt = createdAt.Format(time.RFC3339)
		list = append(list, o)
	}
	respondJSON(w, http.StatusOK, pageResponse(list, total, pg))
}

type orderItemView struct {
	ID              int     `json:"id"`
	VariantID       int     `json:"variant_id"`
	ProductName     string  `json:"product_name"`
	ImageURL        string  `json:"image_url"`
	Color           string  `json:"color"`
	Size            string  `json:"size"`
	SKU             string  `json:"sku"`
	ProductSKU      string  `json:"product_sku"` // the parent/master product code (products.sku) - distinct from the per-variant SKU above; staff only use this one, e.g. for Copy Order Information
	Qty             int     `json:"qty"`
	PickedQty       int     `json:"picked_qty"`
	Price           float64 `json:"price"`
	HostID          *int    `json:"host_id"`
	HostName        string  `json:"host_name"`
	AvailableToPick int     `json:"available_to_pick"` // Available = Actual + Incoming - Ordered (can be negative = oversold)
	PhysicalStock   int     `json:"physical_stock"`    // Actual stock (stock_buckets.available_stock), for staff reference
	IsOversell      bool    `json:"is_oversell"`
}

// groupItemView is an orderItemView plus the source order's number, used only for the combined
// cross-order item list shown when an order is part of a shipment group (see Detail).
type groupItemView struct {
	orderItemView
	OrderNo string `json:"order_no"`
}

type orderDetailView struct {
	ID      int    `json:"id"`
	OrderNo string `json:"order_no"`
	Status  string `json:"status"`
	// Locked: exported to a logistics provider -> details frozen, only warehouse/super_user move status.
	Locked bool `json:"locked"`
	// StatusLocked: exported to the shipping platform (Processing onwards) - from here only
	// warehouse/super_user may change the status. Unlike Locked it is false for an order that is
	// merely in a batch (details frozen, but CS can still cancel it while it is New).
	StatusLocked    bool   `json:"status_locked"`
	PlatformOrderNo string `json:"platform_order_no"`
	TrackingNumber  string `json:"tracking_number"`
	// ReturnReceived: the warehouse already booked the returned goods back into stock.
	ReturnReceived           bool              `json:"return_received"`
	CustomerName             string            `json:"customer_name"`
	CustomerPhone            string            `json:"customer_phone"`
	CustomerEmail            string            `json:"customer_email"`
	CustomerBlocked          bool              `json:"customer_blacklisted"`
	ShippingAddress          string            `json:"shipping_address"`
	PickupChainID            int               `json:"pickup_chain_id"`
	PickupChainName          string            `json:"pickup_chain_name"`
	PickupStoreName          string            `json:"pickup_store_name"`
	PickupStoreCode          string            `json:"pickup_store_code"`
	Items                    []orderItemView   `json:"items"`
	Subtotal                 float64           `json:"subtotal"`
	DiscountAmount           float64           `json:"discount_amount"`
	PromotionCode            *string           `json:"promotion_code"`
	PromotionDiscountAmount  float64           `json:"promotion_discount_amount"`
	AdditionalAmount         float64           `json:"additional_amount"`
	Total                    float64           `json:"total"`
	InternalNotes            string            `json:"internal_notes"`
	IsUrgent                 bool              `json:"is_urgent"`
	NotesDeadline            *string           `json:"notes_deadline"`
	Attachments              []orderAttachment `json:"attachments"`
	CreatedBy                string            `json:"created_by"`
	CreatedAt                string            `json:"created_at"`
	KeepDate                 *string           `json:"keep_date"`
	KeepDateType             string            `json:"keep_date_type"`
	ShipDate                 *string           `json:"ship_date"`
	ExportFrom               *string           `json:"export_from"`
	ShippingFee              float64           `json:"shipping_fee"`
	FreeShippingOverride     bool              `json:"free_shipping_override"`
	ShipmentGroupID          *int              `json:"shipment_group_id"`
	ShipmentGroupOrders      []string          `json:"shipment_group_order_nos"`
	ShipmentGroupItems       []groupItemView   `json:"shipment_group_items,omitempty"`
	ShipmentGroupTotal       float64           `json:"shipment_group_total"`
	ShipmentGroupShippingFee float64           `json:"shipment_group_shipping_fee"`
	StatusHistory            []statusLogView   `json:"status_history"`
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
		SELECT o.id, o.order_no, o.status, c.name, c.phone, COALESCE(o.customer_email, c.email, ''),
		       EXISTS(SELECT 1 FROM customer_labels cl WHERE cl.customer_id = c.id AND cl.label = 'blacklist'),
		       o.shipping_address, pc.id, pc.name,
		       COALESCE(o.pickup_store_name,''), COALESCE(o.pickup_store_code,''), o.discount_amount, o.additional_amount,
		       COALESCE(o.internal_notes,''), o.is_urgent, o.notes_deadline, COALESCE(u.name,'system'), o.created_at, o.keep_date, o.keep_date_type,
		       o.shipping_fee, o.free_shipping_override, pm.code, o.promotion_discount_amount
		FROM orders o
		JOIN customers c ON c.id=o.customer_id
		JOIN pickup_chains pc ON pc.id = o.pickup_chain_id
		LEFT JOIN users u ON u.id = o.sales_id
		LEFT JOIN promotions pm ON pm.id = o.promotion_id
		WHERE o.id=$1`, id).
		Scan(&o.ID, &o.OrderNo, &o.Status, &o.CustomerName, &o.CustomerPhone, &o.CustomerEmail, &o.CustomerBlocked,
			&o.ShippingAddress, &o.PickupChainID, &o.PickupChainName,
			&o.PickupStoreName, &o.PickupStoreCode, &o.DiscountAmount, &o.AdditionalAmount,
			&o.InternalNotes, &o.IsUrgent, &notesDeadline, &o.CreatedBy, &createdAt, &keepDate, &o.KeepDateType,
			&o.ShippingFee, &o.FreeShippingOverride, &o.PromotionCode, &o.PromotionDiscountAmount)
	if err != nil {
		respondError(w, http.StatusNotFound, "order not found")
		return
	}
	o.CreatedAt = createdAt.Format(time.RFC3339)
	if keepDate != nil {
		v := keepDate.Format("2006-01-02")
		o.KeepDate = &v
		ship, exp := keepDates(*keepDate, o.KeepDateType)
		sv, ev := ship.Format("2006-01-02"), exp.Format("2006-01-02")
		o.ShipDate, o.ExportFrom = &sv, &ev
	}
	if notesDeadline != nil {
		v := notesDeadline.Format(time.RFC3339)
		o.NotesDeadline = &v
	}

	rows, err := h.DB.Query(ctx, `
		SELECT oi.id, oi.variant_id, `+productNameSQL(r, "p")+`,
		       COALESCE((SELECT pi.url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order LIMIT 1), ''),
		       pv.color, pv.size, pv.sku, COALESCE(p.sku,''), oi.qty, oi.picked_qty, oi.price_at_order, oi.host_id, COALESCE(h.name,'-'),
		       sb.available_stock + sb.incoming_stock - `+orderedForVariantSQL("pv.id")+`, sb.available_stock
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
			rows.Scan(&it.ID, &it.VariantID, &it.ProductName, &it.ImageURL, &it.Color, &it.Size, &it.SKU, &it.ProductSKU, &it.Qty, &it.PickedQty,
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
			SELECT oi.id, oi.variant_id, `+productNameSQL(r, "p")+`,
			       COALESCE((SELECT pi.url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order LIMIT 1), ''),
			       pv.color, pv.size, pv.sku, COALESCE(p.sku,''), oi.qty, oi.picked_qty, oi.price_at_order, oi.host_id, COALESCE(h2.name,'-'),
			       sb.available_stock + sb.incoming_stock - `+orderedForVariantSQL("pv.id")+`, sb.available_stock, o2.order_no
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
				itemRows.Scan(&it.ID, &it.VariantID, &it.ProductName, &it.ImageURL, &it.Color, &it.Size, &it.SKU, &it.ProductSKU, &it.Qty, &it.PickedQty,
					&it.Price, &it.HostID, &it.HostName, &it.AvailableToPick, &it.PhysicalStock, &it.OrderNo)
				it.IsOversell = it.AvailableToPick < 0
				o.ShipmentGroupTotal += it.Price * float64(it.Qty)
				o.ShipmentGroupItems = append(o.ShipmentGroupItems, it)
			}
		}

		var groupDiscount, groupPromotionDiscount, groupAdditional float64
		h.DB.QueryRow(ctx, `
			SELECT COALESCE(SUM(o2.discount_amount),0), COALESCE(SUM(o2.promotion_discount_amount),0), COALESCE(SUM(o2.additional_amount),0)
			FROM order_shipment_group_members m2
			JOIN orders o2 ON o2.id = m2.order_id
			WHERE m2.group_id = $1`, *groupID).Scan(&groupDiscount, &groupPromotionDiscount, &groupAdditional)
		o.ShipmentGroupTotal = o.ShipmentGroupTotal - groupDiscount - groupPromotionDiscount + groupAdditional + o.ShipmentGroupShippingFee
	}
	o.Total = o.Subtotal - o.DiscountAmount - o.PromotionDiscountAmount + o.AdditionalAmount + o.ShippingFee

	attRows, err := h.DB.Query(ctx, `SELECT id, url FROM order_attachments WHERE order_id=$1 ORDER BY created_at, id`, id)
	o.Attachments = []orderAttachment{}
	if err == nil {
		defer attRows.Close()
		for attRows.Next() {
			var a orderAttachment
			if attRows.Scan(&a.ID, &a.URL) == nil {
				o.Attachments = append(o.Attachments, a)
			}
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

	o.Locked = anyOrderLocked(ctx, h.DB, id)
	h.DB.QueryRow(ctx, `
		SELECT o.exported_at IS NOT NULL, COALESCE(o.platform_order_no,''), COALESCE(o.tracking_number,''),
		       EXISTS(SELECT 1 FROM stock_movements sm WHERE sm.order_id = o.id AND sm.event_type IN ('return_restocked','return_broken'))
		FROM orders o WHERE o.id=$1`, id).Scan(&o.StatusLocked, &o.PlatformOrderNo, &o.TrackingNumber, &o.ReturnReceived)
	respondJSON(w, http.StatusOK, o)
}

type createOrderCustomer struct {
	ID      *int   `json:"id"`
	Name    string `json:"name"`
	Phone   string `json:"phone"`
	Address string `json:"address"`
	Email   string `json:"email"` // e-invoice address, optional; saved on the customer and on this order
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
	PromotionCode        string              `json:"promotion_code"`
	AdditionalAmount     float64             `json:"additional_amount"`
	KeepDate             *string             `json:"keep_date"`
	KeepDateType         string              `json:"keep_date_type"`
	FreeShippingOverride bool                `json:"free_shipping_override"`
	ShippingFeeOverride  *float64            `json:"shipping_fee_override"`
	InternalNotes        string              `json:"internal_notes"`
	IsUrgent             bool                `json:"is_urgent"`
	NotesDeadline        *string             `json:"notes_deadline"`
	SalesChannel         string              `json:"sales_channel"` // "live" (default) | "website" - item 040-045
	AffiliateID          *int                `json:"affiliate_id"`  // website only, optional (nil = "Website - Created by CS")
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
	if req.SalesChannel == "" {
		req.SalesChannel = "live"
	}
	if req.SalesChannel != "live" && req.SalesChannel != "website" {
		respondError(w, http.StatusBadRequest, "sales_channel must be 'live' or 'website'")
		return
	}
	for _, it := range req.Items {
		if it.Qty <= 0 || it.VariantID == 0 {
			respondError(w, http.StatusBadRequest, "each item requires variant_id and a positive qty")
			return
		}
		if req.SalesChannel == "live" && it.HostID == 0 {
			respondError(w, http.StatusBadRequest, "each item requires host_id for a LIVE order")
			return
		}
	}
	if req.DiscountAmount < 0 || req.AdditionalAmount < 0 {
		respondError(w, http.StatusBadRequest, "discount_amount and additional_amount cannot be negative")
		return
	}

	req.Customer.Email = strings.TrimSpace(req.Customer.Email)
	if req.Customer.Email != "" && !validInvoiceEmail(req.Customer.Email) {
		respondError(w, http.StatusBadRequest, "invalid customer email")
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

	// #141: a staff / LIVE order may not push a variant past its oversell limit.
	if msg, err := checkOversellLimitsTx(ctx, tx, req.Items); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to check stock")
		return
	} else if msg != "" {
		respondError(w, http.StatusConflict, msg)
		return
	}

	customerID := req.Customer.ID
	exportName := req.Customer.Name
	if customerID != nil {
		_ = tx.QueryRow(ctx, `SELECT name FROM customers WHERE id=$1`, *customerID).Scan(&exportName)
	}
	if msg := validateExportFields(ctx, tx, req.PickupChainID, exportName, req.ShippingAddress); msg != "" {
		respondError(w, http.StatusBadRequest, msg)
		return
	}
	if customerID == nil {
		if req.Customer.Name == "" || req.Customer.Phone == "" {
			respondError(w, http.StatusBadRequest, "customer name and phone are required for a new customer")
			return
		}
		var newID int
		if err := tx.QueryRow(ctx, `
			INSERT INTO customers (name, phone, address, email) VALUES ($1,$2,$3,NULLIF($4,'')) RETURNING id`,
			req.Customer.Name, req.Customer.Phone, req.Customer.Address, req.Customer.Email).Scan(&newID); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to create customer")
			return
		}
		customerID = &newID
	}
	// The invoice email: what staff typed, else the one saved on the customer (the form pre-fills it). A typed one is remembered.
	invoiceEmail := req.Customer.Email
	if invoiceEmail != "" {
		_, _ = tx.Exec(ctx, `UPDATE customers SET email=$2 WHERE id=$1`, *customerID, invoiceEmail)
	} else {
		_ = tx.QueryRow(ctx, `SELECT COALESCE(email,'') FROM customers WHERE id=$1`, *customerID).Scan(&invoiceEmail)
	}
	// The e-invoice provider does not need an email, so it is optional. A typed one was validated above;
	// a saved one that no longer passes the check is simply not used.
	if invoiceEmail != "" && !validInvoiceEmail(invoiceEmail) {
		invoiceEmail = ""
	}

	// Website - Created by CS: a staff-keyed Website order with no Affiliate. (An Affiliate order
	// belongs to that affiliate only, so website_source stays NULL; LIVE orders never have one.)
	var websiteSource interface{}
	keepType, kerr := normalizeKeep(req.KeepDate, req.KeepDateType)
	if kerr != "" {
		respondError(w, http.StatusBadRequest, kerr)
		return
	}
	req.KeepDateType = keepType
	if req.SalesChannel == "website" && req.AffiliateID == nil {
		websiteSource = "cs"
	}
	orderNo := fmt.Sprintf("ORD-%d-%04d", time.Now().Unix(), rand.Intn(9999))
	var orderID int
	if err := tx.QueryRow(ctx, `
		INSERT INTO orders (order_no, customer_id, sales_id, status, shipping_address, pickup_chain_id, pickup_store_name, pickup_store_code, discount_amount, additional_amount, keep_date, keep_date_type, internal_notes, is_urgent, notes_deadline, sales_channel, affiliate_id, website_source, customer_email)
		VALUES ($1,$2,$3,'pending',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NULLIF($18,'')) RETURNING id`,
		orderNo, *customerID, claims.UserID, req.ShippingAddress, req.PickupChainID, req.PickupStoreName, req.PickupStoreCode,
		req.DiscountAmount, req.AdditionalAmount, req.KeepDate, req.KeepDateType, req.InternalNotes, req.IsUrgent, req.NotesDeadline,
		req.SalesChannel, req.AffiliateID, websiteSource, nullStr(invoiceEmail)).Scan(&orderID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create order")
		return
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO order_status_log (order_id, status_from, status_to, changed_by)
		VALUES ($1, NULL, 'pending', $2)`, orderID, claims.UserID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to log order status")
		return
	}

	// Order creation never validates or touches stock: it just raises "Ordered" (derived from the
	// orders). This deliberately allows an order to be created even with zero/insufficient stock on
	// hand - the Shipping Workbench only batches orders that physical stock can fully cover.
	var subtotal float64
	for _, it := range req.Items {
		var price float64
		if err := tx.QueryRow(ctx, `SELECT price FROM product_variants WHERE id=$1`, it.VariantID).Scan(&price); err != nil {
			respondError(w, http.StatusBadRequest, "variant not found")
			return
		}
		subtotal += price * float64(it.Qty)
		var hostID interface{}
		if it.HostID > 0 {
			hostID = it.HostID
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO order_items (order_id, variant_id, qty, price_at_order, host_id, live_session_id)
			VALUES ($1,$2,$3,$4,$5,$6)`, orderID, it.VariantID, it.Qty, price, hostID, it.LiveSessionID); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to create order item")
			return
		}
	}

	// A coupon code is resolved against the real, server-computed subtotal (never a client-sent
	// value) and locked (FOR UPDATE, see resolvePromotionByCode) inside this same transaction, so
	// two orders racing to redeem the last unit of a usage_limit-capped code can't both succeed.
	var promotionID *int
	var promotionDiscountAmount float64
	var promoFreeShipping bool
	if strings.TrimSpace(req.PromotionCode) != "" {
		result, errMsg := resolvePromotionByCode(ctx, tx, strings.ToUpper(strings.TrimSpace(req.PromotionCode)), customerID, subtotal, 0)
		if errMsg != "" {
			respondError(w, http.StatusBadRequest, errMsg)
			return
		}
		promotionID = &result.id
		promotionDiscountAmount = result.discountAmount
		promoFreeShipping = result.freeShipping
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
	if promoFreeShipping {
		// A free-shipping promotion always wins over any client-sent override, so a stale/forgotten
		// frontend value can never silently skip the discount the customer is entitled to.
		shippingFee = 0
		freeShippingOverride = true
	}
	// The shipping platforms reject an order above NT$20,000 (products + shipping fee), so such an
	// order must be fixed here, not discovered at export time. Same formula as the export rows.
	if subtotal-req.DiscountAmount+req.AdditionalAmount+shippingFee > exportTotalMax {
		respondError(w, http.StatusBadRequest, fmt.Sprintf("total pesanan melebihi batas platform pengiriman (maks. NT$%d)", exportTotalMax))
		return
	}
	if _, err := tx.Exec(ctx, `UPDATE orders SET shipping_fee=$1, free_shipping_override=$2, promotion_id=$3, promotion_discount_amount=$4 WHERE id=$5`,
		shippingFee, freeShippingOverride, promotionID, promotionDiscountAmount, orderID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save shipping fee")
		return
	}
	if promotionID != nil {
		if _, err := tx.Exec(ctx, `
			INSERT INTO promotion_redemptions (promotion_id, order_id, customer_id, discount_applied)
			VALUES ($1,$2,$3,$4)`, *promotionID, orderID, *customerID, promotionDiscountAmount); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to record promotion redemption")
			return
		}
	}

	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "db commit failed")
		return
	}

	invalidateOrderCaches()
	if h.OnOrderCreated != nil {
		h.OnOrderCreated()
	}
	respondJSON(w, http.StatusCreated, map[string]interface{}{
		"order_id": orderID, "order_no": orderNo, "status": "pending",
	})
}

type updateStatusRequest struct {
	Status string `json:"status"`
	Reason string `json:"reason"`
	// ConfirmStopped must be true to cancel an order that is already Processing / Ready to Ship:
	// the caller confirms the external shipping order (platform / 3PL) has been stopped.
	ConfirmStopped bool `json:"confirm_stopped"`
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

// checkStatusChange applies the manual status-change rules: it returns an HTTP status and message
// when the change is refused, or ("", 0 value) msg=="" when it is allowed.
func checkStatusChange(role, current, target, reason string, exported, confirmStopped bool) (int, string) {
	// Exported orders are locked: only warehouse and super_user may still move the status.
	if exported && !canChangeLockedStatus(role) {
		return http.StatusForbidden, "order sudah di-export (Processing): hanya Warehouse dan Super Admin yang boleh mengubah status"
	}
	valid := false
	for _, s := range validTransitions[current] {
		if s == target {
			valid = true
			break
		}
	}
	if !valid {
		return http.StatusBadRequest, "transisi status tidak valid: " + current + " -> " + target
	}
	if (target == "cancelled" || target == "return") && reason == "" {
		return http.StatusBadRequest, "reason is required for cancelled/return"
	}
	if manualShipTargets[target] && !canChangeLockedStatus(role) {
		return http.StatusForbidden, "status Shipped/Completed diperbarui lewat Shipping Workbench; hanya Warehouse dan Super Admin yang boleh mengubahnya manual"
	}
	// Once an order is in the external shipping workflow, only warehouse/super_user may cancel it,
	// after confirming the shipment can still be stopped.
	if target == "cancelled" && (current == "processing" || current == "ready_to_ship") {
		if !canChangeLockedStatus(role) {
			return http.StatusForbidden, "order sudah masuk proses pengiriman: hanya Warehouse dan Super Admin yang boleh membatalkan"
		}
		if !confirmStopped {
			return http.StatusBadRequest, "confirm that the external shipment has been stopped before cancelling (confirm_stopped)"
		}
	}
	return 0, ""
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
	var exported bool
	if err := tx.QueryRow(ctx, `SELECT status, exported_at IS NOT NULL FROM orders WHERE id=$1 FOR UPDATE`, id).
		Scan(&currentStatus, &exported); err != nil {
		respondError(w, http.StatusNotFound, "order not found")
		return
	}
	if status, msg := checkStatusChange(claims.Role, currentStatus, req.Status, req.Reason, exported, req.ConfirmStopped); msg != "" {
		respondError(w, status, msg)
		return
	}

	// "shipped" stays a hard, non-overridable block when a mergeable sibling order exists: it's
	// the last-resort safety net right before an irreversible shipment.
	if req.Status == "shipped" {
		siblingOrderNos, sibErr := h.findMergeableSiblings(ctx, tx, id)
		if sibErr == nil && len(siblingOrderNos) > 0 {
			respondError(w, http.StatusConflict, "pelanggan ini punya order lain yang bisa digabung sebelum dikirim: "+strings.Join(siblingOrderNos, ", "))
			return
		}
	}

	if err := applyStatusChange(ctx, tx, id, currentStatus, req.Status, &claims.UserID, req.Reason); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to update order status")
		return
	}

	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "db commit failed")
		return
	}

	invalidateOrderCaches()
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
	if rejectIfLocked(w, r.Context(), h.DB, id) {
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
	if rejectIfLocked(w, r.Context(), h.DB, id) {
		return
	}
	ctx := r.Context()
	finalAddress, badRequest := resolvePickupAddress(ctx, h.DB, req.PickupChainID, req.PickupStoreCode, req.PickupStoreName, req.ShippingAddress)
	if badRequest != "" {
		respondError(w, http.StatusBadRequest, badRequest)
		return
	}

	// Current state: needed to decide what happens to the shipping fee. The fee only changes when the
	// pickup chain changes (recomputed from the chain / free-shipping threshold, like Create Order) or
	// when staff typed a fee on purpose (shipping_fee_override). Saving the same chain with another
	// store code never touches it, and an order merged into a shipment group keeps its fee (the group
	// fee holder carries it).
	var curChain int
	var curOverride, inGroup bool
	var subtotal float64
	var curStatus string
	if err := h.DB.QueryRow(ctx, `
		SELECT o.status, o.pickup_chain_id, o.free_shipping_override,
		       EXISTS (SELECT 1 FROM order_shipment_group_members gm WHERE gm.order_id = o.id),
		       COALESCE((SELECT SUM(oi.price_at_order * oi.qty) FROM order_items oi WHERE oi.order_id = o.id), 0)
		FROM orders o WHERE o.id=$1`, id).Scan(&curStatus, &curChain, &curOverride, &inGroup, &subtotal); err != nil {
		respondError(w, http.StatusNotFound, "order not found")
		return
	}
	// Method / address / store can only change before picking starts; once the order is in the
	// shipping process the parcel data is already in use by the warehouse.
	if curStatus != "pending" {
		respondError(w, http.StatusConflict, "metode penerimaan hanya bisa diubah sebelum order masuk Processing (status saat ini: "+curStatus+")")
		return
	}
	if msg := validateExportFields(ctx, h.DB, req.PickupChainID, "", finalAddress); msg != "" {
		respondError(w, http.StatusBadRequest, msg)
		return
	}

	var ct pgconn.CommandTag
	switch {
	case req.ShippingFeeOverride != nil:
		// Free-by-hand only when staff entered 0 although the rules would charge something; entering
		// the amount the rules already give (or the threshold already waives) is not a manual waiver.
		def, derr := ComputeShippingFee(ctx, h.DB, req.PickupChainID, subtotal, false)
		if derr != nil {
			respondError(w, http.StatusInternalServerError, "failed to compute shipping fee")
			return
		}
		freeShippingOverride := *req.ShippingFeeOverride == 0 && def > 0
		ct, err = h.DB.Exec(ctx, `
			UPDATE orders SET pickup_chain_id=$1, pickup_store_name=$2, pickup_store_code=$3, shipping_address=$4,
			       shipping_fee=$5, free_shipping_override=$6
			WHERE id=$7`,
			req.PickupChainID, req.PickupStoreName, req.PickupStoreCode, finalAddress,
			*req.ShippingFeeOverride, freeShippingOverride, id)
	case req.PickupChainID != curChain && !inGroup:
		fee, ferr := ComputeShippingFee(ctx, h.DB, req.PickupChainID, subtotal, curOverride)
		if ferr != nil {
			respondError(w, http.StatusInternalServerError, "failed to compute shipping fee")
			return
		}
		ct, err = h.DB.Exec(ctx, `
			UPDATE orders SET pickup_chain_id=$1, pickup_store_name=$2, pickup_store_code=$3, shipping_address=$4, shipping_fee=$5
			WHERE id=$6`,
			req.PickupChainID, req.PickupStoreName, req.PickupStoreCode, finalAddress, fee, id)
	default:
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
	KeepDate     *string `json:"keep_date"`
	KeepDateType string  `json:"keep_date_type"`
}

// normalizeKeep validates the optional keep date (YYYY-MM-DD) and its mode; an empty mode means
// the original "shipping date" workflow. Returns the mode to store or a client-facing error.
func normalizeKeep(date *string, keepType string) (string, string) {
	if keepType == "" {
		keepType = keepTypeShipping
	}
	if !validKeepType(keepType) {
		return "", "keep_date_type must be shipping or delivery"
	}
	if date != nil && *date != "" {
		if _, err := time.Parse("2006-01-02", *date); err != nil {
			return "", "keep_date must be YYYY-MM-DD"
		}
	}
	return keepType, ""
}

// UpdateKeepDate sets or clears the order's Keep date (nullable - clearing it makes the order
// eligible for batching again).
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
	keepType, kerr := normalizeKeep(req.KeepDate, req.KeepDateType)
	if kerr != "" {
		respondError(w, http.StatusBadRequest, kerr)
		return
	}
	if req.KeepDate != nil && *req.KeepDate == "" {
		req.KeepDate = nil
	}
	if rejectIfLocked(w, r.Context(), h.DB, id) {
		return
	}
	ct, err := h.DB.Exec(r.Context(), `UPDATE orders SET keep_date=$1, keep_date_type=$2 WHERE id=$3`, req.KeepDate, keepType, id)
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

type orderAttachment struct {
	ID  int    `json:"id"`
	URL string `json:"url"`
}

// DeleteAttachment removes one attachment from the order (#137), under the same lock rule as
// adding one. The uploaded file itself stays on disk.
func (h *OrderHandler) DeleteAttachment(w http.ResponseWriter, r *http.Request) {
	id, err1 := strconv.Atoi(chi.URLParam(r, "id"))
	attID, err2 := strconv.Atoi(chi.URLParam(r, "attachmentId"))
	if err1 != nil || err2 != nil {
		respondError(w, http.StatusBadRequest, "invalid id")
		return
	}
	if rejectIfLocked(w, r.Context(), h.DB, id) {
		return
	}
	ct, err := h.DB.Exec(r.Context(), `DELETE FROM order_attachments WHERE id=$1 AND order_id=$2`, attID, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to delete attachment")
		return
	}
	if ct.RowsAffected() == 0 {
		respondError(w, http.StatusNotFound, "attachment not found")
		return
	}
	if c := getClaimsSafe(r); c != nil {
		logActivity(r.Context(), h.DB, "order", id, "attachment_deleted", &c.UserID, "")
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
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
	if rejectIfLocked(w, r.Context(), h.DB, id) {
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
	if rejectIfLocked(w, r.Context(), h.DB, id) {
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
	var shippingAddress, pickupStoreName, pickupStoreCode, salesChannel, internalNotes string
	var websiteSource *string
	var affiliateID *int
	var keepDate, notesDeadline interface{}
	var keepDateType string
	var isUrgent bool
	if err := tx.QueryRow(ctx, `
		SELECT customer_id, COALESCE(sales_id,0), pickup_chain_id, shipping_address,
		       COALESCE(pickup_store_name,''), COALESCE(pickup_store_code,''),
		       sales_channel, website_source, affiliate_id, keep_date, keep_date_type, is_urgent, notes_deadline,
		       COALESCE(internal_notes,'')
		FROM orders WHERE id=$1 FOR UPDATE`, id).
		Scan(&customerID, &salesID, &pickupChainID, &shippingAddress, &pickupStoreName, &pickupStoreCode,
			&salesChannel, &websiteSource, &affiliateID, &keepDate, &keepDateType, &isUrgent, &notesDeadline, &internalNotes); err != nil {
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
		INSERT INTO orders (order_no, customer_id, sales_id, status, shipping_address, pickup_chain_id, pickup_store_name, pickup_store_code, parent_order_id,
		                    sales_channel, website_source, affiliate_id, keep_date, keep_date_type, is_urgent, notes_deadline, internal_notes)
		VALUES ($1,$2,$3,(SELECT status FROM orders WHERE id=$4),$5,$6,$7,$8,$4,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
		newOrderNo, customerID, salesID, id, shippingAddress, pickupChainID, pickupStoreName, pickupStoreCode,
		salesChannel, websiteSource, affiliateID, keepDate, keepDateType, isUrgent, notesDeadline, internalNotes).Scan(&newOrderID); err != nil {
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

// StatusCounts handles GET /orders/status-counts: the number of orders per status inside the date
// range, for the tab badges of the Orders page. It is the only part of the old dashboard summary the
// page used, as one grouped count that sorting and paging never need to repeat.
func (h *OrderHandler) StatusCounts(w http.ResponseWriter, r *http.Request) {
	from, to, filtered := dateRange(r)
	query := `SELECT status, COUNT(*) FROM orders o`
	var args []interface{}
	if filtered {
		query += ` WHERE o.created_at >= $1 AND o.created_at < $2`
		args = append(args, from, to)
	}
	query += ` GROUP BY status`
	rows, err := h.DB.Query(r.Context(), query, args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to count orders")
		return
	}
	defer rows.Close()
	counts := map[string]int{}
	for rows.Next() {
		var s string
		var c int
		if rows.Scan(&s, &c) == nil {
			counts[s] = c
		}
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"order_status_counts": counts})
}

// Same rule as the website checkout (storefront Checkout.jsx).
var invoiceEmailRe = regexp.MustCompile(`^\S+@\S+\.\S+$`)

// validInvoiceEmail: a plain address of at most 150 characters (the e-invoice goes there).
func validInvoiceEmail(v string) bool {
	return len(v) <= 150 && invoiceEmailRe.MatchString(v)
}
