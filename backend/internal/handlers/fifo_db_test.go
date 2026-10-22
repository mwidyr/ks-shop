package handlers

import (
	"context"
	"math"
	"strconv"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
)

// TestFIFOAgainstDatabase walks the whole FIFO life cycle (#127-#133) inside one transaction that
// is rolled back. Runs only with TEST_DATABASE_URL (see liveTestDB).
func TestFIFOAgainstDatabase(t *testing.T) {
	db := liveTestDB(t)
	ctx := context.Background()
	tx, err := db.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)

	must := func(err error) {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
	}
	num := func(q string, args ...any) float64 {
		t.Helper()
		var v float64
		must(tx.QueryRow(ctx, q, args...).Scan(&v))
		return v
	}
	near := func(name string, got, want float64) {
		t.Helper()
		if math.Abs(got-want) > 0.005 {
			t.Fatalf("%s = %v, want %v", name, got, want)
		}
	}

	// Start from "FIFO not live" whatever the database holds (rolled back with the rest).
	_, err = tx.Exec(ctx, `UPDATE opening_inventory_imports SET status='rejected' WHERE status='approved'`)
	must(err)

	var userID, supplierID, productID, variantID int
	must(tx.QueryRow(ctx, `SELECT id FROM users ORDER BY id LIMIT 1`).Scan(&userID))
	must(tx.QueryRow(ctx, `INSERT INTO suppliers (name) VALUES ('T-FIFO supplier') RETURNING id`).Scan(&supplierID))
	must(tx.QueryRow(ctx, `INSERT INTO products (name) VALUES ('T-FIFO product') RETURNING id`).Scan(&productID))
	must(tx.QueryRow(ctx, `INSERT INTO product_variants (product_id, sku, price) VALUES ($1, $2, 500) RETURNING id`, productID, "T-FIFO-"+strconv.Itoa(productID)).Scan(&variantID))
	_, err = tx.Exec(ctx, `INSERT INTO stock_buckets (variant_id) VALUES ($1) ON CONFLICT DO NOTHING`, variantID)
	must(err)

	// #126/#133: creating the PO (ordered = finalized) sets the product's RMB default cost + history.
	purchaseID, err := createPurchaseTx(ctx, tx, supplierID, "2026-10-01", "", "t", userID,
		[]createPurchaseItem{{VariantID: variantID, Qty: 10, UnitCost: 20}}, purchaseAdjustments{ShippingAmount: 20})
	must(err)
	near("cost_rmb", num(`SELECT cost_rmb FROM products WHERE id=$1`, productID), 20)
	near("history rows", num(`SELECT COUNT(*) FROM product_cost_history WHERE product_id=$1 AND purchase_id=$2`, productID, purchaseID), 1)
	var itemID, batch1 int
	must(tx.QueryRow(ctx, `SELECT pi.id, b.id FROM purchase_items pi JOIN purchase_item_batches b ON b.purchase_item_id = pi.id WHERE pi.purchase_id=$1`, purchaseID).Scan(&itemID, &batch1))

	// FIFO not live yet: receiving makes no layer and needs no exchange rate.
	must(tx.QueryRow(ctx, `UPDATE purchase_item_batches SET planned_qty=4 WHERE id=$1 RETURNING id`, batch1).Scan(&batch1))
	if msg := confirmBatchTx(ctx, tx, batch1, 4, userID); msg != "" {
		t.Fatal(msg)
	}
	near("layers before go-live", num(`SELECT COUNT(*) FROM cost_layers WHERE variant_id=$1`, variantID), 0)

	// #132 go-live: an approved opening import with 5 units at RMB 10 x 4.5.
	var importID, lineID int
	must(tx.QueryRow(ctx, `INSERT INTO opening_inventory_imports (status, approved_at) VALUES ('approved', now()) RETURNING id`).Scan(&importID))
	must(tx.QueryRow(ctx, `INSERT INTO opening_inventory_lines (import_id, row_no, sku, variant_id, qty, unit_cost_rmb, exchange_rate)
		VALUES ($1,1,'x',$2,5,10,4.5) RETURNING id`, importID, variantID).Scan(&lineID))
	var openingLayer int64
	must(tx.QueryRow(ctx, `INSERT INTO cost_layers (variant_id, source, opening_line_id, qty_in, qty_remaining, unit_cost_rmb, exchange_rate, unit_cost_twd, received_at)
		VALUES ($1,'opening',$2,5,5,10,4.5,45, now() - interval '1 day') RETURNING id`, variantID, lineID).Scan(&openingLayer))

	// #127: once live, receiving needs the PO's exchange rate...
	var batch2 int
	must(tx.QueryRow(ctx, `INSERT INTO purchase_item_batches (purchase_item_id, batch_no, planned_qty) VALUES ($1, 2, 6) RETURNING id`, itemID).Scan(&batch2))
	sp, err := tx.Begin(ctx)
	must(err)
	if msg := confirmBatchTx(ctx, sp, batch2, 6, userID); !strings.Contains(msg, "exchange rate") {
		t.Fatalf("expected the exchange-rate message, got %q", msg)
	}
	must(sp.Rollback(ctx))
	// ...and then values the layer at the landed cost: 20 x (1 + 20/200) = 22 RMB x 4.4 = 96.8 TWD.
	_, err = tx.Exec(ctx, `UPDATE purchases SET exchange_rate=4.4 WHERE id=$1`, purchaseID)
	must(err)
	if msg := confirmBatchTx(ctx, tx, batch2, 6, userID); msg != "" {
		t.Fatal(msg)
	}
	var receiptLayer int64
	must(tx.QueryRow(ctx, `SELECT id FROM cost_layers WHERE purchase_item_batch_id=$1`, batch2).Scan(&receiptLayer))
	near("receipt layer TWD", num(`SELECT unit_cost_twd FROM cost_layers WHERE id=$1`, receiptLayer), 96.8)
	near("receipt layer RMB", num(`SELECT unit_cost_rmb FROM cost_layers WHERE id=$1`, receiptLayer), 22)

	var customerID, chainID int
	must(tx.QueryRow(ctx, `SELECT id FROM customers ORDER BY id LIMIT 1`).Scan(&customerID))
	must(tx.QueryRow(ctx, `SELECT id FROM pickup_chains ORDER BY id LIMIT 1`).Scan(&chainID))
	newOrder := func(no string, qty int) (int, int) {
		t.Helper()
		var oid, oiid int
		must(tx.QueryRow(ctx, `INSERT INTO orders (order_no, customer_id, pickup_chain_id) VALUES ($1,$2,$3) RETURNING id`, no, customerID, chainID).Scan(&oid))
		must(tx.QueryRow(ctx, `INSERT INTO order_items (order_id, variant_id, qty, price_at_order) VALUES ($1,$2,$3,500) RETURNING id`, oid, variantID, qty).Scan(&oiid))
		return oid, oiid
	}
	move := func(tx pgx.Tx, orderID int, from, to string) {
		t.Helper()
		must(applyStatusChange(ctx, tx, orderID, from, to, &userID, "test"))
	}
	remaining := func(id int64) float64 {
		return num(`SELECT qty_remaining FROM cost_layers WHERE id=$1`, id)
	}

	// #128/#129: export reserves oldest first (5 opening + 2 receipt); a second call takes nothing.
	orderA, itemA := newOrder("T-FIFO-A", 7)
	move(tx, orderA, "pending", "processing")
	must(reserveOrderCostTx(ctx, tx, orderA))
	near("opening remaining", remaining(openingLayer), 0)
	near("receipt remaining", remaining(receiptLayer), 4)
	near("reserved units", num(`SELECT SUM(qty) FROM cost_allocations WHERE order_id=$1 AND state='reserved'`, orderA), 7)

	// #130: confirmed shipment fixes COGS = 5 x 45 + 2 x 96.8; finalizing again changes nothing.
	move(tx, orderA, "processing", "ready_to_ship")
	move(tx, orderA, "ready_to_ship", "shipped")
	must(finalizeOrderCostTx(ctx, tx, orderA))
	near("cogs", num(`SELECT cogs_twd FROM order_items WHERE id=$1`, itemA), 418.6)
	near("final units", num(`SELECT SUM(qty) FROM cost_allocations WHERE order_id=$1 AND state='final'`, orderA), 7)
	// a later, pricier purchase never changes it
	_, err = tx.Exec(ctx, `UPDATE cost_layers SET unit_cost_twd = 999 WHERE id=$1`, receiptLayer)
	must(err)
	near("cogs after price change", num(`SELECT cogs_twd FROM order_items WHERE id=$1`, itemA), 418.6)
	_, err = tx.Exec(ctx, `UPDATE cost_layers SET unit_cost_twd = 96.8 WHERE id=$1`, receiptLayer)
	must(err)

	// #131: 3 sellable units go back (newest layer first: 2 receipt + 1 opening), 1 broken is written off.
	move(tx, orderA, "shipped", "return")
	must(reverseReturnCostTx(ctx, tx, orderA, variantID, 3, true))
	near("receipt remaining after return", remaining(receiptLayer), 6)
	near("opening remaining after return", remaining(openingLayer), 1)
	must(reverseReturnCostTx(ctx, tx, orderA, variantID, 1, false))
	near("opening remaining after broken", remaining(openingLayer), 1)
	near("reversed cost", num(`SELECT cogs_reversed_twd FROM order_items WHERE id=$1`, itemA), 2*96.8+45+45)
	near("still final", num(`SELECT SUM(qty) FROM cost_allocations WHERE order_id=$1 AND state='final'`, orderA), 3)
	near("written off", num(`SELECT SUM(qty) FROM cost_allocations WHERE order_id=$1 AND state='written_off'`, orderA), 1)

	// #131: cancelling before shipment gives the reservation back.
	orderB, _ := newOrder("T-FIFO-B", 4)
	move(tx, orderB, "pending", "processing")
	near("receipt remaining while reserved", remaining(receiptLayer)+remaining(openingLayer), 3)
	move(tx, orderB, "processing", "cancelled")
	near("receipt remaining after cancel", remaining(receiptLayer)+remaining(openingLayer), 7)
	near("released", num(`SELECT SUM(qty) FROM cost_allocations WHERE order_id=$1 AND state='released'`, orderB), 4)

	// Oversold: what no layer covers is counted, and covered at shipment if stock arrived meanwhile.
	orderC, itemC := newOrder("T-FIFO-C", 9)
	move(tx, orderC, "pending", "processing")
	near("uncosted", num(`SELECT cogs_uncosted_qty FROM order_items WHERE id=$1`, itemC), 2)
	_, err = tx.Exec(ctx, `INSERT INTO cost_layers (variant_id, source, qty_in, qty_remaining, unit_cost_rmb, exchange_rate, unit_cost_twd) VALUES ($1,'receipt',5,5,30,4,120)`, variantID)
	must(err)
	move(tx, orderC, "processing", "ready_to_ship")
	move(tx, orderC, "ready_to_ship", "shipped")
	near("uncosted after shipment", num(`SELECT cogs_uncosted_qty FROM order_items WHERE id=$1`, itemC), 0)
	near("final units C", num(`SELECT SUM(qty) FROM cost_allocations WHERE order_id=$1 AND state='final'`, orderC), 9)
}
