package handlers

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	appmw "ordermgmt/internal/middleware"
)

// OrderMergeHandler implements "Suggested Merge": grouping multiple not-yet-shipped, not-currently-
// picking orders from the same customer, same pickup chain/store, into one shipment so the
// shipping fee is only charged once (see shipping_export.go). Orders/order_items are never
// modified - see 031_order_shipment_groups.sql for why.
type OrderMergeHandler struct {
	DB *pgxpool.Pool
}

type mergeSuggestion struct {
	CustomerID      int      `json:"customer_id"`
	CustomerName    string   `json:"customer_name"`
	CustomerPhone   string   `json:"customer_phone"`
	PickupChainName string   `json:"pickup_chain_name"`
	PickupStoreCode string   `json:"pickup_store_code"`
	OrderIDs        []int    `json:"order_ids"`
	OrderNos        []string `json:"order_nos"`
}

// Suggestions lists groups of ungrouped, eligible orders (status pending/ready_to_ship - not
// currently mid-picking, and not yet shipped) sharing the same customer + pickup chain + pickup
// store, 2 or more at a time. Deliberately NOT narrowed to pending-only: a merge combines the
// SHIPMENT, not the picking process, so two orders that were picked independently can still be
// shipped together once both are ready_to_ship. Excluding 'picking' (kept, unchanged from
// before) plus keeping ready_to_ship eligible is also what keeps the hard ship-time block in
// UpdateStatus (see orders.go, "shipped" case) always resolvable - that check uses this exact
// same eligibility, so any sibling it flags can always actually be merged.
func (h *OrderMergeHandler) Suggestions(w http.ResponseWriter, r *http.Request) {
	claims := appmw.GetClaims(r)
	roleFilter := ""
	args := []interface{}{}
	if claims.Role == "sales" {
		roleFilter = " AND o.sales_id = $1"
		args = append(args, claims.UserID)
	}

	rows, err := h.DB.Query(r.Context(), `
		SELECT o.customer_id, c.name, c.phone, pc.name, COALESCE(o.pickup_store_code,''),
		       array_agg(o.id ORDER BY o.created_at), array_agg(o.order_no ORDER BY o.created_at)
		FROM orders o
		JOIN customers c ON c.id = o.customer_id
		JOIN pickup_chains pc ON pc.id = o.pickup_chain_id
		WHERE o.status IN ('pending','ready_to_ship')
		  AND NOT EXISTS (SELECT 1 FROM order_shipment_group_members m WHERE m.order_id = o.id)`+roleFilter+`
		GROUP BY o.customer_id, c.name, c.phone, pc.name, o.pickup_chain_id, COALESCE(o.pickup_store_code,'')
		HAVING COUNT(*) > 1`, args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to compute merge suggestions")
		return
	}
	defer rows.Close()

	list := []mergeSuggestion{}
	for rows.Next() {
		var s mergeSuggestion
		if err := rows.Scan(&s.CustomerID, &s.CustomerName, &s.CustomerPhone, &s.PickupChainName,
			&s.PickupStoreCode, &s.OrderIDs, &s.OrderNos); err != nil {
			continue
		}
		list = append(list, s)
	}
	respondJSON(w, http.StatusOK, list)
}

type createMergeGroupRequest struct {
	OrderIDs []int `json:"order_ids"`
}

