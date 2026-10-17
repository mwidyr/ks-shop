package handlers

import (
	"context"
	"net/http"

	"github.com/jackc/pgx/v5"
)

// An order is "locked" once it joins a shipping batch (its stock is allocated and the batch file is
// built from its data) or has been exported to a logistics provider (orders.exported_at is set on
// the first export): its details (items, prices, shipping fee, customer, delivery,
// remarks) are then frozen for everybody, because the exported file is already with the carrier.
// Only the order STATUS can still move, and only by warehouse and super_user (see
// canChangeLockedStatus).

// rowQuerier is satisfied by both *pgxpool.Pool and pgx.Tx.
type rowQuerier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

const orderLockedMsg = "order sudah masuk batch pengiriman / di-export ke logistik, detail order terkunci dan tidak bisa diubah"

// anyOrderLocked reports whether at least one of the given orders was already exported.
func anyOrderLocked(ctx context.Context, q rowQuerier, ids ...int) bool {
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
