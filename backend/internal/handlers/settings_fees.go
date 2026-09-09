package handlers

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
)

type FeeSettingsHandler struct {
	DB *pgxpool.Pool
}

type feeSettings struct {
	PlatformFeePct      float64 `json:"platform_fee_pct"`
	PaymentFeePct       float64 `json:"payment_fee_pct"`
	ShippingSubsidyFlat float64 `json:"shipping_subsidy_flat"`
	AdCostFlat          float64 `json:"ad_cost_flat"`
}

// loadFeeSettings reads the current fee assumptions from app_settings; also used by
// dashboard.go's Profit handler so both read the exact same configured values.
func loadFeeSettings(r *http.Request, db *pgxpool.Pool) (feeSettings, error) {
	rows, err := db.Query(r.Context(), `SELECT key, value FROM app_settings`)
	if err != nil {
		return feeSettings{}, err
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
	return feeSettings{
		PlatformFeePct:      values["platform_fee_pct"],
		PaymentFeePct:       values["payment_fee_pct"],
		ShippingSubsidyFlat: values["shipping_subsidy_flat"],
		AdCostFlat:          values["ad_cost_flat"],
	}, nil
}

// Get returns the current fee assumptions Profit Analytics uses.
func (h *FeeSettingsHandler) Get(w http.ResponseWriter, r *http.Request) {
	settings, err := loadFeeSettings(r, h.DB)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load fee settings")
		return
	}
	respondJSON(w, http.StatusOK, settings)
}

// Update overwrites the fee assumptions.
func (h *FeeSettingsHandler) Update(w http.ResponseWriter, r *http.Request) {
	var req feeSettings
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	values := map[string]float64{
		"platform_fee_pct":      req.PlatformFeePct,
		"payment_fee_pct":       req.PaymentFeePct,
		"shipping_subsidy_flat": req.ShippingSubsidyFlat,
		"ad_cost_flat":          req.AdCostFlat,
	}
	for key, value := range values {
		if _, err := h.DB.Exec(r.Context(), `
			INSERT INTO app_settings (key, value) VALUES ($1,$2)
			ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, key, value); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to save fee settings")
			return
		}
	}
	respondJSON(w, http.StatusOK, req)
}
