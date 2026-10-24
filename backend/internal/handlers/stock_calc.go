package handlers

import (
	"context"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	appmw "ordermgmt/internal/middleware"
)

// Stock model (client definitions):
//
//	Actual    physical stock in the warehouse            stock_buckets.available_stock
//	Incoming  purchased, not yet received                stock_buckets.incoming_stock
//	Ordered   customer qty not yet shipped (derived)     orderedStatuses below
//	Available Actual + Incoming - Ordered                availableStock()
//
// Actual only changes on a physical event: a purchase is received, the 3PL confirms shipment,
// a returned item is received back, or staff adjust it by hand. Creating, batching, exporting or
// cancelling an order never touches it - Ordered is derived from the orders themselves, so it
// can't drift.

// orderedStatuses are the order statuses whose items still count as "Ordered" (not yet shipped).
const orderedStatusesSQL = `('pending','processing','ready_to_ship')`

// orderedByVariantSQL is a derived table (variant_id, qty) of the quantity customers have ordered
// but not yet had shipped - join it as `LEFT JOIN <this> rv ON rv.variant_id = pv.id` and read
// COALESCE(rv.qty, 0).
const orderedByVariantSQL = `(
	SELECT oi.variant_id, SUM(oi.qty) AS qty
	FROM order_items oi JOIN orders o ON o.id = oi.order_id
	WHERE o.status IN ` + orderedStatusesSQL + `
	GROUP BY oi.variant_id)`

// orderedForVariantSQL is the scalar form for a single variant expression (e.g. "pv.id").
func orderedForVariantSQL(variantExpr string) string {
	return `COALESCE((SELECT SUM(oiq.qty) FROM order_items oiq JOIN orders oq ON oq.id = oiq.order_id
		WHERE oiq.variant_id = ` + variantExpr + ` AND oq.status IN ` + orderedStatusesSQL + `), 0)`
}

// availableStock is what can still be promised to customers (may be negative = oversold).
func availableStock(actual, incoming, ordered int) int {
	return actual + incoming - ordered
}

