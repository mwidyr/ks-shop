package handlers

import (
	"context"

	"github.com/jackc/pgx/v5"
)

// applyStatusChange performs an already-validated status change inside the caller's transaction:
// the status update, its side effects (stock on shipment, promo/wallet on cancel, rewards on
// completion, point reversal on return) and the order_status_log row. Both the manual
// UpdateStatus endpoint and the Shipping Workbench imports/exports go through it, so a status
// can never change without its side effects. The order row should already be locked FOR UPDATE.
func applyStatusChange(ctx context.Context, tx pgx.Tx, orderID int, from, to string, userID *int, reason string) error {
	// Stock: only a confirmed shipment lowers Actual (once, see deductShipmentStock). Cancelling
	// before shipment and completing delivery change nothing - Ordered is derived from the
	// orders. A return restocks later, when the goods are received (ReturnReceived).
	if to == "shipped" {
		if err := deductShipmentStock(ctx, tx, orderID, userID, reason); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(ctx, `UPDATE orders SET status=$1, updated_at=now() WHERE id=$2`, to, orderID); err != nil {
		return err
	}
	switch to {
	case "cancelled":
		// Free the promotion's usage/per-customer count back up - a cancelled order shouldn't
		// permanently consume a limited coupon's redemption slot.
		tx.Exec(ctx, `DELETE FROM promotion_redemptions WHERE order_id=$1`, orderID)
		OrderCancelledRefund(ctx, tx, orderID) // give back wallet balance / points the order used
	case "delivered":
		OrderDeliveredReward(ctx, tx, orderID) // points for the member + referral reward on a first order
	case "return":
		OrderEarnReverse(ctx, tx, orderID) // returned goods don't keep their points
	}
	_, err := tx.Exec(ctx, `
		INSERT INTO order_status_log (order_id, status_from, status_to, changed_by, reason)
		VALUES ($1,$2,$3,$4,$5)`, orderID, from, to, userID, reason)
	return err
}
