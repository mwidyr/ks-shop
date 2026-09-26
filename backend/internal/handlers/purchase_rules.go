package handlers

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// purchaseRuleValues is the effective set of Purchase Rules for one product: its own override
// (product_purchase_rules) where set, falling back to the supplier's own defaults for anything
// left nil. Shared by Create Purchase Order and Replenishment Planning's Planned Order QTY, per
// spec ("Product-specific rules take priority over Supplier default rules").
type purchaseRuleValues struct {
	MinOrderQty       *int
	MinColorQty       *int
	MinOrderAmount    *float64
	OrderMultiple     *int
	MixedColorAllowed bool
	PackSetQty        *int
}

func coalesceInt(a, b *int) *int {
	if a != nil {
		return a
	}
	return b
}

func coalesceFloat(a, b *float64) *float64 {
	if a != nil {
		return a
	}
	return b
}

// resolvePurchaseRules looks up a product's supplier (for its defaults) and any product-level
// override, merging them per-field (product override wins where set).
func resolvePurchaseRules(ctx context.Context, db *pgxpool.Pool, productID int) purchaseRuleValues {
	var rules purchaseRuleValues
	var supplierID *int
	db.QueryRow(ctx, `SELECT supplier_id FROM products WHERE id=$1`, productID).Scan(&supplierID)

	var supMinOrderQty, supMinColorQty, supOrderMultiple, supPackSetQty *int
	var supMinOrderAmount *float64
	var supMixedColor bool
	if supplierID != nil {
		db.QueryRow(ctx, `
			SELECT min_order_qty, min_color_qty, min_order_amount, order_multiple, mixed_color_allowed, pack_set_qty
			FROM suppliers WHERE id=$1`, *supplierID).
			Scan(&supMinOrderQty, &supMinColorQty, &supMinOrderAmount, &supOrderMultiple, &supMixedColor, &supPackSetQty)
	}
	rules.MixedColorAllowed = supMixedColor

	var prMinOrderQty, prMinColorQty, prOrderMultiple, prPackSetQty *int
	var prMinOrderAmount *float64
	var prMixedColor *bool
	if err := db.QueryRow(ctx, `
		SELECT min_order_qty, min_color_qty, min_order_amount, order_multiple, mixed_color_allowed, pack_set_qty
		FROM product_purchase_rules WHERE product_id=$1`, productID).
		Scan(&prMinOrderQty, &prMinColorQty, &prMinOrderAmount, &prOrderMultiple, &prMixedColor, &prPackSetQty); err == nil {
		if prMixedColor != nil {
			rules.MixedColorAllowed = *prMixedColor
		}
	}

	rules.MinOrderQty = coalesceInt(prMinOrderQty, supMinOrderQty)
	rules.MinColorQty = coalesceInt(prMinColorQty, supMinColorQty)
	rules.MinOrderAmount = coalesceFloat(prMinOrderAmount, supMinOrderAmount)
	rules.OrderMultiple = coalesceInt(prOrderMultiple, supOrderMultiple)
	rules.PackSetQty = coalesceInt(prPackSetQty, supPackSetQty)
	return rules
}

// checkPurchaseRule validates one product/color line's qty and amount against the effective
// rules, returning a human-readable warning (or "" if nothing is violated). Never blocking -
// this is guidance only, per spec ("the Supplier may occasionally accept an exception").
func checkPurchaseRule(rules purchaseRuleValues, qty int, amount float64) string {
	if rules.MinOrderQty != nil && qty < *rules.MinOrderQty {
		return fmt.Sprintf("Minimum order quantity for this product is %d pcs.", *rules.MinOrderQty)
	}
	if rules.MinColorQty != nil && qty < *rules.MinColorQty {
		return fmt.Sprintf("Minimum order quantity for this color is %d pcs.", *rules.MinColorQty)
	}
	if rules.MinOrderAmount != nil && amount < *rules.MinOrderAmount {
		return fmt.Sprintf("Minimum order amount is %.0f.", *rules.MinOrderAmount)
	}
	if rules.OrderMultiple != nil && *rules.OrderMultiple > 0 && qty%*rules.OrderMultiple != 0 {
		return fmt.Sprintf("Order quantity must be a multiple of %d.", *rules.OrderMultiple)
	}
	if rules.PackSetQty != nil && *rules.PackSetQty > 0 && qty%*rules.PackSetQty != 0 {
		return fmt.Sprintf("Order quantity must be a multiple of the pack/set size (%d).", *rules.PackSetQty)
	}
	return ""
}
