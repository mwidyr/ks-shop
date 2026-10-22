package handlers

import (
	"context"
	"math"

	"github.com/jackc/pgx/v5"
)

// FIFO costing (Adjust #127-#132, schema in 105_fifo_cost.sql). Costs are valued in TWD in the
// background only - purchasing itself stays in RMB everywhere in the ERP.
//
//	receipt             a received delivery batch becomes a cost layer (addReceiptLayerTx)
//	pending->processing the shipping Excel is exported: each order item reserves its units from
//	                    the oldest layers (reserveOrderCostTx)
//	->shipped           the 3PL confirms shipment: reservations become the item's final COGS
//	                    (finalizeOrderCostTx)
//	->cancelled         before shipment: reservations go back to their layers (releaseOrderCostTx)
//	return received     the item's cost is reversed; sellable units go back to their layer
//	                    (reverseReturnCostTx)
//
// Every step is idempotent: re-exports, failed uploads, repeated imports and retries never take
// units twice. Nothing happens until FIFO goes live (the first approved opening inventory import).

type fifoLayer struct {
	ID          int64
	Remaining   int
	UnitCostTWD float64
}

type layerTake struct {
	LayerID     int64
	Qty         int
	UnitCostTWD float64
}

// planFIFO takes qty units from layers in the given (oldest first) order. short is what no layer
// could cover.
func planFIFO(layers []fifoLayer, qty int) (takes []layerTake, short int) {
	for _, l := range layers {
		if qty <= 0 {
			break
		}
		n := min(l.Remaining, qty)
		if n <= 0 {
			continue
		}
		takes = append(takes, layerTake{LayerID: l.ID, Qty: n, UnitCostTWD: l.UnitCostTWD})
		qty -= n
	}
	return takes, max(qty, 0)
}

type finalAlloc struct {
	ID          int64
	OrderItemID int
	LayerID     int64
	Qty         int
	UnitCostTWD float64
}

type reversalStep struct {
	Alloc finalAlloc
	Qty   int // units of Alloc to reverse (== Alloc.Qty means the whole row)
}

// planReversal picks which final allocations a return of qty units reverses, in the given order
// (newest layer first).
func planReversal(allocs []finalAlloc, qty int) []reversalStep {
	var steps []reversalStep
	for _, a := range allocs {
		if qty <= 0 {
			break
		}
		n := min(a.Qty, qty)
		steps = append(steps, reversalStep{Alloc: a, Qty: n})
		qty -= n
	}
	return steps
}

// landedUnitCost spreads a PO's whole-order adjustment (shipping + extra - discount) over its lines
// pro rata by line value, so the lines add up to the supplier invoice. With no line value at all
// (every unit cost 0) it is spread per unit instead.
func landedUnitCost(unitCost float64, totalValue float64, totalQty int, adjustment float64) float64 {
	switch {
	case totalValue > 0:
		return unitCost * (1 + adjustment/totalValue)
	case totalQty > 0:
		return unitCost + adjustment/float64(totalQty)
	}
	return unitCost
}

func round2(v float64) float64 { return math.Round(v*100) / 100 }

