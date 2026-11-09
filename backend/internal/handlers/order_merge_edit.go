package handlers

import (
	"context"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	appmw "ordermgmt/internal/middleware"
)

// The merged shipment is the place where a merged order is managed (Order Management). Every item still belongs
// to ONE original order (order_items.order_id / host_id, the order's date), so an edit made here is written to the
// original orders line by line: sales date, Host and attribution never move and nothing is counted twice. The
// delivery data (customer, store, address) is shared by the whole group and applied to every member; cancellation
// stays per original order (UpdateStatus is untouched).

type groupMemberView struct {
	ID               int     `json:"id"`
	OrderNo          string  `json:"order_no"`
	Status           string  `json:"status"`
	CreatedAt        string  `json:"created_at"`
	Locked           bool    `json:"locked"`
	IsFeeHolder      bool    `json:"is_fee_holder"`
	Channel          string  `json:"sales_channel"`
	DiscountAmount   float64 `json:"discount_amount"`
	AdditionalAmount float64 `json:"additional_amount"`
	PromotionAmount  float64 `json:"promotion_discount_amount"`
	Subtotal         float64 `json:"subtotal"`
}

type groupItemEditView struct {
	orderItemView
	OrderID int    `json:"order_id"`
	OrderNo string `json:"order_no"`
}

type mergeGroupView struct {
	ID              int                 `json:"id"`
	Members         []groupMemberView   `json:"members"`
	Items           []groupItemEditView `json:"items"`
	CustomerName    string              `json:"customer_name"`
	CustomerPhone   string              `json:"customer_phone"`
	CustomerEmail   string              `json:"customer_email"`
	PickupChainID   int                 `json:"pickup_chain_id"`
	PickupChainName string              `json:"pickup_chain_name"`
	ChainType       string              `json:"chain_type"`
	PickupStoreName string              `json:"pickup_store_name"`
	PickupStoreCode string              `json:"pickup_store_code"`
	ShippingAddress string              `json:"shipping_address"`
	ShippingFee     float64             `json:"shipping_fee"`
	Subtotal        float64             `json:"subtotal"`
	Total           float64             `json:"total"`
	Locked          bool                `json:"locked"`
}

