package handlers

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	appmw "ordermgmt/internal/middleware"
)

// OrderMergeHandler implements "Suggested Merge": grouping multiple not-yet-shipped orders from
// the same customer, same pickup chain/store, into one shipment so the shipping fee is only
// charged once (see shipping_export.go). Orders/order_items are never modified - see
// 031_order_shipment_groups.sql for why.
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

// Suggestions lists groups of ungrouped, eligible orders (status pending/picking, i.e. not yet
// shipped) sharing the same customer + pickup chain + pickup store, 2 or more at a time.
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
		WHERE o.status IN ('pending','picking')
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
// pickup chain + store and be not-yet-shipped; the first order (by created_at) carries the
// shipping fee, the rest show as included-in-that-order at export time.
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
		SELECT id, customer_id, pickup_chain_id, COALESCE(pickup_store_code,''), status
		FROM orders WHERE id = ANY($1) ORDER BY created_at`, req.OrderIDs)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	type ov struct {
		ID            int
		CustomerID    int
		PickupChainID int
		StoreCode     string
		Status        string
	}
	var orders []ov
	for rows.Next() {
		var o ov
		if err := rows.Scan(&o.ID, &o.CustomerID, &o.PickupChainID, &o.StoreCode, &o.Status); err != nil {
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
		if o.Status != "pending" && o.Status != "picking" {
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

	var groupID int
	if err := tx.QueryRow(ctx, `
		INSERT INTO order_shipment_groups (shipping_fee_order_id, created_by) VALUES ($1,$2) RETURNING id`,
		orders[0].ID, claims.UserID).Scan(&groupID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create shipment group")
		return
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

// DeleteGroup unmerges a shipment group - a trivial row delete, nothing on the underlying
// orders needs to be unwound since they were never modified.
func (h *OrderMergeHandler) DeleteGroup(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid group id")
		return
	}
	ct, err := h.DB.Exec(r.Context(), `DELETE FROM order_shipment_groups WHERE id=$1`, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to delete shipment group")
		return
	}
	if ct.RowsAffected() == 0 {
		respondError(w, http.StatusNotFound, "shipment group not found")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