// deductShipmentStock lowers Actual by the shipped quantities of an order, exactly once per
// (order, variant): the unique index uq_stock_movements_once turns a repeated call into a no-op.
func deductShipmentStock(ctx context.Context, tx pgx.Tx, orderID int, userID *int, note string) error {
	rows, err := tx.Query(ctx, `SELECT variant_id, SUM(qty) FROM order_items WHERE order_id=$1 GROUP BY variant_id`, orderID)
	if err != nil {
		return err
	}
	type line struct{ variantID, qty int }
	var lines []line
	for rows.Next() {
		var l line
		if err := rows.Scan(&l.variantID, &l.qty); err != nil {
			rows.Close()
			return err
		}
		lines = append(lines, l)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	for _, l := range lines {
		ct, err := tx.Exec(ctx, `
			INSERT INTO stock_movements (variant_id, order_id, bucket_from, bucket_to, qty, event_type, user_id, note)
			VALUES ($1,$2,'available_stock','(shipped)',$3,'shipment_deducted',$4,$5)
			ON CONFLICT (order_id, variant_id, event_type)
			WHERE event_type IN ('shipment_deducted','return_restocked','return_broken') DO NOTHING`,
			l.variantID, orderID, l.qty, userID, note)
		if err != nil {
			return err
		}
		if ct.RowsAffected() == 0 {
			continue // already deducted for this order
		}
		if _, err := tx.Exec(ctx, `UPDATE stock_buckets SET available_stock = available_stock - $1 WHERE variant_id=$2`, l.qty, l.variantID); err != nil {
			return err
		}
	}
	return nil
}

type returnReceivedLine struct {
	VariantID  int `json:"variant_id"`
	Resellable int `json:"resellable_qty"`
	Broken     int `json:"broken_qty"`
}

type returnReceivedRequest struct {
	Lines []returnReceivedLine `json:"lines"`
	Note  string               `json:"note"`
}

// ReturnReceived records that the warehouse physically received a returned order's goods back:
// resellable units go back into Actual, damaged ones into broken_stock. Only an order already in
// 'return' status qualifies, and each (order, variant) can be received once.
func (h *OrderHandler) ReturnReceived(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid order id")
		return
	}
	var req returnReceivedRequest
	if err := decodeJSON(r, &req); err != nil || len(req.Lines) == 0 {
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

	var status string
	if err := tx.QueryRow(ctx, `SELECT status FROM orders WHERE id=$1 FOR UPDATE`, id).Scan(&status); err != nil {
		respondError(w, http.StatusNotFound, "order not found")
		return
	}
	if status != "return" {
		respondError(w, http.StatusConflict, "order is not in Returned status")
		return
	}
	for _, l := range req.Lines {
		if l.Resellable < 0 || l.Broken < 0 {
			respondError(w, http.StatusBadRequest, "quantities must not be negative")
			return
		}
		var ordered int
		if err := tx.QueryRow(ctx, `SELECT COALESCE(SUM(qty),0) FROM order_items WHERE order_id=$1 AND variant_id=$2`, id, l.VariantID).Scan(&ordered); err != nil || ordered == 0 {
			respondError(w, http.StatusBadRequest, fmt.Sprintf("variant %d is not part of this order", l.VariantID))
			return
		}
		if l.Resellable+l.Broken > ordered {
			respondError(w, http.StatusBadRequest, fmt.Sprintf("variant %d: received quantity exceeds the ordered quantity (%d)", l.VariantID, ordered))
			return
		}
		if l.Resellable > 0 {
			ct, err := tx.Exec(ctx, `
				INSERT INTO stock_movements (variant_id, order_id, bucket_from, bucket_to, qty, event_type, user_id, note)
				VALUES ($1,$2,'(returned)','available_stock',$3,'return_restocked',$4,$5)
				ON CONFLICT (order_id, variant_id, event_type)
				WHERE event_type IN ('shipment_deducted','return_restocked','return_broken') DO NOTHING`,
				l.VariantID, id, l.Resellable, claims.UserID, req.Note)
			if err != nil {
				respondError(w, http.StatusInternalServerError, "failed to log stock movement")
				return
			}
			if ct.RowsAffected() == 1 {
				tx.Exec(ctx, `UPDATE stock_buckets SET available_stock = available_stock + $1 WHERE variant_id=$2`, l.Resellable, l.VariantID)
				if err := reverseReturnCostTx(ctx, tx, id, l.VariantID, l.Resellable, true); err != nil {
					respondError(w, http.StatusInternalServerError, "failed to reverse the returned cost")
					return
				}
			}
		}
		if l.Broken > 0 {
			ct, err := tx.Exec(ctx, `
				INSERT INTO stock_movements (variant_id, order_id, bucket_from, bucket_to, qty, event_type, user_id, note)
				VALUES ($1,$2,'(returned)','broken_stock',$3,'return_broken',$4,$5)
				ON CONFLICT (order_id, variant_id, event_type)
				WHERE event_type IN ('shipment_deducted','return_restocked','return_broken') DO NOTHING`,
				l.VariantID, id, l.Broken, claims.UserID, req.Note)
			if err != nil {
				respondError(w, http.StatusInternalServerError, "failed to log stock movement")
				return
			}
			if ct.RowsAffected() == 1 {
				tx.Exec(ctx, `UPDATE stock_buckets SET broken_stock = broken_stock + $1 WHERE variant_id=$2`, l.Broken, l.VariantID)
				if err := reverseReturnCostTx(ctx, tx, id, l.VariantID, l.Broken, false); err != nil {
					respondError(w, http.StatusInternalServerError, "failed to reverse the returned cost")
					return
				}
			}
		}
	}
	logActivity(ctx, tx, "order", id, "return_received", &claims.UserID, req.Note)
	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "db commit failed")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// oversellRoom is how many more units a staff / LIVE order may take of a variant (#141):
// Available - qty must stay >= -X, where X is 0 without "allow oversell", the variant's
// oversell_limit when it has one, and unlimited (ok=false) when oversell is allowed with no limit.
func oversellRoom(available int, allowOversell bool, limit *int) (room int, limited bool) {
	switch {
	case !allowOversell:
		return available, true
	case limit == nil:
		return 0, false
	default:
		return available + *limit, true
	}
}

// checkOversellLimitsTx checks a new staff order's lines against every variant's oversell limit,
// with the variants' stock rows locked so two orders at once can't both slip through. Existing
// orders are never re-checked. Returns a user-facing message ("" when the order fits).
func checkOversellLimitsTx(ctx context.Context, tx pgx.Tx, items []createOrderItem) (string, error) {
	need := map[int]int{}
	ids := []int{}
	for _, it := range items {
		if _, ok := need[it.VariantID]; !ok {
			ids = append(ids, it.VariantID)
		}
		need[it.VariantID] += it.Qty
	}
	sort.Ints(ids)
	if _, err := tx.Exec(ctx, `SELECT 1 FROM stock_buckets WHERE variant_id = ANY($1) ORDER BY variant_id FOR UPDATE`, ids); err != nil {
		return "", err
	}
	rows, err := tx.Query(ctx, `
		SELECT pv.id, pv.sku, pv.allow_oversell, pv.oversell_limit,
		       COALESCE(sb.available_stock,0) + COALESCE(sb.incoming_stock,0) - `+orderedForVariantSQL("pv.id")+`
		FROM product_variants pv LEFT JOIN stock_buckets sb ON sb.variant_id = pv.id
		WHERE pv.id = ANY($1) ORDER BY pv.id`, ids)
	if err != nil {
		return "", err
	}
	defer rows.Close()
	var problems []string
	for rows.Next() {
		var id, available int
		var sku string
		var allow bool
		var limit *int
		if err := rows.Scan(&id, &sku, &allow, &limit, &available); err != nil {
			return "", err
		}
		if room, limited := oversellRoom(available, allow, limit); limited && need[id] > room {
			problems = append(problems, fmt.Sprintf("%s: ordered %d, only %d can still be ordered", sku, need[id], max(room, 0)))
		}
	}
	if err := rows.Err(); err != nil {
		return "", err
	}
	if len(problems) > 0 {
		return "not enough stock (oversell limit reached) - " + strings.Join(problems, "; "), nil
	}
	return "", nil
}