// CreateGroup merges 2+ eligible orders into one shipment group. All must share the same
// pickup chain + store, be not-yet-shipped, and not currently be in picking; the first order
// (by created_at) carries the shipping fee, the rest show as included-in-that-order at export
// time.
func (h *OrderMergeHandler) CreateGroup(w http.ResponseWriter, r *http.Request) {
	var req createMergeGroupRequest
	if err := decodeJSON(r, &req); err != nil || len(req.OrderIDs) < 2 {
		respondError(w, http.StatusBadRequest, "at least 2 order_ids are required")
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

	rows, err := tx.Query(ctx, `
		SELECT id, customer_id, pickup_chain_id, COALESCE(pickup_store_code,''), status, shipping_fee, free_shipping_override
		FROM orders WHERE id = ANY($1) ORDER BY created_at`, req.OrderIDs)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	type ov struct {
		ID                   int
		CustomerID           int
		PickupChainID        int
		StoreCode            string
		Status               string
		ShippingFee          float64
		FreeShippingOverride bool
	}
	var orders []ov
	for rows.Next() {
		var o ov
		if err := rows.Scan(&o.ID, &o.CustomerID, &o.PickupChainID, &o.StoreCode, &o.Status, &o.ShippingFee, &o.FreeShippingOverride); err != nil {
			continue
		}
		orders = append(orders, o)
	}
	rows.Close()

	if len(orders) != len(req.OrderIDs) {
		respondError(w, http.StatusBadRequest, "one or more orders not found")
		return
	}
	for _, o := range orders {
		if o.Status == "picking" {
			respondError(w, http.StatusBadRequest, "order "+strconv.Itoa(o.ID)+" is currently being picked and can't be merged")
			return
		}
		if o.Status != "pending" && o.Status != "ready_to_ship" {
			respondError(w, http.StatusBadRequest, "order "+strconv.Itoa(o.ID)+" is already shipped and can't be merged")
			return
		}
		if o.CustomerID != orders[0].CustomerID {
			respondError(w, http.StatusBadRequest, "orders must belong to the same customer")
			return
		}
		if o.PickupChainID != orders[0].PickupChainID || o.StoreCode != orders[0].StoreCode {
			respondError(w, http.StatusBadRequest, "orders must use the same pickup chain and store")
			return
		}
	}

	// If the orders' combined subtotal clears the free-shipping threshold even though none of
	// them individually did, waive the fee-holder's shipping fee automatically - the same
	// threshold a single order would be checked against (loadShippingFeeSettings, shipping_fee.go),
	// just evaluated against the sum of every merged order's items. The fee-holder's pre-waiver
	// values are preserved on the group row so DeleteGroup (unmerge) can restore them exactly.
	feeHolder := orders[0]
	waiveFee := false
	if feeHolder.ShippingFee > 0 {
		var combinedSubtotal float64
		tx.QueryRow(ctx, `
			SELECT COALESCE(SUM(oi.qty * oi.price_at_order),0) FROM order_items oi WHERE oi.order_id = ANY($1)`,
			req.OrderIDs).Scan(&combinedSubtotal)

		var chainType string
		tx.QueryRow(ctx, `SELECT chain_type FROM pickup_chains WHERE id=$1`, feeHolder.PickupChainID).Scan(&chainType)

		settings, sErr := loadShippingFeeSettings(ctx, tx)
		if sErr == nil {
			threshold := settings["free_shipping_threshold_minimarket"]
			if chainType == "courier" {
				threshold = settings["free_shipping_threshold_pos"]
			}
			if threshold > 0 && combinedSubtotal >= threshold {
				waiveFee = true
			}
		}
	}

	var groupID int
	if waiveFee {
		if err := tx.QueryRow(ctx, `
			INSERT INTO order_shipment_groups (shipping_fee_order_id, created_by, original_shipping_fee, original_free_shipping_override)
			VALUES ($1,$2,$3,$4) RETURNING id`,
			feeHolder.ID, claims.UserID, feeHolder.ShippingFee, feeHolder.FreeShippingOverride).Scan(&groupID); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to create shipment group")
			return
		}
		if _, err := tx.Exec(ctx, `UPDATE orders SET shipping_fee=0, free_shipping_override=true WHERE id=$1`, feeHolder.ID); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to waive shipping fee")
			return
		}
	} else {
		if err := tx.QueryRow(ctx, `
			INSERT INTO order_shipment_groups (shipping_fee_order_id, created_by) VALUES ($1,$2) RETURNING id`,
			feeHolder.ID, claims.UserID).Scan(&groupID); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to create shipment group")
			return
		}
	}
	for _, o := range orders {
		if _, err := tx.Exec(ctx, `
			INSERT INTO order_shipment_group_members (group_id, order_id) VALUES ($1,$2)`, groupID, o.ID); err != nil {
			respondError(w, http.StatusConflict, "order "+strconv.Itoa(o.ID)+" is already part of another shipment group")
			return
		}
		tx.Exec(ctx, `
			INSERT INTO order_status_log (order_id, status_from, status_to, changed_by, reason)
			VALUES ($1,$2,$2,$3,$4)`, o.ID, o.Status, claims.UserID, "Digabung ke grup pengiriman #"+strconv.Itoa(groupID))
	}

	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "db commit failed")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]int{"id": groupID})
}

// DeleteGroup unmerges a shipment group. Orders/order_items were never modified by the merge
// itself, but CreateGroup may have zeroed the fee-holder's shipping_fee as a free-shipping
// waiver (see there) - if so, original_shipping_fee/original_free_shipping_override on the group
// row restore it before the group is deleted, so unmerging doesn't leave the fee stuck at 0.
func (h *OrderMergeHandler) DeleteGroup(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid group id")
		return
	}
	ctx := r.Context()

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(ctx)

	var feeOrderID int
	var originalFee *float64
	var originalOverride *bool
	if err := tx.QueryRow(ctx, `
		SELECT shipping_fee_order_id, original_shipping_fee, original_free_shipping_override
		FROM order_shipment_groups WHERE id=$1`, id).Scan(&feeOrderID, &originalFee, &originalOverride); err != nil {
		respondError(w, http.StatusNotFound, "shipment group not found")
		return
	}

	if originalFee != nil {
		override := originalOverride != nil && *originalOverride
		if _, err := tx.Exec(ctx, `UPDATE orders SET shipping_fee=$1, free_shipping_override=$2 WHERE id=$3`,
			*originalFee, override, feeOrderID); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to restore shipping fee")
			return
		}
	}

	if _, err := tx.Exec(ctx, `DELETE FROM order_shipment_groups WHERE id=$1`, id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to delete shipment group")
		return
	}

	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "db commit failed")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