// fifoActive: FIFO starts with the first approved opening inventory import (#132).
func fifoActive(ctx context.Context, tx pgx.Tx) (bool, error) {
	var ok bool
	err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM opening_inventory_imports WHERE status='approved')`).Scan(&ok)
	return ok, err
}

// purchaseLandedCosts returns the landed RMB unit cost per purchase item id of a PO.
func purchaseLandedCosts(ctx context.Context, tx pgx.Tx, purchaseID int) (map[int]float64, error) {
	var adjustment float64
	if err := tx.QueryRow(ctx, `SELECT shipping_amount + extra_amount - discount_amount FROM purchases WHERE id=$1`, purchaseID).Scan(&adjustment); err != nil {
		return nil, err
	}
	rows, err := tx.Query(ctx, `SELECT id, qty, unit_cost FROM purchase_items WHERE purchase_id=$1`, purchaseID)
	if err != nil {
		return nil, err
	}
	type line struct {
		id, qty int
		cost    float64
	}
	var lines []line
	var totalValue float64
	var totalQty int
	for rows.Next() {
		var l line
		if err := rows.Scan(&l.id, &l.qty, &l.cost); err != nil {
			rows.Close()
			return nil, err
		}
		lines = append(lines, l)
		totalValue += float64(l.qty) * l.cost
		totalQty += l.qty
	}
	rows.Close()
	out := make(map[int]float64, len(lines))
	for _, l := range lines {
		out[l.id] = landedUnitCost(l.cost, totalValue, totalQty, adjustment)
	}
	return out, rows.Err()
}

// addReceiptLayerTx creates the cost layer for one received delivery batch (#127). It needs the
// PO's exchange rate once FIFO is live; returns a user-facing message when that is missing.
func addReceiptLayerTx(ctx context.Context, tx pgx.Tx, batchID, purchaseID, itemID, variantID, qty int) (string, error) {
	active, err := fifoActive(ctx, tx)
	if err != nil || !active {
		return "", err
	}
	var rate *float64
	if err := tx.QueryRow(ctx, `SELECT exchange_rate FROM purchases WHERE id=$1`, purchaseID).Scan(&rate); err != nil {
		return "", err
	}
	if rate == nil || *rate <= 0 {
		return "enter the PO's RMB to TWD exchange rate before receiving goods (needed for FIFO cost)", nil
	}
	landed, err := purchaseLandedCosts(ctx, tx, purchaseID)
	if err != nil {
		return "", err
	}
	unitRMB := landed[itemID]
	_, err = tx.Exec(ctx, `
		INSERT INTO cost_layers (variant_id, source, purchase_item_batch_id, qty_in, qty_remaining, unit_cost_rmb, exchange_rate, unit_cost_twd)
		VALUES ($1,'receipt',$2,$3,$3,$4,$5,$6)
		ON CONFLICT (purchase_item_batch_id) DO NOTHING`,
		variantID, batchID, qty, unitRMB, *rate, unitRMB**rate)
	return "", err
}

// takeFromLayersTx allocates qty units of a variant from its oldest open layers (locked), lowering
// their qty_remaining.
func takeFromLayersTx(ctx context.Context, tx pgx.Tx, variantID, qty int) ([]layerTake, int, error) {
	rows, err := tx.Query(ctx, `
		SELECT id, qty_remaining, unit_cost_twd FROM cost_layers
		WHERE variant_id=$1 AND qty_remaining > 0 ORDER BY received_at, id FOR UPDATE`, variantID)
	if err != nil {
		return nil, 0, err
	}
	var layers []fifoLayer
	for rows.Next() {
		var l fifoLayer
		if err := rows.Scan(&l.ID, &l.Remaining, &l.UnitCostTWD); err != nil {
			rows.Close()
			return nil, 0, err
		}
		layers = append(layers, l)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	takes, short := planFIFO(layers, qty)
	for _, t := range takes {
		if _, err := tx.Exec(ctx, `UPDATE cost_layers SET qty_remaining = qty_remaining - $1 WHERE id=$2`, t.Qty, t.LayerID); err != nil {
			return nil, 0, err
		}
	}
	return takes, short, nil
}

func insertAllocationsTx(ctx context.Context, tx pgx.Tx, orderID, itemID, variantID int, takes []layerTake, state string) error {
	for _, t := range takes {
		if _, err := tx.Exec(ctx, `
			INSERT INTO cost_allocations (order_id, order_item_id, variant_id, layer_id, qty, unit_cost_twd, state)
			VALUES ($1,$2,$3,$4,$5,$6,$7)`, orderID, itemID, variantID, t.LayerID, t.Qty, t.UnitCostTWD, state); err != nil {
			return err
		}
	}
	return nil
}

type costItem struct {
	ID, VariantID, Qty, Uncosted int
	Reserved                     bool
}

func loadCostItemsTx(ctx context.Context, tx pgx.Tx, orderID int, cond string) ([]costItem, error) {
	rows, err := tx.Query(ctx, `
		SELECT id, variant_id, qty, cogs_uncosted_qty, cost_reserved_at IS NOT NULL
		FROM order_items WHERE order_id=$1 AND `+cond+` ORDER BY id FOR UPDATE`, orderID)
	if err != nil {
		return nil, err
	}
	var items []costItem
	for rows.Next() {
		var it costItem
		if err := rows.Scan(&it.ID, &it.VariantID, &it.Qty, &it.Uncosted, &it.Reserved); err != nil {
			rows.Close()
			return nil, err
		}
		items = append(items, it)
	}
	rows.Close()
	return items, rows.Err()
}

// reserveOrderCostTx reserves FIFO cost for an order's items when its shipping Excel is first
// exported (#129). Items already reserved or costed are skipped.
func reserveOrderCostTx(ctx context.Context, tx pgx.Tx, orderID int) error {
	if active, err := fifoActive(ctx, tx); err != nil || !active {
		return err
	}
	items, err := loadCostItemsTx(ctx, tx, orderID, `cost_reserved_at IS NULL AND cogs_finalized_at IS NULL`)
	if err != nil {
		return err
	}
	for _, it := range items {
		takes, short, err := takeFromLayersTx(ctx, tx, it.VariantID, it.Qty)
		if err != nil {
			return err
		}
		if err := insertAllocationsTx(ctx, tx, orderID, it.ID, it.VariantID, takes, "reserved"); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE order_items SET cost_reserved_at=now(), cogs_uncosted_qty=$1 WHERE id=$2`, short, it.ID); err != nil {
			return err
		}
	}
	return nil
}

