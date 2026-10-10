package handlers

import (
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// StoreSettingsHandler manages shop-facing branding (currently just the shop name) so it can be
// changed from the UI instead of requiring a code deploy. Get is public (no auth) since the
// login page itself needs the real name before any session exists; Update is gated by the
// existing store_profile tab permission, same as the rest of that page.
type StoreSettingsHandler struct {
	DB *pgxpool.Pool
}

type storeSettings struct {
	ShopName string `json:"shop_name"`
}

func (h *StoreSettingsHandler) Get(w http.ResponseWriter, r *http.Request) {
	var name string
	err := h.DB.QueryRow(r.Context(), `SELECT value FROM store_settings WHERE key='shop_name'`).Scan(&name)
	if err != nil {
		name = "Ohlala Shop"
	}
	respondJSON(w, http.StatusOK, storeSettings{ShopName: name})
}

func (h *StoreSettingsHandler) Update(w http.ResponseWriter, r *http.Request) {
	var req storeSettings
	if err := decodeJSON(r, &req); err != nil || req.ShopName == "" {
		respondError(w, http.StatusBadRequest, "shop_name is required")
		return
	}
	if _, err := h.DB.Exec(r.Context(), `
		INSERT INTO store_settings (key, value) VALUES ('shop_name', $1)
		ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, req.ShopName); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save shop name")
		return
	}
	respondJSON(w, http.StatusOK, req)
}

type websiteLaunchSettings struct {
	WebsiteLaunchDate string `json:"website_launch_date"` // yyyy-mm-dd, "" = not set
}

// GetWebsiteLaunch returns the manually entered website launch date (the start of the Website's
// Active Operating Days used by the Performance AVG calculations).
func (h *StoreSettingsHandler) GetWebsiteLaunch(w http.ResponseWriter, r *http.Request) {
	var v string
	_ = h.DB.QueryRow(r.Context(), `SELECT value FROM store_settings WHERE key='website_launch_date'`).Scan(&v)
	respondJSON(w, http.StatusOK, websiteLaunchSettings{WebsiteLaunchDate: v})
}

// UpdateWebsiteLaunch saves (or clears, with "") the website launch date.
func (h *StoreSettingsHandler) UpdateWebsiteLaunch(w http.ResponseWriter, r *http.Request) {
	var req websiteLaunchSettings
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request")
		return
	}
	if req.WebsiteLaunchDate == "" {
		if _, err := h.DB.Exec(r.Context(), `DELETE FROM store_settings WHERE key='website_launch_date'`); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to clear launch date")
			return
		}
		respondJSON(w, http.StatusOK, req)
		return
	}
	if _, err := time.Parse("2006-01-02", req.WebsiteLaunchDate); err != nil {
		respondError(w, http.StatusBadRequest, "website_launch_date must be yyyy-mm-dd")
		return
	}
	if _, err := h.DB.Exec(r.Context(), `
		INSERT INTO store_settings (key, value) VALUES ('website_launch_date', $1)
		ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, req.WebsiteLaunchDate); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save launch date")
		return
	}
	respondJSON(w, http.StatusOK, req)
}
