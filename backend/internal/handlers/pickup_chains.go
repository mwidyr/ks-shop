package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	appmw "ordermgmt/internal/middleware"
)

// PickupChainHandler manages minimarket/pickup fulfillment chains (7-Eleven, FamilyMart,
// Alamat Customer, Lainnya) - this replaced courier-delivery as the app's fulfillment model.
type PickupChainHandler struct {
	DB *pgxpool.Pool
}

type pickupChainView struct {
	ID        int     `json:"id"`
	Name      string  `json:"name"`
	ChainType string  `json:"chain_type"`
	BaseFee   float64 `json:"base_fee"`
	TargetFee float64 `json:"target_fee"`
	IsActive  bool    `json:"is_active"`
}

// List returns active pickup chains by default; pass ?include_inactive=true for Settings.
func (h *PickupChainHandler) List(w http.ResponseWriter, r *http.Request) {
	query := `SELECT id, name, chain_type, base_fee, target_fee, is_active FROM pickup_chains`
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
		rows.Scan(&c.ID, &c.Name, &c.ChainType, &c.BaseFee, &c.TargetFee, &c.IsActive)
		list = append(list, c)
	}
	respondJSON(w, http.StatusOK, list)
}

var validChainTypes = map[string]bool{"cvs_711": true, "cvs_familymart": true, "courier": true, "other": true}

type pickupChainRequest struct {
	Name      string  `json:"name"`
	ChainType string  `json:"chain_type"`
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
	if req.ChainType == "" || !validChainTypes[req.ChainType] {
		req.ChainType = "other"
	}
	var id int
	err := h.DB.QueryRow(r.Context(), `
		INSERT INTO pickup_chains (name, chain_type, base_fee, target_fee) VALUES ($1,$2,$3,$4) RETURNING id`,
		req.Name, req.ChainType, req.BaseFee, req.TargetFee).Scan(&id)
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
	if req.ChainType == "" || !validChainTypes[req.ChainType] {
		req.ChainType = "other"
	}
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}
	var beforeBase, beforeTarget float64
	h.DB.QueryRow(r.Context(), `SELECT base_fee, target_fee FROM pickup_chains WHERE id=$1`, id).Scan(&beforeBase, &beforeTarget)

	ct, err := h.DB.Exec(r.Context(), `
		UPDATE pickup_chains SET name=$1, chain_type=$2, base_fee=$3, target_fee=$4, is_active=$5 WHERE id=$6`,
		req.Name, req.ChainType, req.BaseFee, req.TargetFee, isActive, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to update pickup chain")
		return
	}
	if ct.RowsAffected() == 0 {
		respondError(w, http.StatusNotFound, "pickup chain not found")
		return
	}
	if req.BaseFee != beforeBase || req.TargetFee != beforeTarget {
		claims := appmw.GetClaims(r)
		var userID *int
		if claims != nil {
			userID = &claims.UserID
		}
		logActivity(r.Context(), h.DB, "pickup_chain", id, "fee_changed", userID,
			fmt.Sprintf("%s: base NT$%.0f->NT$%.0f, target NT$%.0f->NT$%.0f", req.Name, beforeBase, req.BaseFee, beforeTarget, req.TargetFee))
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