// GetGroup returns everything the group editor shows: members, every item with its original order, the shared delivery data.
func (h *OrderMergeHandler) GetGroup(w http.ResponseWriter, r *http.Request) {
	gid, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid group id")
		return
	}
	ctx := r.Context()
	var g mergeGroupView
	g.ID = gid
	var feeOrderID int
	if err := h.DB.QueryRow(ctx, `SELECT shipping_fee_order_id FROM order_shipment_groups WHERE id=$1`, gid).Scan(&feeOrderID); err != nil {
		respondError(w, http.StatusNotFound, "shipment group not found")
		return
	}
	rows, err := h.DB.Query(ctx, `
		SELECT o.id, o.order_no, o.status, o.created_at::text, o.exported_at IS NOT NULL, o.sales_channel,
		       o.discount_amount, o.additional_amount, o.promotion_discount_amount,
		       COALESCE((SELECT SUM(i.qty*i.price_at_order) FROM order_items i WHERE i.order_id=o.id),0)
		FROM order_shipment_group_members m JOIN orders o ON o.id = m.order_id
		WHERE m.group_id=$1 ORDER BY o.created_at, o.id`, gid)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	for rows.Next() {
		var m groupMemberView
		if rows.Scan(&m.ID, &m.OrderNo, &m.Status, &m.CreatedAt, &m.Locked, &m.Channel, &m.DiscountAmount, &m.AdditionalAmount, &m.PromotionAmount, &m.Subtotal) == nil {
			m.IsFeeHolder = m.ID == feeOrderID
			g.Members = append(g.Members, m)
			g.Subtotal += m.Subtotal
			g.Total += m.Subtotal - m.DiscountAmount - m.PromotionAmount + m.AdditionalAmount
			g.Locked = g.Locked || m.Locked
		}
	}
	rows.Close()
	if len(g.Members) == 0 {
		respondError(w, http.StatusNotFound, "shipment group not found")
		return
	}
	// shared delivery data: read from the fee holder (all members carry the same)
	if err := h.DB.QueryRow(ctx, `
		SELECT c.name, c.phone, COALESCE(o.customer_email, c.email, ''), o.pickup_chain_id, pc.name, pc.chain_type,
		       COALESCE(o.pickup_store_name,''), COALESCE(o.pickup_store_code,''), COALESCE(o.shipping_address,''), o.shipping_fee
		FROM orders o JOIN customers c ON c.id = o.customer_id JOIN pickup_chains pc ON pc.id = o.pickup_chain_id
		WHERE o.id=$1`, feeOrderID).Scan(&g.CustomerName, &g.CustomerPhone, &g.CustomerEmail, &g.PickupChainID, &g.PickupChainName, &g.ChainType,
		&g.PickupStoreName, &g.PickupStoreCode, &g.ShippingAddress, &g.ShippingFee); err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	g.Total += g.ShippingFee

	irows, err := h.DB.Query(ctx, `
		SELECT oi.id, oi.variant_id, `+productNameSQL(r, "p")+`,
		       COALESCE((SELECT pi.url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order LIMIT 1), ''),
		       pv.color, pv.size, pv.sku, COALESCE(p.sku,''), oi.qty, oi.picked_qty, oi.price_at_order, oi.host_id, COALESCE(h2.name,'-'),
		       sb.available_stock + sb.incoming_stock - `+orderedForVariantSQL("pv.id")+`, sb.available_stock, o2.id, o2.order_no
		FROM order_shipment_group_members m2
		JOIN orders o2 ON o2.id = m2.order_id
		JOIN order_items oi ON oi.order_id = o2.id
		JOIN product_variants pv ON pv.id = oi.variant_id
		JOIN products p ON p.id = pv.product_id
		JOIN stock_buckets sb ON sb.variant_id = pv.id
		LEFT JOIN hosts h2 ON h2.id = oi.host_id
		WHERE m2.group_id = $1
		ORDER BY o2.created_at, o2.id, oi.id`, gid)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer irows.Close()
	g.Items = []groupItemEditView{}
	for irows.Next() {
		var it groupItemEditView
		if irows.Scan(&it.ID, &it.VariantID, &it.ProductName, &it.ImageURL, &it.Color, &it.Size, &it.SKU, &it.ProductSKU, &it.Qty, &it.PickedQty,
			&it.Price, &it.HostID, &it.HostName, &it.AvailableToPick, &it.PhysicalStock, &it.OrderID, &it.OrderNo) == nil {
			it.IsOversell = it.AvailableToPick < 0
			g.Items = append(g.Items, it)
		}
	}
	respondJSON(w, http.StatusOK, g)
}

type groupEditItem struct {
	editOrderItem
	OrderID int `json:"order_id"` // new line: the original order it joins (its sales date / Host); existing lines keep their order
}

type groupEditMember struct {
	OrderID          int     `json:"order_id"`
	DiscountAmount   float64 `json:"discount_amount"`
	AdditionalAmount float64 `json:"additional_amount"`
}

type groupEditRequest struct {
	Customer struct {
		Name  string `json:"name"`
		Phone string `json:"phone"`
		Email string `json:"email"`
	} `json:"customer"`
	ShippingAddress     string            `json:"shipping_address"`
	PickupStoreName     string            `json:"pickup_store_name"`
	PickupStoreCode     string            `json:"pickup_store_code"`
	Items               []groupEditItem   `json:"items"`
	Members             []groupEditMember `json:"members"` // optional: per-order discount / extra charge, otherwise unchanged
	ShippingFeeOverride *float64          `json:"shipping_fee_override"`
}

