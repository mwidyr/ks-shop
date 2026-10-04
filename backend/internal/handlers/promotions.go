package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	appmw "ordermgmt/internal/middleware"
)

type PromotionHandler struct {
	DB *pgxpool.Pool
}

type promotionView struct {
	ID               int     `json:"id"`
	Code             *string `json:"code"`
	Type             string  `json:"type"`
	Value            float64 `json:"value"`
	MinOrderAmount   float64 `json:"min_order_amount"`
	StartDate        *string `json:"start_date"`
	EndDate          *string `json:"end_date"`
	UsageLimit       *int    `json:"usage_limit"`
	PerCustomerLimit *int    `json:"per_customer_limit"`
	Combinable       bool    `json:"combinable"`
	IsActive         bool    `json:"is_active"`
	UsageCount       int     `json:"usage_count"`
	CreatedAt        string  `json:"created_at"`
}

func (h *PromotionHandler) List(w http.ResponseWriter, r *http.Request) {
	rows, err := h.DB.Query(r.Context(), `
		SELECT p.id, p.code, p.type, p.value, p.min_order_amount, p.start_date, p.end_date,
		       p.usage_limit, p.per_customer_limit, p.combinable, p.is_active, p.created_at,
		       COUNT(pr.id)
		FROM promotions p
		LEFT JOIN promotion_redemptions pr ON pr.promotion_id = p.id
		GROUP BY p.id
		ORDER BY p.created_at DESC`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch promotions")
		return
	}
	defer rows.Close()

	list := []promotionView{}
	for rows.Next() {
		var p promotionView
		var start, end, createdAt *time.Time
		var createdAtVal time.Time
		if err := rows.Scan(&p.ID, &p.Code, &p.Type, &p.Value, &p.MinOrderAmount, &start, &end,
			&p.UsageLimit, &p.PerCustomerLimit, &p.Combinable, &p.IsActive, &createdAtVal, &p.UsageCount); err != nil {
			continue
		}
		createdAt = &createdAtVal
		p.CreatedAt = createdAt.Format(time.RFC3339)
		if start != nil {
			v := start.Format(time.RFC3339)
			p.StartDate = &v
		}
		if end != nil {
			v := end.Format(time.RFC3339)
			p.EndDate = &v
		}
		list = append(list, p)
	}
	respondJSON(w, http.StatusOK, list)
}

type promotionRequest struct {
	Code             *string  `json:"code"`
	Type             string   `json:"type"`
	Value            float64  `json:"value"`
	MinOrderAmount   float64  `json:"min_order_amount"`
	StartDate        *string  `json:"start_date"`
	EndDate          *string  `json:"end_date"`
	UsageLimit       *int     `json:"usage_limit"`
	PerCustomerLimit *int     `json:"per_customer_limit"`
	Combinable       bool     `json:"combinable"`
	IsActive         *bool    `json:"is_active"`
}

var validPromotionTypes = map[string]bool{"fixed_amount": true, "percentage": true, "free_shipping": true}

func validatePromotionRequest(req promotionRequest) string {
	if !validPromotionTypes[req.Type] {
		return "type must be fixed_amount, percentage or free_shipping"
	}
	if req.Code == nil || strings.TrimSpace(*req.Code) == "" {
		return "code is required"
	}
	if req.Type == "percentage" && (req.Value <= 0 || req.Value > 100) {
		return "percentage value must be between 0 and 100"
	}
	if req.Type == "fixed_amount" && req.Value <= 0 {
		return "value must be a positive amount"
	}
	if req.MinOrderAmount < 0 {
		return "min_order_amount cannot be negative"
	}
	if req.UsageLimit != nil && *req.UsageLimit <= 0 {
		return "usage_limit must be positive when set"
	}
	if req.PerCustomerLimit != nil && *req.PerCustomerLimit <= 0 {
		return "per_customer_limit must be positive when set"
	}
	return ""
}

func (h *PromotionHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req promotionRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if msg := validatePromotionRequest(req); msg != "" {
		respondError(w, http.StatusBadRequest, msg)
		return
	}
	code := strings.ToUpper(strings.TrimSpace(*req.Code))
	ctx := r.Context()

	var exists bool
	h.DB.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM promotions WHERE code=$1)`, code).Scan(&exists)
	if exists {
		respondError(w, http.StatusBadRequest, "this code is already in use")
		return
	}

	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}
	claims := appmw.GetClaims(r)

	var id int
	if err := h.DB.QueryRow(ctx, `
		INSERT INTO promotions (code, type, value, min_order_amount, start_date, end_date, usage_limit, per_customer_limit, combinable, is_active, created_by)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
		code, req.Type, req.Value, req.MinOrderAmount, req.StartDate, req.EndDate,
		req.UsageLimit, req.PerCustomerLimit, req.Combinable, isActive, claims.UserID).Scan(&id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create promotion")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]int{"id": id})
}

