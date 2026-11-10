package handlers

import (
	"context"
	"net/http"
	"strconv"
	"strings"

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

// Merge matching. A customer is identified by name + phone digits (the same person can sit on several customer
// rows), and a delivery by chain + (store code for 7-11 / FamilyMart, the normalised street address for POS /
// courier). Dates play no part: orders of any age can be merged while they are still eligible.
const (
	mergeCustomerKeyTmpl = `lower(regexp_replace(btrim({c}.name), '\s+', ' ', 'g')) || '|' || regexp_replace(COALESCE({c}.phone,''), '\D', '', 'g')`
	mergeDeliveryKeyTmpl = `CASE WHEN {pc}.chain_type IN ('cvs_711','cvs_familymart')
		THEN {pc}.chain_type || '|' || btrim(COALESCE({o}.pickup_store_code,''))
		ELSE {o}.pickup_chain_id::text || '|' || lower(regexp_replace(btrim(COALESCE({o}.shipping_address,'')), '\s+', ' ', 'g')) END`
	// what staff see for a delivery: "7-ELEVEN #123456" / "POS - <address>"
	mergeDeliveryLabelTmpl = `{pc}.name || CASE WHEN {pc}.chain_type IN ('cvs_711','cvs_familymart')
		THEN ' #' || COALESCE({o}.pickup_store_code,'') ELSE ' - ' || COALESCE({o}.shipping_address,'') END`
)

// mergeSQL fills a key template with the aliases of the order (o), customer (c) and pickup chain (pc) tables.
func mergeSQL(tmpl, o, c, pc string) string {
	return strings.NewReplacer("{o}", o, "{c}", c, "{pc}", pc).Replace(tmpl)
}

var (
	mergeCustomerKeySQL   = mergeSQL(mergeCustomerKeyTmpl, "o", "c", "pc")
	mergeDeliveryKeySQL   = mergeSQL(mergeDeliveryKeyTmpl, "o", "c", "pc")
	mergeDeliveryLabelSQL = mergeSQL(mergeDeliveryLabelTmpl, "o", "c", "pc")
)

// canMergeProcessing: who may merge (or edit the shipping of) Processing orders on top of New ones: anyone who may
// override the order lock, plus Management, SPV and Warehouse. Everybody else only handles New orders.
func canMergeProcessing(ctx context.Context, q rowQuerier, role string, userID int) bool {
	return role == "management" || role == "spv" || role == "warehouse" || canOverrideLock(ctx, q, role, userID)
}

type mergeSuggestion struct {
	Key             string   `json:"key"`
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
// shipped together once both are ready_to_ship. Excluding 'processing' (kept, unchanged from
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

	// Only New (pending) orders are suggested. An order already merged into a group stays a candidate (its whole group
	// is offered), so a 3rd order of the same customer / delivery can still be added to an existing 2-order group.
	// Groups with a member that is no longer pending, or several different groups for one key, are left out
	// (CreateGroup would refuse them anyway).
	rows, err := h.DB.Query(r.Context(), `
		SELECT `+mergeCustomerKeySQL+`, `+mergeDeliveryKeySQL+`, min(o.customer_id), min(c.name), min(c.phone), min(pc.name),
		       COALESCE(min(o.pickup_store_code),''),
		       array_agg(o.id ORDER BY o.created_at), array_agg(o.order_no ORDER BY o.created_at)
		FROM orders o
		JOIN customers c ON c.id = o.customer_id
		JOIN pickup_chains pc ON pc.id = o.pickup_chain_id
		LEFT JOIN order_shipment_group_members m ON m.order_id = o.id
		WHERE o.status = 'pending'
		  AND (m.group_id IS NULL OR NOT EXISTS (
		        SELECT 1 FROM order_shipment_group_members m2 JOIN orders o2 ON o2.id = m2.order_id
		        WHERE m2.group_id = m.group_id AND o2.status <> 'pending'))`+roleFilter+`
		GROUP BY 1, 2
		HAVING COUNT(*) > 1 AND COUNT(*) FILTER (WHERE m.group_id IS NULL) >= 1 AND COUNT(DISTINCT m.group_id) <= 1`, args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to compute merge suggestions")
		return
	}
	defer rows.Close()

	list := []mergeSuggestion{}
	for rows.Next() {
		var s mergeSuggestion
		var ckey, dkey string
		if err := rows.Scan(&ckey, &dkey, &s.CustomerID, &s.CustomerName, &s.CustomerPhone, &s.PickupChainName,
			&s.PickupStoreCode, &s.OrderIDs, &s.OrderNos); err != nil {
			continue
		}
		s.Key = ckey + "#" + dkey
		list = append(list, s)
	}
	respondJSON(w, http.StatusOK, list)
}

type relatedDelivery struct {
	OrderID  int    `json:"order_id"`
	OrderNo  string `json:"order_no"`
	Delivery string `json:"delivery"`
}

type relatedOrders struct {
	CustomerName  string            `json:"customer_name"`
	CustomerPhone string            `json:"customer_phone"`
	Orders        []relatedDelivery `json:"orders"`
}

// Related lists customers (name + phone) with 2 or more New orders that cannot be merged yet because their
// shipping differs (another method, store or address): staff contact the customer, and once the shipping is
// made equal the normal suggestion appears. Merged orders are left out - they are already one shipment.
func (h *OrderMergeHandler) Related(w http.ResponseWriter, r *http.Request) {
	claims := appmw.GetClaims(r)
	roleFilter := ""
	args := []interface{}{}
	if claims.Role == "sales" {
		roleFilter = " AND o.sales_id = $1"
		args = append(args, claims.UserID)
	}
	rows, err := h.DB.Query(r.Context(), `
		SELECT min(c.name), min(c.phone),
		       array_agg(o.id ORDER BY o.created_at), array_agg(o.order_no ORDER BY o.created_at),
		       array_agg(`+mergeDeliveryLabelSQL+` ORDER BY o.created_at)
		FROM orders o
		JOIN customers c ON c.id = o.customer_id
		JOIN pickup_chains pc ON pc.id = o.pickup_chain_id
		WHERE o.status = 'pending'
		  AND NOT EXISTS (SELECT 1 FROM order_shipment_group_members m WHERE m.order_id = o.id)`+roleFilter+`
		GROUP BY `+mergeCustomerKeySQL+`
		HAVING COUNT(*) > 1 AND COUNT(DISTINCT `+mergeDeliveryKeySQL+`) > 1
		ORDER BY max(o.created_at) DESC`, args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to compute related orders")
		return
	}
	defer rows.Close()
	list := []relatedOrders{}
	for rows.Next() {
		var ro relatedOrders
		var ids []int
		var nos, labels []string
		if err := rows.Scan(&ro.CustomerName, &ro.CustomerPhone, &ids, &nos, &labels); err != nil {
			continue
		}
		for i := range ids {
			ro.Orders = append(ro.Orders, relatedDelivery{OrderID: ids[i], OrderNo: nos[i], Delivery: labels[i]})
		}
		list = append(list, ro)
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

	// Some of the orders may already form a shipment group: the new order(s) then join that group (the whole group
	// is revalidated together). Orders from two different groups can't be combined: unmerge one first.
	existingGroup := 0
	memberOf := map[int]bool{}
	if grows, gerr := tx.Query(ctx, `SELECT DISTINCT group_id FROM order_shipment_group_members WHERE order_id = ANY($1)`, req.OrderIDs); gerr == nil {
		var gids []int
		for grows.Next() {
			var g int
			if grows.Scan(&g) == nil {
				gids = append(gids, g)
			}
		}
		grows.Close()
		if len(gids) > 1 {
			respondError(w, http.StatusConflict, "order berasal dari dua grup gabungan yang berbeda: pisahkan salah satu grup dulu")
			return
		}
		if len(gids) == 1 {
			existingGroup = gids[0]
			seen := map[int]bool{}
			for _, id := range req.OrderIDs {
				seen[id] = true
			}
			mrows, merr := tx.Query(ctx, `SELECT order_id FROM order_shipment_group_members WHERE group_id=$1`, existingGroup)
			if merr == nil {
				for mrows.Next() {
					var oid int
					if mrows.Scan(&oid) == nil {
						memberOf[oid] = true
						if !seen[oid] {
							req.OrderIDs = append(req.OrderIDs, oid)
						}
					}
				}
				mrows.Close()
			}
			if len(memberOf) == len(req.OrderIDs) {
				respondError(w, http.StatusBadRequest, "pilih minimal satu order yang belum tergabung")
				return
			}
		}
	}

	// Orders already exported / in a batch can only be (re)merged by a user who may override the lock, and only when
	// they all sit in the same batch (or none does): a merged shipment must never be split across batches.
	lockedMerge := anyOrderBatchedOrLocked(ctx, tx, req.OrderIDs...)
	if lockedMerge {
		if !canMergeProcessing(ctx, tx, claims.Role, claims.UserID) {
			respondError(w, http.StatusConflict, orderLockedForRoleMsg)
			return
		}
		var batches int
		var inBatch int
		tx.QueryRow(ctx, `SELECT COUNT(DISTINCT batch_id), COUNT(*) FROM shipping_batch_orders WHERE order_id = ANY($1)`, req.OrderIDs).Scan(&batches, &inBatch)
		if batches > 1 || (inBatch > 0 && inBatch != len(req.OrderIDs)) {
			respondError(w, http.StatusConflict, "order berada di batch yang berbeda (atau sebagian belum masuk batch): satu gabungan pengiriman tidak boleh terpecah antar batch")
			return
		}
	}
	rows, err := tx.Query(ctx, `
		SELECT o.id, o.order_no, o.customer_id, o.pickup_chain_id, COALESCE(o.pickup_store_code,''), o.status, o.shipping_fee, o.free_shipping_override,
		       `+mergeCustomerKeySQL+`, `+mergeDeliveryKeySQL+`, `+mergeDeliveryLabelSQL+`
		FROM orders o JOIN customers c ON c.id = o.customer_id JOIN pickup_chains pc ON pc.id = o.pickup_chain_id
		WHERE o.id = ANY($1) ORDER BY o.created_at`, req.OrderIDs)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	type ov struct {
		ID                   int
		OrderNo              string
		CustomerID           int
		PickupChainID        int
		StoreCode            string
		Status               string
		ShippingFee          float64
		FreeShippingOverride bool
		CustomerKey          string // name + phone digits: the same person saved twice (e.g. after a phone correction)
		DeliveryKey          string
		DeliveryLabel        string
	}
	var orders []ov
	for rows.Next() {
		var o ov
		if err := rows.Scan(&o.ID, &o.OrderNo, &o.CustomerID, &o.PickupChainID, &o.StoreCode, &o.Status, &o.ShippingFee, &o.FreeShippingOverride, &o.CustomerKey, &o.DeliveryKey, &o.DeliveryLabel); err != nil {
			continue
		}
		orders = append(orders, o)
	}
	rows.Close()

	if len(orders) != len(req.OrderIDs) {
		respondError(w, http.StatusBadRequest, "one or more orders not found")
		return
	}
	canProcessing := canMergeProcessing(ctx, tx, claims.Role, claims.UserID)
	for _, o := range orders {
		switch {
		case o.Status == "pending":
		case o.Status == "processing" && canProcessing:
		case lockedMerge && canOverrideLock(ctx, tx, claims.Role, claims.UserID) && (o.Status == "shipped" || o.Status == "delivered"):
			// re-merging orders that were unmerged after export: only users who may override the lock
		case o.Status == "processing":
			respondError(w, http.StatusForbidden, "order "+o.OrderNo+" sedang Processing: hanya Management / SPV / Warehouse yang boleh menggabungkannya")
			return
		default:
			respondError(w, http.StatusBadRequest, "order "+o.OrderNo+" sudah melewati tahap yang bisa digabung (status: "+o.Status+"): hanya order New dan Processing yang bisa digabung")
			return
		}
		if o.CustomerKey != orders[0].CustomerKey {
			respondError(w, http.StatusBadRequest, "orders must belong to the same customer (same name and phone number)")
			return
		}
		if o.DeliveryKey != orders[0].DeliveryKey {
			respondError(w, http.StatusBadRequest, "data pengiriman berbeda, samakan dulu sebelum digabung: "+orders[0].OrderNo+" ("+orders[0].DeliveryLabel+") vs "+o.OrderNo+" ("+o.DeliveryLabel+")")
			return
		}
	}

	// If the orders' combined subtotal clears the free-shipping threshold even though none of
	// them individually did, waive the fee-holder's shipping fee automatically - the same
	// threshold a single order would be checked against (loadShippingFeeSettings, shipping_fee.go),
	// just evaluated against the sum of every merged order's items. The fee-holder's pre-waiver
	// values are preserved on the group row so DeleteGroup (unmerge) can restore them exactly.
	feeHolder := orders[0]
	alreadyWaived := false
	if existingGroup != 0 {
		var holderID int
		var origFee *float64
		tx.QueryRow(ctx, `SELECT shipping_fee_order_id, original_shipping_fee FROM order_shipment_groups WHERE id=$1`, existingGroup).Scan(&holderID, &origFee)
		alreadyWaived = origFee != nil
		for _, o := range orders {
			if o.ID == holderID {
				feeHolder = o
			}
		}
	}
	waiveFee := false
	if feeHolder.ShippingFee > 0 && !alreadyWaived {
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
	if existingGroup != 0 {
		groupID = existingGroup
		if waiveFee {
			if _, err := tx.Exec(ctx, `UPDATE order_shipment_groups SET original_shipping_fee=$2, original_free_shipping_override=$3 WHERE id=$1`,
				groupID, feeHolder.ShippingFee, feeHolder.FreeShippingOverride); err != nil {
				respondError(w, http.StatusInternalServerError, "failed to update shipment group")
				return
			}
			if _, err := tx.Exec(ctx, `UPDATE orders SET shipping_fee=0, free_shipping_override=true WHERE id=$1`, feeHolder.ID); err != nil {
				respondError(w, http.StatusInternalServerError, "failed to waive shipping fee")
				return
			}
		}
	} else if waiveFee {
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
		if memberOf[o.ID] {
			continue
		}
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

	if groupHasLockedMember(ctx, tx, id) && !requestCanOverrideLock(r, tx) {
		respondError(w, http.StatusConflict, orderLockedForRoleMsg)
		return
	}
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

	if claims := appmw.GetClaims(r); claims != nil {
		logActivity(ctx, tx, "shipment_group", id, "unmerged", &claims.UserID, "")
	}
	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "db commit failed")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
