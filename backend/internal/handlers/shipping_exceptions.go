package handlers

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
)

// 7-ELEVEN / FamilyMart exception reports, imported from Shipping Workbench -> Cross-Batch Import:
//
//	711_expired   - 類別：取消訂單. The platform cancelled the shipping label: the order keeps its status, stock and batch,
//	                its platform order no. / shipping no. are cleared and it waits for new numbers (Expired Label Reprocessing).
//	711_unclaimed - 類別：未取退宅 (unclaimed return), fm_unclaimed - FamilyMart 退回. The order becomes Returned (the status that
//	                sales statistics already exclude), its stock goes back once and the customer is blacklisted by phone.
//
// A row is applied only when BOTH identifiers point at the same order: our order number (7-11 商品備註 / FamilyMart 商品名稱)
// and the platform's order number (7-11 訂單編號 / FamilyMart 訂單編號). Anything else becomes a mismatch issue.
var exceptionKinds = map[string]bool{"711_expired": true, "711_unclaimed": true, "fm_unclaimed": true}

const maxSummaryNotes = 50

func (a *importApplier) note(format string, args ...any) {
	if len(a.sum.Notes) < maxSummaryNotes {
		a.sum.Notes = append(a.sum.Notes, fmt.Sprintf(format, args...))
	}
}

func (a *importApplier) recordException(rec importRecord) error {
	a.sum.Total++
	key := rec.OrderNo + "|" + rec.PlatformOrderNo
	if a.seenRows == nil {
		a.seenRows = map[string]bool{}
	}
	if a.seenRows[key] { // the same record twice in one file is processed once
		a.sum.Skipped++
		return nil
	}
	a.seenRows[key] = true

	cands := a.idx.byOrderNo[rec.OrderNo]
	var hit *candidateOrder
	for i := range cands {
		if rec.PlatformOrderNo != "" && strings.EqualFold(cands[i].PlatformOrderNo, rec.PlatformOrderNo) {
			hit = &cands[i]
			break
		}
	}
	if hit == nil {
		for _, c := range cands {
			if a.req.Kind == "711_expired" && a.state[c.ID].LabelExpired && strings.EqualFold(a.state[c.ID].ExpiredPlatformNo, rec.PlatformOrderNo) {
				a.sum.Skipped++ // the same expired file again: already handled
				return nil
			}
		}
		a.sum.Unmatched++
		if len(cands) == 0 {
			a.issue(rec, "exception_no_order", 0, nil)
		} else {
			a.issue(rec, "exception_mismatch", cands[0].ID, map[string]any{"stored_platform": cands[0].PlatformOrderNo})
		}
		return nil
	}

	var ids []int
	for _, id := range a.members[hit.unitKey()] {
		if a.state[id].Status != "cancelled" {
			ids = append(ids, id)
		}
	}
	if len(ids) == 0 {
		a.sum.Skipped++
		return nil
	}
	var changed bool
	var err error
	if a.req.Kind == "711_expired" {
		changed, err = a.expireLabels(ids, rec)
	} else {
		changed, err = a.returnUnclaimed(ids, rec)
	}
	if err != nil {
		return err
	}
	if changed {
		a.sum.Updated++
	} else {
		a.sum.Skipped++
	}
	return nil
}

// expireLabels clears the numbers of an order whose label the platform cancelled. Stock, FIFO cost and the batch
// membership are not touched; an order that was Ready to Ship goes back to Processing (it has no valid number now).
func (a *importApplier) expireLabels(ids []int, rec importRecord) (bool, error) {
	changed := false
	for _, id := range ids {
		c := a.state[id]
		if c.LabelExpired {
			continue
		}
		switch c.Status {
		case "processing", "ready_to_ship", "shipped":
		default:
			a.issue(rec, "exception_status", id, map[string]any{"status": c.Status})
			continue
		}
		if _, err := a.tx.Exec(a.ctx, `
			UPDATE orders SET expired_platform_no = NULLIF(platform_order_no,''), expired_shipping_no = NULLIF(tracking_number,''),
			       platform_order_no = NULL, tracking_number = NULL, label_expired_at = now(), label_reissued_at = NULL, updated_at = now()
			WHERE id=$1`, id); err != nil {
			return changed, err
		}
		if _, err := a.tx.Exec(a.ctx, `UPDATE shipping_batch_orders SET create_result = NULL, last_error = NULL WHERE order_id=$1`, id); err != nil {
			return changed, err
		}
		if c.Status == "ready_to_ship" {
			if err := applyStatusChange(a.ctx, a.tx, id, "ready_to_ship", "processing", &a.userID, "system: shipping label expired (7-ELEVEN import)"); err != nil {
				return changed, err
			}
			c.Status = "processing"
		}
		logActivity(a.ctx, a.tx, "order", id, "label_expired", &a.userID,
			changeLine("No. order platform", c.PlatformOrderNo, "")+orderChangeSep+changeLine("No. pengiriman", c.ShippingNo, ""))
		c.ExpiredPlatformNo, c.ExpiredShippingNo, c.PlatformOrderNo, c.ShippingNo, c.LabelExpired = c.PlatformOrderNo, c.ShippingNo, "", "", true
		a.sum.Expired++
		changed = true
	}
	return changed, nil
}

