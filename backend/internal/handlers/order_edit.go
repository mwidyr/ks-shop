package handlers

import (
	"context"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	appmw "ordermgmt/internal/middleware"
)

// Full order edit (Order Management). An order can be edited as long as it has NOT been exported through
// the Shipping Workbench (orders.exported_at IS NULL) and is still New (pending): customer, delivery
// method / store / address, items, discount, extra charge and shipping fee. Once exported the order is
// locked (order_lock.go). Being in a batch does not lock it, but then the batch stays consistent: the
// provider (7-ELEVEN / FamilyMart / POS) cannot change and the stock allocated to the batch cannot go negative.

type editOrderItem struct {
	ID        *int     `json:"id"` // existing line; nil = new line
	VariantID int      `json:"variant_id"`
	Qty       int      `json:"qty"`
	HostID    int      `json:"host_id"`
	Price     *float64 `json:"price"` // nil: keep the line's price (new line: the variant's price)
}

type editOrderRequest struct {
	Customer struct {
		Name  string `json:"name"`
		Phone string `json:"phone"`
		Email string `json:"email"`
	} `json:"customer"`
	ShippingAddress     string          `json:"shipping_address"`
	PickupChainID       int             `json:"pickup_chain_id"`
	PickupStoreName     string          `json:"pickup_store_name"`
	PickupStoreCode     string          `json:"pickup_store_code"`
	Items               []editOrderItem `json:"items"`
	DiscountAmount      float64         `json:"discount_amount"`
	AdditionalAmount    float64         `json:"additional_amount"`
	ShippingFeeOverride *float64        `json:"shipping_fee_override"`
}

// batchProvider returns the provider (chain_type) of the batch the order belongs to, "" when it is in none.
func batchProvider(ctx context.Context, q rowQuerier, orderID int) string {
	var p string
	if err := q.QueryRow(ctx, `
		SELECT b.provider FROM shipping_batch_orders sbo JOIN shipping_batches b ON b.id = sbo.batch_id
		WHERE sbo.order_id = $1 LIMIT 1`, orderID).Scan(&p); err != nil {
		return ""
	}
	return p
}

// pickupBatchConflict refuses a delivery-method change that would move a batched order to another provider.
func pickupBatchConflict(ctx context.Context, q rowQuerier, orderID, chainID int) string {
	provider := batchProvider(ctx, q, orderID)
	if provider == "" {
		return ""
	}
	var chainType string
	if err := q.QueryRow(ctx, `SELECT chain_type FROM pickup_chains WHERE id=$1`, chainID).Scan(&chainType); err != nil {
		return ""
	}
	if chainType != provider {
		return "order sudah masuk batch pengiriman " + provider + ": metode pengiriman hanya bisa diganti ke jenis yang sama (" + provider + ")"
	}
	return ""
}

