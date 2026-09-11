package handlers

import (
	"context"

	"github.com/jackc/pgx/v5"
)

// queryRower is satisfied by both pgxpool.Pool and pgx.Tx, so ComputeShippingFee can run either
// standalone or inside an existing order-creation transaction.
type queryRower interface {
	QueryRow(ctx context.Context, sql string, args ...interface{}) pgx.Row
	Query(ctx context.Context, sql string, args ...interface{}) (pgx.Rows, error)
}

// ComputeShippingFee resolves the actual shipping fee for an order: 0 if overridden or the
// subtotal clears the relevant free-shipping threshold, otherwise the chain's fee. "Alamat
// Customer" (home delivery) and "Lainnya" use the flat home_delivery_flat_fee setting since
// their per-chain target_fee is always 0 (no fixed courier rate to reference); minimarket
// chains (7-Eleven/FamilyMart) use their own seller-set target_fee. Chain type is inferred by
// name since pickup_chains has no separate category column.
func ComputeShippingFee(ctx context.Context, db queryRower, pickupChainID int, subtotal float64, override bool) (float64, error) {
	if override {
		return 0, nil
	}

	var chainName string
	var targetFee float64
	if err := db.QueryRow(ctx, `SELECT name, target_fee FROM pickup_chains WHERE id=$1`, pickupChainID).
		Scan(&chainName, &targetFee); err != nil {
		return 0, err
	}

	values, err := loadShippingFeeSettings(ctx, db)
	if err != nil {
		return 0, err
	}

	switch chainName {
	case "Alamat Customer", "Lainnya":
		if values["free_shipping_threshold_pos"] > 0 && subtotal >= values["free_shipping_threshold_pos"] {
			return 0, nil
		}
		return values["home_delivery_flat_fee"], nil
	default:
		if values["free_shipping_threshold_minimarket"] > 0 && subtotal >= values["free_shipping_threshold_minimarket"] {
			return 0, nil
		}
		return targetFee, nil
	}
}

func loadShippingFeeSettings(ctx context.Context, db queryRower) (map[string]float64, error) {
	rows, err := db.Query(ctx, `
		SELECT key, value FROM app_settings
		WHERE key IN ('free_shipping_threshold_minimarket','free_shipping_threshold_pos','home_delivery_flat_fee')`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	values := map[string]float64{}
	for rows.Next() {
		var key string
		var value float64
		if err := rows.Scan(&key, &value); err != nil {
			continue
		}
		values[key] = value
	}
	return values, nil
}
