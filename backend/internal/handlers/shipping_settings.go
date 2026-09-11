package handlers

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ShippingSettingsHandler manages the free-shipping thresholds and flat home-delivery fee
// (per-chain base/target fee lives on pickup_chains itself, edited via that CRUD instead).
type ShippingSettingsHandler struct {
	DB *pgxpool.Pool
}

type shippingSettings struct {
	FreeShippingThresholdMinimarket float64 `json:"free_shipping_threshold_minimarket"`
	FreeShippingThresholdPos        float64 `json:"free_shipping_threshold_pos"`
	HomeDeliveryFlatFee             float64 `json:"home_delivery_flat_fee"`
}

func (h *ShippingSettingsHandler) Get(w http.ResponseWriter, r *http.Request) {
	rows, err := h.DB.Query(r.Context(), `
		SELECT key, value FROM app_settings
		WHERE key IN ('free_shipping_threshold_minimarket','free_shipping_threshold_pos','home_delivery_flat_fee')`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load shipping settings")
		return
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
	respondJSON(w, http.StatusOK, shippingSettings{
		FreeShippingThresholdMinimarket: values["free_shipping_threshold_minimarket"],
		FreeShippingThresholdPos:        values["free_shipping_threshold_pos"],
		HomeDeliveryFlatFee:             values["home_delivery_flat_fee"],
	})
}

func (h *ShippingSettingsHandler) Update(w http.ResponseWriter, r *http.Request) {
	var req shippingSettings
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	values := map[string]float64{
		"free_shipping_threshold_minimarket": req.FreeShippingThresholdMinimarket,
		"free_shipping_threshold_pos":        req.FreeShippingThresholdPos,
		"home_delivery_flat_fee":             req.HomeDeliveryFlatFee,
	}
	for key, value := range values {
		if _, err := h.DB.Exec(r.Context(), `
			INSERT INTO app_settings (key, value) VALUES ($1,$2)
			ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, key, value); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to save shipping settings")
			return
		}
	}
	respondJSON(w, http.StatusOK, req)
}
