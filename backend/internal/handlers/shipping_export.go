package handlers

import (
	"context"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ShippingExportHandler builds the two carrier export layouts the client actually uses today:
// Format A ("Penerima/Alamat/COD/Status") for home delivery (chain_type='courier'), and
// Format B ("Pembeli/Toko/Nilai barang/Ongkir/Status") for minimarket pickup
// (chain_type='cvs_711'/'cvs_familymart'/'other'). Exact column names may still change (the
// client said the format may be adjusted later); the underlying data and the
// exported/tracking-number bookkeeping is the durable part.
type ShippingExportHandler struct {
	DB *pgxpool.Pool
}

type shippingExportLine struct {
	SKU   string  `json:"sku"`
	Name  string  `json:"name"`
	Qty   int     `json:"qty"`
	Price float64 `json:"price"`
}

type shippingExportRow struct {
	OrderID         int      `json:"order_id"`
	OrderIDs        []int    `json:"order_ids"`
	OrderNo         string   `json:"order_no"`
	GroupOrderNos   []string `json:"group_order_nos"`
	CustomerName    string   `json:"customer_name"`
	CustomerPhone   string   `json:"customer_phone"`
	ShippingAddress string   `json:"shipping_address"`
	PickupChainName string   `json:"pickup_chain_name"`
	ChainType       string   `json:"chain_type"`
	PickupStoreName string   `json:"pickup_store_name"`
	PickupStoreCode string   `json:"pickup_store_code"`
	IsHomeDelivery  bool     `json:"is_home_delivery"`
	ItemsSummary    string   `json:"items_summary"`
	// CategoriesZh: unique Chinese category names of the order's items, concatenated without
	// separators (7-ELEVEN "商品" column - product names can trip the carrier's keyword filter).
	CategoriesZh    string `json:"categories_zh"`
	PackingProducts string `json:"packing_products"`
	// Lines: one entry per product line of the shipment (merged orders combined) - the 3PL file has a row each.
	Lines                 []shippingExportLine `json:"lines"`
	TotalQty              int                  `json:"total_qty"`
	ItemValue             float64              `json:"item_value"`
	ShippingFee           float64              `json:"shipping_fee"`
	TotalToPay            float64              `json:"total_to_pay"`
	OrderDate             string               `json:"order_date"`
	InternalNotesCombined string               `json:"internal_notes_combined"`
	Status                string               `json:"status"`
	ExportedAt            *string              `json:"exported_at"`
	TrackingNumber        *string              `json:"tracking_number"`
	PlatformOrderNo       *string              `json:"platform_order_no"`
	// earliestCreated / latestCreated bound the creation time of the shipment's member orders
	// (server-side only: batch eligibility uses the Taiwan business date of the latest one).
	earliestCreated time.Time
	latestCreated   time.Time
}

// queryer is satisfied by both *pgxpool.Pool and pgx.Tx.
type queryer interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

// exportOrderRow is one raw order fetched for export, before shipment-group collapsing.
type exportOrderRow struct {
	ID              int
	OrderNo         string
	CustomerName    string
	CustomerPhone   string
	ShippingAddress string
	PickupChainName string
	ChainType       string
	PickupStoreName string
	PickupStoreCode string
	ItemValue       float64
	ShippingFee     float64
	Status          string
	ExportedAt      *time.Time
	TrackingNumber  *string
	PlatformOrderNo *string
	CreatedAt       time.Time
	InternalNotes   string
	GroupID         *int
	FeeOrderID      *int
}

// loadShipmentRows returns one row per PHYSICAL SHIPMENT matching the given WHERE clause (over
// orders o / pickup_chains pc): a merged shipment group collapses to a single row (combined
// items/value/qty, the shipping fee counted once) instead of one row per original order, since the
// carrier ships and collects COD as one package. The Shipping Workbench builds its batches from
// these rows.
func loadShipmentRows(r *http.Request, db queryer, where string, args ...any) ([]shippingExportRow, error) {
	ctx := r.Context()
	rows, err := db.Query(ctx, `
		SELECT o.id, o.order_no, c.name, c.phone, COALESCE(o.shipping_address,''), pc.name, pc.chain_type,
		       COALESCE(o.pickup_store_name,''), COALESCE(o.pickup_store_code,''),
		       COALESCE((SELECT SUM(oi.qty * oi.price_at_order) FROM order_items oi WHERE oi.order_id = o.id),0) - o.discount_amount + o.additional_amount,
		       o.shipping_fee, o.status, o.exported_at, o.tracking_number, o.platform_order_no, o.created_at,
		       COALESCE(o.internal_notes,''), gm.group_id, g.shipping_fee_order_id
		FROM orders o
		JOIN customers c ON c.id = o.customer_id
		JOIN pickup_chains pc ON pc.id = o.pickup_chain_id
		LEFT JOIN order_shipment_group_members gm ON gm.order_id = o.id
		LEFT JOIN order_shipment_groups g ON g.id = gm.group_id`+where+`
		ORDER BY o.created_at ASC`, args...)
	if err != nil {
		return nil, err
	}
	var orders []exportOrderRow
	for rows.Next() {
		var o exportOrderRow
		if err := rows.Scan(&o.ID, &o.OrderNo, &o.CustomerName, &o.CustomerPhone, &o.ShippingAddress,
			&o.PickupChainName, &o.ChainType, &o.PickupStoreName, &o.PickupStoreCode, &o.ItemValue, &o.ShippingFee,
			&o.Status, &o.ExportedAt, &o.TrackingNumber, &o.PlatformOrderNo, &o.CreatedAt, &o.InternalNotes, &o.GroupID, &o.FeeOrderID); err != nil {
			continue
		}
		orders = append(orders, o)
	}
	rows.Close()

	orderIDs := make([]int, len(orders))
	for i, o := range orders {
		orderIDs[i] = o.ID
	}
	itemsByOrder, packingByOrder, qtyByOrder, catsByOrder := fetchExportItemSummaries(r, db, orderIDs)
	linesByOrder := fetchExportLines(r, db, orderIDs)

	groups := map[string][]exportOrderRow{}
	var groupKeys []string
	for _, o := range orders {
		key := fmt.Sprintf("solo-%d", o.ID)
		if o.GroupID != nil {
			key = fmt.Sprintf("group-%d", *o.GroupID)
		}
		if _, ok := groups[key]; !ok {
			groupKeys = append(groupKeys, key)
		}
		groups[key] = append(groups[key], o)
	}

	list := []shippingExportRow{}
	for _, key := range groupKeys {
		members := groups[key]
		sort.Slice(members, func(i, j int) bool { return members[i].CreatedAt.Before(members[j].CreatedAt) })
		primary := members[0]

		row := shippingExportRow{
			OrderID:         primary.ID,
			OrderNo:         primary.OrderNo,
			CustomerName:    primary.CustomerName,
			CustomerPhone:   primary.CustomerPhone,
			ShippingAddress: primary.ShippingAddress,
			PickupChainName: primary.PickupChainName,
			ChainType:       primary.ChainType,
			PickupStoreName: primary.PickupStoreName,
			PickupStoreCode: primary.PickupStoreCode,
			Status:          primary.Status,
			TrackingNumber:  primary.TrackingNumber,
			PlatformOrderNo: primary.PlatformOrderNo,
			OrderDate:       primary.CreatedAt.In(taipeiTZ).Format("2006/1/2"),
		}
		row.IsHomeDelivery = row.ChainType == "courier"

		allExported := true
		var earliestExported *time.Time
		var itemFragments, packingFragments, notes, categories []string
		row.earliestCreated = members[0].CreatedAt
		for _, m := range members {
			if m.CreatedAt.After(row.latestCreated) {
				row.latestCreated = m.CreatedAt
			}
			row.OrderIDs = append(row.OrderIDs, m.ID)
			if m.ID != primary.ID {
				row.GroupOrderNos = append(row.GroupOrderNos, m.OrderNo)
			}
			row.ItemValue += m.ItemValue
			row.TotalQty += qtyByOrder[m.ID]
			row.Lines = append(row.Lines, linesByOrder[m.ID]...)
			if frag := itemsByOrder[m.ID]; frag != "" {
				itemFragments = append(itemFragments, frag)
			}
			if frag := packingByOrder[m.ID]; frag != "" {
				packingFragments = append(packingFragments, frag)
			}
			for _, c := range catsByOrder[m.ID] {
				if !containsString(categories, c) {
					categories = append(categories, c)
				}
			}
			if m.InternalNotes != "" {
				notes = append(notes, m.InternalNotes)
			}
			feeOrderID := primary.ID
			if m.FeeOrderID != nil {
				feeOrderID = *m.FeeOrderID
			}
			if m.ID == feeOrderID {
				row.ShippingFee = m.ShippingFee
			}
			if m.ExportedAt == nil {
				allExported = false
			} else if earliestExported == nil || m.ExportedAt.Before(*earliestExported) {
				earliestExported = m.ExportedAt
			}
		}
		row.ItemsSummary = strings.Join(itemFragments, ", ")
		row.CategoriesZh = strings.Join(categories, "")
		// Packing Label File requirement: one line per product per order, newline-joined so it
		// renders as a multi-line cell in the exported .xlsx (see ExportCvsModal.jsx).
		row.PackingProducts = strings.Join(packingFragments, "\n")
		row.InternalNotesCombined = strings.Join(notes, "; ")
		row.TotalToPay = row.ItemValue + row.ShippingFee
		if allExported && earliestExported != nil {
			v := earliestExported.Format(time.RFC3339)
			row.ExportedAt = &v
		}
		list = append(list, row)
	}

	sort.Slice(list, func(i, j int) bool { return list[i].OrderID > list[j].OrderID })
	return list, nil
}

// fetchExportItemSummaries builds, per order ID: a "ProductName*qty" text fragment (used
// verbatim in the real CVS carrier template - do not reformat) and a "SKU - Name（Color /
// Size） xQty" fragment for the Packing Label File, plus a total qty. All three are keyed by
// order ID; the caller joins fragments across a shipment group's member orders itself.
func fetchExportItemSummaries(r *http.Request, db queryer, orderIDs []int) (map[int]string, map[int]string, map[int]int, map[int][]string) {
	fragments := map[int][]string{}
	packingFragments := map[int][]string{}
	qty := map[int]int{}
	cats := map[int][]string{}
	if len(orderIDs) == 0 {
		return map[int]string{}, map[int]string{}, qty, cats
	}
	rows, err := db.Query(r.Context(), `
		SELECT oi.order_id, `+productNameSQL(r, "p")+`, oi.qty, COALESCE(p.sku,''), pv.color, pv.size,
		       COALESCE(NULLIF(cat.name_zh,''), p.category, '')
		FROM order_items oi
		JOIN product_variants pv ON pv.id = oi.variant_id
		JOIN products p ON p.id = pv.product_id
		LEFT JOIN categories cat ON cat.name = p.category
		WHERE oi.order_id = ANY($1)
		ORDER BY oi.order_id, oi.id`, orderIDs)
	if err != nil {
		return map[int]string{}, map[int]string{}, qty, cats
	}
	defer rows.Close()
	for rows.Next() {
		var orderID, itemQty int
		// productSKU is the parent/master product code (products.sku) - staff only use this
		// one, not each variant's own per-color/size sku, so that's what goes on the label.
		var name, productSKU, color, size, category string
		if err := rows.Scan(&orderID, &name, &itemQty, &productSKU, &color, &size, &category); err != nil {
			continue
		}
		if category != "" && !containsString(cats[orderID], category) {
			cats[orderID] = append(cats[orderID], category)
		}
		fragments[orderID] = append(fragments[orderID], fmt.Sprintf("%s*%d", name, itemQty))
		packingFragments[orderID] = append(packingFragments[orderID],
			fmt.Sprintf("%s - %s（%s / %s） x%d", productSKU, name, color, size, itemQty))
		qty[orderID] += itemQty
	}
	summary := map[int]string{}
	for orderID, frags := range fragments {
		summary[orderID] = strings.Join(frags, ", ")
	}
	packingSummary := map[int]string{}
	for orderID, frags := range packingFragments {
		packingSummary[orderID] = strings.Join(frags, "\n")
	}
	return summary, packingSummary, qty, cats
}

// fetchExportLines returns each order's product lines (variant SKU, localized name, qty, unit price).
func fetchExportLines(r *http.Request, db queryer, orderIDs []int) map[int][]shippingExportLine {
	out := map[int][]shippingExportLine{}
	if len(orderIDs) == 0 {
		return out
	}
	rows, err := db.Query(r.Context(), `
		SELECT oi.order_id, COALESCE(pv.sku,''), `+productNameSQL(r, "p")+`, pv.color, pv.size, oi.qty, oi.price_at_order
		FROM order_items oi
		JOIN product_variants pv ON pv.id = oi.variant_id
		JOIN products p ON p.id = pv.product_id
		WHERE oi.order_id = ANY($1)
		ORDER BY oi.order_id, oi.id`, orderIDs)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var orderID int
		var l shippingExportLine
		var color, size string
		if err := rows.Scan(&orderID, &l.SKU, &l.Name, &color, &size, &l.Qty, &l.Price); err != nil {
			continue
		}
		if color != "" || size != "" {
			l.Name = fmt.Sprintf("%s（%s / %s）", l.Name, color, size)
		}
		out[orderID] = append(out[orderID], l)
	}
	return out
}

func containsString(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}

type updateTrackingNumberRequest struct {
	TrackingNumber string `json:"tracking_number"`
}

// UpdateTrackingNumber sets the carrier-assigned tracking number once known.
func (h *ShippingExportHandler) UpdateTrackingNumber(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid order id")
		return
	}
	var req updateTrackingNumberRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	ct, err := h.DB.Exec(r.Context(), `UPDATE orders SET tracking_number=$1 WHERE id=$2`, req.TrackingNumber, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save tracking number")
		return
	}
	if ct.RowsAffected() == 0 {
		respondError(w, http.StatusNotFound, "order not found")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