// finalizeOrderCostTx fixes each item's COGS once the shipment is confirmed (#129, #130): its
// reservation becomes final, and units nothing covered yet (or an item never reserved) are taken
// from the layers now. The saved cogs_twd never changes afterwards.
func finalizeOrderCostTx(ctx context.Context, tx pgx.Tx, orderID int) error {
	if active, err := fifoActive(ctx, tx); err != nil || !active {
		return err
	}
	items, err := loadCostItemsTx(ctx, tx, orderID, `cogs_finalized_at IS NULL`)
	if err != nil {
		return err
	}
	for _, it := range items {
		need := it.Uncosted
		if !it.Reserved {
			need = it.Qty
		}
		short := 0
		if need > 0 {
			var takes []layerTake
			if takes, short, err = takeFromLayersTx(ctx, tx, it.VariantID, need); err != nil {
				return err
			}
			if err := insertAllocationsTx(ctx, tx, orderID, it.ID, it.VariantID, takes, "final"); err != nil {
				return err
			}
		}
		if _, err := tx.Exec(ctx, `UPDATE cost_allocations SET state='final', updated_at=now() WHERE order_item_id=$1 AND state='reserved'`, it.ID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			UPDATE order_items SET
			    cogs_twd = ROUND(COALESCE((SELECT SUM(qty * unit_cost_twd) FROM cost_allocations WHERE order_item_id=$1 AND state='final'), 0), 2),
			    cogs_uncosted_qty = $2, cost_reserved_at = COALESCE(cost_reserved_at, now()), cogs_finalized_at = now()
			WHERE id=$1`, it.ID, short); err != nil {
			return err
		}
	}
	return nil
}

// releaseOrderCostTx gives an order's reserved (not yet shipped) units back to their layers when
// it is cancelled before shipment (#131).
func releaseOrderCostTx(ctx context.Context, tx pgx.Tx, orderID int) error {
	rows, err := tx.Query(ctx, `
		SELECT layer_id, SUM(qty) FROM cost_allocations WHERE order_id=$1 AND state='reserved' GROUP BY layer_id`, orderID)
	if err != nil {
		return err
	}
	type back struct {
		layerID int64
		qty     int
	}
	var backs []back
	for rows.Next() {
		var b back
		if err := rows.Scan(&b.layerID, &b.qty); err != nil {
			rows.Close()
			return err
		}
		backs = append(backs, b)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	for _, b := range backs {
		if _, err := tx.Exec(ctx, `UPDATE cost_layers SET qty_remaining = qty_remaining + $1 WHERE id=$2`, b.qty, b.layerID); err != nil {
			return err
		}
	}
	_, err = tx.Exec(ctx, `UPDATE cost_allocations SET state='released', updated_at=now() WHERE order_id=$1 AND state='reserved'`, orderID)
	return err
}

// reverseReturnCostTx reverses the original cost of qty returned units of a variant (#131),
// newest layer first. restock=true (sellable) puts the units back into their layer; broken units
// are written off. The caller runs this once per (order, variant, kind) - see ReturnReceived.
func reverseReturnCostTx(ctx context.Context, tx pgx.Tx, orderID, variantID, qty int, restock bool) error {
	rows, err := tx.Query(ctx, `
		SELECT a.id, a.order_item_id, a.layer_id, a.qty, a.unit_cost_twd
		FROM cost_allocations a JOIN cost_layers l ON l.id = a.layer_id
		WHERE a.order_id=$1 AND a.variant_id=$2 AND a.state='final'
		ORDER BY l.received_at DESC, l.id DESC, a.id DESC FOR UPDATE OF a`, orderID, variantID)
	if err != nil {
		return err
	}
	var allocs []finalAlloc
	for rows.Next() {
		var a finalAlloc
		if err := rows.Scan(&a.ID, &a.OrderItemID, &a.LayerID, &a.Qty, &a.UnitCostTWD); err != nil {
			rows.Close()
			return err
		}
		allocs = append(allocs, a)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	state := "written_off"
	if restock {
		state = "returned"
	}
	for _, s := range planReversal(allocs, qty) {
		a := s.Alloc
		if s.Qty == a.Qty {
			if _, err := tx.Exec(ctx, `UPDATE cost_allocations SET state=$1, updated_at=now() WHERE id=$2`, state, a.ID); err != nil {
				return err
			}
		} else {
			if _, err := tx.Exec(ctx, `UPDATE cost_allocations SET qty = qty - $1, updated_at=now() WHERE id=$2`, s.Qty, a.ID); err != nil {
				return err
			}
			if _, err := tx.Exec(ctx, `
				INSERT INTO cost_allocations (order_id, order_item_id, variant_id, layer_id, qty, unit_cost_twd, state)
				VALUES ($1,$2,$3,$4,$5,$6,$7)`, orderID, a.OrderItemID, variantID, a.LayerID, s.Qty, a.UnitCostTWD, state); err != nil {
				return err
			}
		}
		if restock {
			if _, err := tx.Exec(ctx, `UPDATE cost_layers SET qty_remaining = qty_remaining + $1 WHERE id=$2`, s.Qty, a.LayerID); err != nil {
				return err
			}
		}
		if _, err := tx.Exec(ctx, `UPDATE order_items SET cogs_reversed_twd = cogs_reversed_twd + $1 WHERE id=$2`,
			round2(float64(s.Qty)*a.UnitCostTWD), a.OrderItemID); err != nil {
			return err
		}
	}
	return nil
}