func (h *PromotionHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid promotion id")
		return
	}
	var req promotionRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if msg := validatePromotionRequest(req); msg != "" {
		respondError(w, http.StatusBadRequest, msg)
		return
	}
	code := strings.ToUpper(strings.TrimSpace(*req.Code))
	ctx := r.Context()

	var exists bool
	h.DB.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM promotions WHERE code=$1 AND id!=$2)`, code, id).Scan(&exists)
	if exists {
		respondError(w, http.StatusBadRequest, "this code is already in use")
		return
	}

	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	ct, err := h.DB.Exec(ctx, `
		UPDATE promotions SET code=$1, type=$2, value=$3, min_order_amount=$4, start_date=$5, end_date=$6,
		       usage_limit=$7, per_customer_limit=$8, combinable=$9, is_active=$10
		WHERE id=$11`,
		code, req.Type, req.Value, req.MinOrderAmount, req.StartDate, req.EndDate,
		req.UsageLimit, req.PerCustomerLimit, req.Combinable, isActive, id)
	if err != nil || ct.RowsAffected() == 0 {
		respondError(w, http.StatusNotFound, "promotion not found")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// Delete deactivates a promotion rather than removing it - redemption history must stay intact
// for reporting even after a campaign is retired.
func (h *PromotionHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid promotion id")
		return
	}
	ct, err := h.DB.Exec(r.Context(), `UPDATE promotions SET is_active=false WHERE id=$1`, id)
	if err != nil || ct.RowsAffected() == 0 {
		respondError(w, http.StatusNotFound, "promotion not found")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

type validatePromotionRequestBody struct {
	Code       string  `json:"code"`
	CustomerID *int    `json:"customer_id"`
	Subtotal   float64 `json:"subtotal"`
}

// Validate is a read-only preview used by OrderCreate.jsx as the staff types/confirms a coupon
// code - it runs the exact same eligibility rules as resolvePromotionByCode but never writes a
// redemption, so repeated validation calls while a staff member edits the cart don't consume
// usage_limit or per_customer_limit.
func (h *PromotionHandler) Validate(w http.ResponseWriter, r *http.Request) {
	var req validatePromotionRequestBody
	if err := decodeJSON(r, &req); err != nil || strings.TrimSpace(req.Code) == "" {
		respondError(w, http.StatusBadRequest, "code is required")
		return
	}
	result, errMsg := resolvePromotionByCode(r.Context(), h.DB, strings.ToUpper(strings.TrimSpace(req.Code)), req.CustomerID, req.Subtotal)
	if errMsg != "" {
		respondError(w, http.StatusBadRequest, errMsg)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"promotion_id":    result.id,
		"type":            result.ptype,
		"discount_amount": result.discountAmount,
		"free_shipping":   result.freeShipping,
	})
}

type promotionResolution struct {
	id             int
	ptype          string
	discountAmount float64
	freeShipping   bool
}

// resolvePromotionByCode validates a coupon code against the current subtotal/customer and
// returns the discount to apply. db can be either *pgxpool.Pool (the read-only Validate preview)
// or an in-progress pgx.Tx (order creation, see orders.go Create) - both satisfy querier. The
// leading SELECT uses FOR UPDATE so that two concurrent orders redeeming the last unit of a
// usage_limit-capped code inside a real transaction serialize instead of racing past the count
// check together; it is a harmless no-op lock when called outside a transaction (the preview path).
func resolvePromotionByCode(ctx context.Context, db querier, code string, customerID *int, subtotal float64) (promotionResolution, string) {
	var res promotionResolution
	var value, minOrder float64
	var usageLimit, perCustomerLimit *int
	var startDate, endDate *time.Time
	var isActive bool
	err := db.QueryRow(ctx, `
		SELECT id, type, value, min_order_amount, start_date, end_date, usage_limit, per_customer_limit, is_active
		FROM promotions WHERE code = $1 FOR UPDATE`, code).
		Scan(&res.id, &res.ptype, &value, &minOrder, &startDate, &endDate, &usageLimit, &perCustomerLimit, &isActive)
	if err != nil {
		return promotionResolution{}, "promotion code not found"
	}
	if !isActive {
		return promotionResolution{}, "this promotion is not active"
	}
	now := time.Now()
	if startDate != nil && now.Before(*startDate) {
		return promotionResolution{}, "this promotion is not active yet"
	}
	if endDate != nil && now.After(*endDate) {
		return promotionResolution{}, "this promotion has expired"
	}
	if subtotal < minOrder {
		return promotionResolution{}, fmt.Sprintf("order subtotal must be at least %.2f to use this code", minOrder)
	}
	if usageLimit != nil {
		var count int
		db.QueryRow(ctx, `SELECT COUNT(*) FROM promotion_redemptions WHERE promotion_id=$1`, res.id).Scan(&count)
		if count >= *usageLimit {
			return promotionResolution{}, "this promotion has reached its usage limit"
		}
	}
	if perCustomerLimit != nil && customerID != nil {
		var count int
		db.QueryRow(ctx, `SELECT COUNT(*) FROM promotion_redemptions WHERE promotion_id=$1 AND customer_id=$2`, res.id, *customerID).Scan(&count)
		if count >= *perCustomerLimit {
			return promotionResolution{}, "this customer has already used this promotion the maximum number of times"
		}
	}

	switch res.ptype {
	case "fixed_amount":
		res.discountAmount = value
		if res.discountAmount > subtotal {
			res.discountAmount = subtotal
		}
	case "percentage":
		res.discountAmount = subtotal * value / 100
	case "free_shipping":
		res.freeShipping = true
	}
	return res, ""
}
