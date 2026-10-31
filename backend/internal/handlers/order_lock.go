package handlers

import (
	"context"
	"net/http"

	"github.com/jackc/pgx/v5"
)

// An order is "locked" once it has been exported through the Shipping Workbench (orders.exported_at is
// set on the first export): the file is then with the logistics platform / 3PL, so its details (items,
// prices, shipping fee, customer, delivery, remarks) are frozen for everybody. Only the order STATUS can
// still move, and only by warehouse and super_user (see canChangeLockedStatus).
// An order that is merely in a batch (stock allocated, nothing exported yet) is NOT locked and stays
// editable; it can only not be merged / unmerged any more (see anyOrderBatchedOrLocked).

// rowQuerier is satisfied by both *pgxpool.Pool and pgx.Tx.
type rowQuerier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

const orderLockedMsg = "order sudah di-export lewat Shipping Workbench, detail order terkunci dan tidak bisa diubah"
const orderBatchedMsg = "order sudah masuk batch pengiriman, tidak bisa digabung / dipisah lagi"

// anyOrderLocked reports whether at least one of the given orders was already exported.
func anyOrderLocked(ctx context.Context, q rowQuerier, ids ...int) bool {
	var locked bool
	if err := q.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM orders WHERE id = ANY($1) AND exported_at IS NOT NULL)`, ids).
		Scan(&locked); err != nil {
		return false
	}
	return locked
}

// anyOrderBatchedOrLocked: exported OR already a member of a shipping batch. Used by the merge
// feature, so a merged shipment can never be split across batches.
func anyOrderBatchedOrLocked(ctx context.Context, q rowQuerier, ids ...int) bool {
	var locked bool
	if err := q.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM orders WHERE id = ANY($1) AND exported_at IS NOT NULL)
		     OR EXISTS(SELECT 1 FROM shipping_batch_orders WHERE order_id = ANY($1))`, ids).
		Scan(&locked); err != nil {
		return false
	}
	return locked
}

// rejectIfLocked writes a 409 and returns true when the order is locked.
func rejectIfLocked(w http.ResponseWriter, ctx context.Context, q rowQuerier, ids ...int) bool {
	if anyOrderLocked(ctx, q, ids...) {
		respondError(w, http.StatusConflict, orderLockedMsg)
		return true
	}
	return false
}

// canChangeLockedStatus: while an order is locked only warehouse and super_user may move its status.
func canChangeLockedStatus(role string) bool {
	return role == "warehouse" || role == "super_user"
}

// groupHasLockedMember: a shipment group can't be dissolved once any member order was exported.
func groupHasLockedMember(ctx context.Context, q rowQuerier, groupID int) bool {
	var locked bool
	if err := q.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM order_shipment_group_members gm JOIN orders o ON o.id = gm.order_id
		              WHERE gm.group_id = $1 AND (o.exported_at IS NOT NULL
		                    OR EXISTS (SELECT 1 FROM shipping_batch_orders sbo WHERE sbo.order_id = o.id)))`, groupID).Scan(&locked); err != nil {
		return false
	}
	return locked
}