// reissueIfReady: new numbers arrived for an order whose label had expired. It leaves the "expired" list and waits for the
// priority 3PL file (label_reissued_at).
func (a *importApplier) reissueIfReady(ids []int) (bool, error) {
	changed := false
	for _, id := range ids {
		c := a.state[id]
		if !c.LabelExpired || !readyAfterImport(c.Provider, c.PlatformOrderNo, c.ShippingNo) {
			continue
		}
		if _, err := a.tx.Exec(a.ctx, `UPDATE orders SET label_expired_at = NULL, label_reissued_at = now(), updated_at = now() WHERE id=$1`, id); err != nil {
			return changed, err
		}
		logActivity(a.ctx, a.tx, "order", id, "label_reissued", &a.userID, changeLine("No. order platform", "", c.PlatformOrderNo))
		c.LabelExpired = false
		changed = true
	}
	return changed, nil
}

// returnUnclaimed turns an unclaimed parcel into a Returned order: stock back once, customer blacklisted.
func (a *importApplier) returnUnclaimed(ids []int, rec importRecord) (bool, error) {
	changed := false
	for _, id := range ids {
		c := a.state[id]
		switch c.Status {
		case "return":
			continue // already returned: a repeated import changes nothing
		case "shipped", "delivered":
		default:
			a.issue(rec, "exception_status", id, map[string]any{"status": c.Status})
			continue
		}
		if err := applyStatusChange(a.ctx, a.tx, id, c.Status, "return", &a.userID, "system: unclaimed return imported ("+a.req.Kind+")"); err != nil {
			return changed, err
		}
		c.Status = "return"
		if err := restockReturnedOrder(a.ctx, a.tx, id, &a.userID, "unclaimed return"); err != nil {
			return changed, err
		}
		a.sum.Returned++
		changed = true
		name, added, err := blacklistOrderCustomer(a.ctx, a.tx, id, &a.userID)
		if err != nil {
			return changed, err
		}
		if added {
			a.sum.Blacklisted++
			a.note("%s: %s", c.OrderNo, name)
		}
	}
	return changed, nil
}

// restockReturnedOrder puts the units that were deducted at shipment back into available stock, once per order and variant
// (the same stock_movements guard as ReturnReceived: a later manual "goods received" can never add them a second time).
func restockReturnedOrder(ctx context.Context, tx pgx.Tx, orderID int, userID *int, note string) error {
	rows, err := tx.Query(ctx, `SELECT variant_id, qty FROM stock_movements WHERE order_id=$1 AND event_type='shipment_deducted'`, orderID)
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
	for _, l := range lines {
		ct, err := tx.Exec(ctx, `
			INSERT INTO stock_movements (variant_id, order_id, bucket_from, bucket_to, qty, event_type, user_id, note)
			VALUES ($1,$2,'(returned)','available_stock',$3,'return_restocked',$4,$5)
			ON CONFLICT (order_id, variant_id, event_type)
			WHERE event_type IN ('shipment_deducted','return_restocked','return_broken') DO NOTHING`,
			l.variantID, orderID, l.qty, userID, note)
		if err != nil {
			return err
		}
		if ct.RowsAffected() != 1 {
			continue
		}
		if _, err := tx.Exec(ctx, `UPDATE stock_buckets SET available_stock = available_stock + $1 WHERE variant_id=$2`, l.qty, l.variantID); err != nil {
			return err
		}
		if err := reverseReturnCostTx(ctx, tx, orderID, l.variantID, l.qty, true); err != nil {
			return err
		}
	}
	return nil
}

// blacklistOrderCustomer adds the 'blacklist' label to the order's customer and to every customer record with the same phone number.
func blacklistOrderCustomer(ctx context.Context, tx pgx.Tx, orderID int, userID *int) (name string, added bool, err error) {
	var customerID int
	var phone string
	if err = tx.QueryRow(ctx, `SELECT c.id, c.name, COALESCE(c.phone,'') FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id=$1`, orderID).
		Scan(&customerID, &name, &phone); err != nil {
		return
	}
	digits := nonDigit.ReplaceAllString(phone, "")
	rows, err := tx.Query(ctx, `
		INSERT INTO customer_labels (customer_id, label)
		SELECT id, 'blacklist' FROM customers WHERE id = $1 OR ($2 <> '' AND regexp_replace(COALESCE(phone,''), '\D', '', 'g') = $2)
		ON CONFLICT DO NOTHING RETURNING customer_id`, customerID, digits)
	if err != nil {
		return
	}
	var ids []int
	for rows.Next() {
		var id int
		if rows.Scan(&id) == nil {
			ids = append(ids, id)
		}
	}
	rows.Close()
	for _, id := range ids {
		logActivity(ctx, tx, "customer", id, "label_added", userID, "blacklist (unclaimed return, order "+fmt.Sprint(orderID)+")")
	}
	return name, len(ids) > 0, nil
}