// Edit handles PUT /orders/{id}: one atomic save of every editable detail.
func (h *OrderHandler) Edit(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid order id")
		return
	}
	var req editOrderRequest
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
	if req.PickupChainID == 0 {
		respondError(w, http.StatusBadRequest, "pickup_chain_id is required")
		return
	}
	if len(req.Items) == 0 {
		respondError(w, http.StatusBadRequest, "at least one item is required")
		return
	}
	if req.DiscountAmount < 0 || req.AdditionalAmount < 0 {
		respondError(w, http.StatusBadRequest, "discount_amount and additional_amount cannot be negative")
		return
	}
	for _, it := range req.Items {
		if it.Qty <= 0 || it.VariantID == 0 || (it.Price != nil && *it.Price < 0) {
			respondError(w, http.StatusBadRequest, "each item requires variant_id and a positive qty")
			return
		}
	}

	ctx := r.Context()
	claims := appmw.GetClaims(r)
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(ctx)

	var status, channel string
	var customerID, curChain int
	var exported, curOverride, inGroup, feeHolder bool
	var curFee, promoDiscount float64
	var curStore, curAddress string
	if err := tx.QueryRow(ctx, `
		SELECT o.status, o.sales_channel, o.customer_id, o.pickup_chain_id, o.exported_at IS NOT NULL, o.free_shipping_override,
		       o.shipping_fee, o.promotion_discount_amount, COALESCE(o.pickup_store_code,''), COALESCE(o.shipping_address,''),
		       EXISTS (SELECT 1 FROM order_shipment_group_members gm WHERE gm.order_id = o.id),
		       COALESCE((SELECT g.shipping_fee_order_id = o.id FROM order_shipment_group_members gm
		                 JOIN order_shipment_groups g ON g.id = gm.group_id WHERE gm.order_id = o.id), true)
		FROM orders o WHERE o.id=$1 FOR UPDATE`, id).
		Scan(&status, &channel, &customerID, &curChain, &exported, &curOverride, &curFee, &promoDiscount, &curStore, &curAddress, &inGroup, &feeHolder); err != nil {
		respondError(w, http.StatusNotFound, "order not found")
		return
	}
	if exported {
		respondError(w, http.StatusConflict, orderLockedMsg)
		return
	}
	if status != "pending" {
		respondError(w, http.StatusConflict, "order hanya bisa diedit selama statusnya New/pending (status saat ini: "+status+")")
		return
	}

	// Delivery: same validation as Create Order / the pickup editor.
	finalAddress, bad := resolvePickupAddress(ctx, tx, req.PickupChainID, req.PickupStoreCode, req.PickupStoreName, req.ShippingAddress)
	if bad != "" {
		respondError(w, http.StatusBadRequest, bad)
		return
	}
	pickupChanged := req.PickupChainID != curChain || req.PickupStoreCode != curStore || finalAddress != curAddress
	if pickupChanged {
		if inGroup {
			respondError(w, http.StatusConflict, "order ini digabung dengan order lain (satu pengiriman): pisahkan penggabungan dulu sebelum mengganti metode / toko / alamat")
			return
		}
		if msg := pickupBatchConflict(ctx, tx, id, req.PickupChainID); msg != "" {
			respondError(w, http.StatusConflict, msg)
			return
		}
	}
	if msg := validateExportFields(ctx, tx, req.PickupChainID, req.Customer.Name, finalAddress); msg != "" {
		respondError(w, http.StatusBadRequest, msg)
		return
	}

	// Customer. The customers row is shared with the customer's other orders, so a changed name/phone is
	// saved on that row only when this is the customer's only order; otherwise this order moves to a new
	// customer record (the other orders keep their data, which may already be at the carrier).
	var curName, curPhone string
	_ = tx.QueryRow(ctx, `SELECT name, phone FROM customers WHERE id=$1`, customerID).Scan(&curName, &curPhone)
	if curName != req.Customer.Name || curPhone != req.Customer.Phone {
		if inGroup {
			respondError(w, http.StatusConflict, "order ini digabung dengan order lain: pisahkan penggabungan dulu sebelum mengganti pelanggan")
			return
		}
		var others int
		_ = tx.QueryRow(ctx, `SELECT COUNT(*) FROM orders WHERE customer_id=$1 AND id<>$2`, customerID, id).Scan(&others)
		if others == 0 {
			if _, err := tx.Exec(ctx, `UPDATE customers SET name=$2, phone=$3 WHERE id=$1`, customerID, req.Customer.Name, req.Customer.Phone); err != nil {
				respondError(w, http.StatusInternalServerError, "failed to update customer")
				return
			}
		} else {
			var newID int
			if err := tx.QueryRow(ctx, `INSERT INTO customers (name, phone, address, email)
				SELECT $2, $3, COALESCE(address,''), email FROM customers WHERE id=$1 RETURNING id`,
				customerID, req.Customer.Name, req.Customer.Phone).Scan(&newID); err != nil {
				respondError(w, http.StatusInternalServerError, "failed to create customer")
				return
			}
			customerID = newID
		}
	}
	if req.Customer.Email != "" {
		_, _ = tx.Exec(ctx, `UPDATE customers SET email=$2 WHERE id=$1`, customerID, req.Customer.Email)
	}

	// Items: compare with the current lines.
	type curItem struct {
		variantID, qty, picked int
		price                  float64
	}
	cur := map[int]curItem{}
	curQtyByVariant := map[int]int{}
	irows, err := tx.Query(ctx, `SELECT id, variant_id, qty, picked_qty, price_at_order FROM order_items WHERE order_id=$1`, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load items")
		return
	}
	for irows.Next() {
		var itemID int
		var c curItem
		if irows.Scan(&itemID, &c.variantID, &c.qty, &c.picked, &c.price) == nil {
			cur[itemID] = c
			curQtyByVariant[c.variantID] += c.qty
		}
	}
	irows.Close()

	keep := map[int]bool{}
	newQtyByVariant := map[int]int{}
	for _, it := range req.Items {
		newQtyByVariant[it.VariantID] += it.Qty
		if it.ID != nil {
			c, ok := cur[*it.ID]
			if !ok {
				respondError(w, http.StatusBadRequest, "item does not belong to this order")
				return
			}
			if it.VariantID != c.variantID {
				respondError(w, http.StatusBadRequest, "produk sebuah baris tidak bisa diganti: hapus baris lalu tambahkan produk baru")
				return
			}
			keep[*it.ID] = true
		} else if channel == "live" && it.HostID == 0 {
			respondError(w, http.StatusBadRequest, "each item requires host_id for a LIVE order")
			return
		}
	}

	// Stock: only the quantities that go UP need room (the order's current quantities already count as ordered).
	var extra []createOrderItem
	var variantIDs []int
	for v, q := range newQtyByVariant {
		if q > curQtyByVariant[v] {
			extra = append(extra, createOrderItem{VariantID: v, Qty: q - curQtyByVariant[v]})
			variantIDs = append(variantIDs, v)
		}
	}
	if len(extra) > 0 {
		if msg, err := checkOversellLimitsTx(ctx, tx, extra); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to check stock")
			return
		} else if msg != "" {
			respondError(w, http.StatusConflict, msg)
			return
		}
	}

	for itemID := range cur {
		if !keep[itemID] {
			if _, err := tx.Exec(ctx, `DELETE FROM order_items WHERE id=$1`, itemID); err != nil {
				respondError(w, http.StatusConflict, "baris item tidak bisa dihapus (sudah dipakai proses lain)")
				return
			}
		}
	}
	var subtotal float64
	for _, it := range req.Items {
		var hostID interface{}
		if it.HostID > 0 {
			hostID = it.HostID
		}
		if it.ID != nil {
			c := cur[*it.ID]
			if it.Qty < c.picked {
				respondError(w, http.StatusConflict, "qty tidak boleh di bawah jumlah yang sudah di-pick")
				return
			}
			price := c.price
			if it.Price != nil {
				price = *it.Price
			}
			subtotal += price * float64(it.Qty)
			if _, err := tx.Exec(ctx, `UPDATE order_items SET qty=$2, price_at_order=$3, host_id=COALESCE($4, host_id) WHERE id=$1`, *it.ID, it.Qty, price, hostID); err != nil {
				respondError(w, http.StatusInternalServerError, "failed to update item")
				return
			}
			continue
		}
		var price float64
		if err := tx.QueryRow(ctx, `SELECT price FROM product_variants WHERE id=$1`, it.VariantID).Scan(&price); err != nil {
			respondError(w, http.StatusBadRequest, "variant not found")
			return
		}
		if it.Price != nil {
			price = *it.Price
		}
		subtotal += price * float64(it.Qty)
		if _, err := tx.Exec(ctx, `INSERT INTO order_items (order_id, variant_id, qty, price_at_order, host_id) VALUES ($1,$2,$3,$4,$5)`, id, it.VariantID, it.Qty, price, hostID); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to add item")
			return
		}
	}

	// Batched order: the stock allocated to its batch must still cover every batched order.
	if batchProvider(ctx, tx, id) != "" && len(variantIDs) > 0 {
		remaining, skus, err := allocatableStock(ctx, tx, variantIDs)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "failed to check batch stock")
			return
		}
		var short []string
		for _, v := range variantIDs {
			if remaining[v] < 0 {
				short = append(short, skus[v])
			}
		}
		if len(short) > 0 {
			sort.Strings(short)
			respondError(w, http.StatusConflict, "stok fisik tidak cukup untuk batch yang sudah dibuat: "+strings.Join(short, ", "))
			return
		}
	}

	// Shipping fee. Merged shipment: the fee lives on the group's fee holder, so another member keeps its
	// stored fee untouched (a typed fee is refused). Otherwise: a typed fee wins; else recompute when the
	// delivery method or the item subtotal changed.
	fee := curFee
	freeOverride := curOverride
	var oldSubtotal float64
	for _, c := range cur {
		oldSubtotal += c.price * float64(c.qty)
	}
	switch {
	case inGroup && !feeHolder:
		if req.ShippingFeeOverride != nil && *req.ShippingFeeOverride != curFee {
			respondError(w, http.StatusConflict, "ongkir order gabungan ada di order pemegang ongkir; ubah dari order tersebut")
			return
		}
	case req.ShippingFeeOverride != nil && *req.ShippingFeeOverride != curFee:
		def, derr := ComputeShippingFee(ctx, tx, req.PickupChainID, subtotal, false)
		if derr != nil {
			respondError(w, http.StatusInternalServerError, "failed to compute shipping fee")
			return
		}
		fee = *req.ShippingFeeOverride
		freeOverride = fee == 0 && def > 0
	case !inGroup && (req.PickupChainID != curChain || subtotal != oldSubtotal):
		// A fee that staff set by hand (it differs from what the rules gave for the old items/method) is kept
		// when only the items change; it is recomputed when the delivery method changes or the fee was automatic.
		oldDefault, derr := ComputeShippingFee(ctx, tx, curChain, oldSubtotal, curOverride)
		if derr != nil {
			respondError(w, http.StatusInternalServerError, "failed to compute shipping fee")
			return
		}
		if req.PickupChainID != curChain || curFee == oldDefault {
			fee, err = ComputeShippingFee(ctx, tx, req.PickupChainID, subtotal, curOverride)
			if err != nil {
				respondError(w, http.StatusInternalServerError, "failed to compute shipping fee")
				return
			}
		}
	}
	if subtotal-req.DiscountAmount+req.AdditionalAmount+fee > exportTotalMax {
		respondError(w, http.StatusBadRequest, fmt.Sprintf("total pesanan melebihi batas platform pengiriman (maks. NT$%d)", exportTotalMax))
		return
	}

	if _, err := tx.Exec(ctx, `
		UPDATE orders SET customer_id=$2, shipping_address=$3, pickup_chain_id=$4, pickup_store_name=$5, pickup_store_code=$6,
		       discount_amount=$7, additional_amount=$8, shipping_fee=$9, free_shipping_override=$10,
		       customer_email=CASE WHEN $11 = '' THEN customer_email ELSE $11 END, updated_at=now()
		WHERE id=$1`,
		id, customerID, finalAddress, req.PickupChainID, req.PickupStoreName, req.PickupStoreCode,
		req.DiscountAmount, req.AdditionalAmount, fee, freeOverride, req.Customer.Email); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to update order")
		return
	}
	logActivity(ctx, tx, "order", id, "order_edited", &claims.UserID, fmt.Sprintf("items=%d subtotal=%.0f fee=%.0f", len(req.Items), subtotal, fee))
	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "db commit failed")
		return
	}
	invalidateOrderCaches()
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
