package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PickupChainHandler manages minimarket/pickup fulfillment chains (Indomaret, Alfamart,
// Kantor Pos, Lainnya) - this replaced courier-delivery as the app's fulfillment model.
type PickupChainHandler struct {
	DB *pgxpool.Pool
}

type pickupChainView struct {
	ID        int     `json:"id"`
	Name      string  `json:"name"`
	BaseFee   float64 `json:"base_fee"`
	TargetFee float64 `json:"target_fee"`
	IsActive  bool    `json:"is_active"`
}

// List returns active pickup chains by default; pass ?include_inactive=true for Settings.
func (h *PickupChainHandler) List(w http.ResponseWriter, r *http.Request) {
	query := `SELECT id, name, base_fee, target_fee, is_active FROM pickup_chains`
	if r.URL.Query().Get("include_inactive") != "true" {
		query += ` WHERE is_active = true`
	}
	query += ` ORDER BY name`

	rows, err := h.DB.Query(r.Context(), query)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch pickup chains")
		return
	}
	defer rows.Close()

	list := []pickupChainView{}
	for rows.Next() {
		var c pickupChainView
		rows.Scan(&c.ID, &c.Name, &c.BaseFee, &c.TargetFee, &c.IsActive)
		list = append(list, c)
	}
	respondJSON(w, http.StatusOK, list)
}

type pickupChainRequest struct {
	Name      string  `json:"name"`
	BaseFee   float64 `json:"base_fee"`
	TargetFee float64 `json:"target_fee"`
	IsActive  *bool   `json:"is_active"`
}

func (h *PickupChainHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req pickupChainRequest
	if err := decodeJSON(r, &req); err != nil || req.Name == "" {
		respondError(w, http.StatusBadRequest, "name is required")
		return
	}
	var id int
	err := h.DB.QueryRow(r.Context(), `
		INSERT INTO pickup_chains (name, base_fee, target_fee) VALUES ($1,$2,$3) RETURNING id`,
		req.Name, req.BaseFee, req.TargetFee).Scan(&id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create pickup chain (name may already exist)")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]int{"id": id})
}

func (h *PickupChainHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid pickup chain id")
		return
	}
	var req pickupChainRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}
	ct, err := h.DB.Exec(r.Context(), `
		UPDATE pickup_chains SET name=$1, base_fee=$2, target_fee=$3, is_active=$4 WHERE id=$5`,
		req.Name, req.BaseFee, req.TargetFee, isActive, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to update pickup chain")
		return
	}
	if ct.RowsAffected() == 0 {
		respondError(w, http.StatusNotFound, "pickup chain not found")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *PickupChainHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid pickup chain id")
		return
	}
	_, err = h.DB.Exec(r.Context(), `DELETE FROM pickup_chains WHERE id=$1`, id)
	if err != nil {
		if strings.Contains(err.Error(), "foreign key") || strings.Contains(err.Error(), "violates") {
			respondError(w, http.StatusConflict, "pickup chain is used in existing orders; deactivate it instead")
			return
		}
		respondError(w, http.StatusInternalServerError, "failed to delete pickup chain")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