// UpdateGroup saves the group editor in one transaction: shared delivery data to every member, each item line to
// its original order, then the free-shipping waiver is re-evaluated on the combined subtotal.
func (h *OrderMergeHandler) UpdateGroup(w http.ResponseWriter, r *http.Request) {
	gid, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid group id")
		return
	}
	var req groupEditRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Customer.Name = strings.TrimSpace(req.Customer.Name)
	req.Customer.Phone = strings.TrimSpace(req.Customer.Phone)
	req.Customer.Email = strings.TrimSpace(req.Customer.Email)
	if req.Customer.Name == "" || req.Customer.Phone == "" {
		respondError(w, http.StatusBadRequest, "nama dan telepon pelanggan wajib diisi")
		return
	}
	if req.Customer.Email != "" && !validInvoiceEmail(req.Customer.Email) {
		respondError(w, http.StatusBadRequest, "invalid customer email")
		return
	}
	for _, it := range req.Items {
		if it.Qty <= 0 || it.VariantID == 0 || (it.Price != nil && *it.Price < 0) {
			respondError(w, http.StatusBadRequest, "each item requires variant_id and a positive qty")
			return
		}
	}
	claims := appmw.GetClaims(r)
	ctx := r.Context()
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(ctx)

	var feeOrderID int
	var origFee *float64
	if err := tx.QueryRow(ctx, `SELECT shipping_fee_order_id, original_shipping_fee FROM order_shipment_groups WHERE id=$1 FOR UPDATE`, gid).Scan(&feeOrderID, &origFee); err != nil {
		respondError(w, http.StatusNotFound, "shipment group not found")
		return
	}
	type member struct {
		id                   int
		chainID              int
		discount, additional float64
	}
	var members []member
	mrows, err := tx.Query(ctx, `SELECT o.id, o.pickup_chain_id, o.discount_amount, o.additional_amount
		FROM order_shipment_group_members m JOIN orders o ON o.id = m.order_id WHERE m.group_id=$1 ORDER BY o.created_at, o.id FOR UPDATE OF o`, gid)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	for mrows.Next() {
		var m member
		if mrows.Scan(&m.id, &m.chainID, &m.discount, &m.additional) == nil {
			members = append(members, m)
		}
	}
	mrows.Close()
	if len(members) == 0 {
		respondError(w, http.StatusNotFound, "shipment group not found")
		return
	}
	isMember := map[int]*member{}
	for i := range members {
		isMember[members[i].id] = &members[i]
	}
	for _, mm := range req.Members {
		m, ok := isMember[mm.OrderID]
		if !ok {
			respondError(w, http.StatusBadRequest, "order bukan anggota grup ini")
			return
		}
		if mm.DiscountAmount < 0 || mm.AdditionalAmount < 0 {
			respondError(w, http.StatusBadRequest, "discount_amount and additional_amount cannot be negative")
			return
		}
		m.discount, m.additional = mm.DiscountAmount, mm.AdditionalAmount
	}

	// which original order owns each existing line
	owner := map[int]int{}
	orows, err := tx.Query(ctx, `SELECT oi.id, oi.order_id FROM order_items oi JOIN order_shipment_group_members m ON m.order_id = oi.order_id WHERE m.group_id=$1`, gid)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	for orows.Next() {
		var iid, oid int
		if orows.Scan(&iid, &oid) == nil {
			owner[iid] = oid
		}
	}
	orows.Close()
	perOrder := map[int][]editOrderItem{}
	for _, it := range req.Items {
		oid := it.OrderID
		if it.ID != nil {
			o, ok := owner[*it.ID]
			if !ok {
				respondError(w, http.StatusBadRequest, "item does not belong to this group")
				return
			}
			oid = o
		}
		if _, ok := isMember[oid]; !ok {
			respondError(w, http.StatusBadRequest, "item baru harus dimasukkan ke salah satu order dalam grup")
			return
		}
		perOrder[oid] = append(perOrder[oid], it.editOrderItem)
	}

	// All members share the delivery method: changing the provider means unmerging first.
	chainID := members[0].chainID
	var curChain int
	_ = tx.QueryRow(ctx, `SELECT pickup_chain_id FROM orders WHERE id=$1`, feeOrderID).Scan(&curChain)
	if curChain != 0 {
		chainID = curChain
	}

	ids := make([]int, 0, len(members))
	for _, m := range members {
		ids = append(ids, m.id)
	}
	sort.Ints(ids)
	for _, m := range members {
		items := perOrder[m.id]
		if len(items) == 0 {
			respondError(w, http.StatusBadRequest, "setiap order dalam grup harus tetap punya minimal satu item (pisahkan penggabungan jika ingin mengosongkan salah satu)")
			return
		}
		er := editOrderRequest{
			ShippingAddress:  req.ShippingAddress,
			PickupChainID:    chainID,
			PickupStoreName:  req.PickupStoreName,
			PickupStoreCode:  req.PickupStoreCode,
			Items:            items,
			DiscountAmount:   m.discount,
			AdditionalAmount: m.additional,
		}
		er.Customer.Name, er.Customer.Phone, er.Customer.Email = req.Customer.Name, req.Customer.Phone, req.Customer.Email
		er.Customer.ApplyToAll = true
		if m.id == feeOrderID {
			er.ShippingFeeOverride = req.ShippingFeeOverride
		}
		if code, msg := editOrderTx(ctx, tx, claims.Role, claims.UserID, m.id, er, true); code != 0 {
			respondError(w, code, msg)
			return
		}
	}

	if req.ShippingFeeOverride == nil {
		if err := reevaluateGroupFreeShipping(ctx, tx, gid, feeOrderID, chainID, origFee); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to update shipping fee")
			return
		}
	}
	logActivity(ctx, tx, "shipment_group", gid, "edited", &claims.UserID, "")
	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "db commit failed")
		return
	}
	invalidateOrderCaches()
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// reevaluateGroupFreeShipping waives the fee holder's fee when the combined subtotal now clears the free-shipping
// threshold, and gives the original fee back when it no longer does (same rule and bookkeeping as CreateGroup).
func reevaluateGroupFreeShipping(ctx context.Context, tx pgx.Tx, gid, feeOrderID, chainID int, origFee *float64) error {
	var subtotal float64
	if err := tx.QueryRow(ctx, `SELECT COALESCE(SUM(oi.qty * oi.price_at_order),0) FROM order_items oi
		JOIN order_shipment_group_members m ON m.order_id = oi.order_id WHERE m.group_id=$1`, gid).Scan(&subtotal); err != nil {
		return err
	}
	var chainType string
	tx.QueryRow(ctx, `SELECT chain_type FROM pickup_chains WHERE id=$1`, chainID).Scan(&chainType)
	settings, err := loadShippingFeeSettings(ctx, tx)
	if err != nil {
		return nil
	}
	threshold := settings["free_shipping_threshold_minimarket"]
	if chainType == "courier" {
		threshold = settings["free_shipping_threshold_pos"]
	}
	if threshold <= 0 {
		return nil
	}
	var fee float64
	var override bool
	if err := tx.QueryRow(ctx, `SELECT shipping_fee, free_shipping_override FROM orders WHERE id=$1`, feeOrderID).Scan(&fee, &override); err != nil {
		return err
	}
	switch {
	case origFee == nil && fee > 0 && subtotal >= threshold:
		if _, err := tx.Exec(ctx, `UPDATE order_shipment_groups SET original_shipping_fee=$2, original_free_shipping_override=$3 WHERE id=$1`, gid, fee, override); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `UPDATE orders SET shipping_fee=0, free_shipping_override=true WHERE id=$1`, feeOrderID)
		return err
	case origFee != nil && subtotal < threshold:
		var origOverride *bool
		tx.QueryRow(ctx, `SELECT original_free_shipping_override FROM order_shipment_groups WHERE id=$1`, gid).Scan(&origOverride)
		if _, err := tx.Exec(ctx, `UPDATE orders SET shipping_fee=$2, free_shipping_override=$3 WHERE id=$1`, feeOrderID, *origFee, origOverride != nil && *origOverride); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `UPDATE order_shipment_groups SET original_shipping_fee=NULL, original_free_shipping_override=NULL WHERE id=$1`, gid)
		return err
	}
	return nil
}
