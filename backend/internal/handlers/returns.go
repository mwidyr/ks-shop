package handlers

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	appmw "ordermgmt/internal/middleware"
)

// ReturnHandler tracks return requests against an order (item #007 prerequisite): reason,
// requested refund type/qty/amount, moving through a 6-stage approval pipeline until it's
// approved through to completion or rejected. See migration 055 for why this is deliberately
// separate from the existing orders.status='return' whole-order transition.
type ReturnHandler struct {
	DB *pgxpool.Pool
}

var validReturnReasons = map[string]bool{
	"damaged": true, "wrong_item": true, "missing_item": true, "defective": true, "change_of_mind": true,
}
var validRefundTypes = map[string]bool{"full": true, "replacement": true, "store_credit": true}

type returnView struct {
	ID           int     `json:"id"`
	OrderID      int     `json:"order_id"`
	OrderNo      string  `json:"order_no"`
	CustomerName string  `json:"customer_name"`
	Reason       string  `json:"reason"`
	RefundType   string  `json:"refund_type"`
	Stage        int     `json:"stage"`
	Status       string  `json:"status"`
	Qty          int     `json:"qty"`
	Amount       float64 `json:"amount"`
	Note         string  `json:"note"`
	CreatedAt    string  `json:"created_at"`
}

const returnSelect = `
	SELECT ret.id, ret.order_id, o.order_no, c.name, ret.reason, ret.refund_type, ret.stage, ret.status,
	       ret.qty, ret.amount, COALESCE(ret.note,''), ret.created_at
	FROM returns ret
	JOIN orders o ON o.id = ret.order_id
	JOIN customers c ON c.id = o.customer_id`

func scanReturn(row interface{ Scan(...interface{}) error }) (returnView, error) {
	var v returnView
	var createdAt time.Time
	err := row.Scan(&v.ID, &v.OrderID, &v.OrderNo, &v.CustomerName, &v.Reason, &v.RefundType, &v.Stage, &v.Status,
		&v.Qty, &v.Amount, &v.Note, &createdAt)
	if err != nil {
		return v, err
	}
	v.CreatedAt = createdAt.Format(time.RFC3339)
	return v, nil
}

// List returns every return request, newest first, optionally filtered by ?status=.
func (h *ReturnHandler) List(w http.ResponseWriter, r *http.Request) {
	query := returnSelect
	args := []interface{}{}
	if status := r.URL.Query().Get("status"); status != "" {
		query += " WHERE ret.status = $1"
		args = append(args, status)
	}
	query += " ORDER BY ret.created_at DESC"

	rows, err := h.DB.Query(r.Context(), query, args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch returns")
		return
	}
	defer rows.Close()

	list := []returnView{}
	for rows.Next() {
		v, err := scanReturn(rows)
		if err != nil {
			continue
		}
		list = append(list, v)
	}
	respondJSON(w, http.StatusOK, list)
}

type createReturnRequest struct {
	OrderNo    string  `json:"order_no"`
	Reason     string  `json:"reason"`
	RefundType string  `json:"refund_type"`
	Qty        int     `json:"qty"`
	Amount     float64 `json:"amount"`
	Note       string  `json:"note"`
}

// Create files a new return request against an existing order (looked up by order_no, matching
// how staff refer to orders elsewhere in the app - no order picker needed).
func (h *ReturnHandler) Create(w http.ResponseWriter, r *http.Request) {
	claims := appmw.GetClaims(r)
	var req createReturnRequest
	if err := decodeJSON(r, &req); err != nil || strings.TrimSpace(req.OrderNo) == "" {
		respondError(w, http.StatusBadRequest, "order_no is required")
		return
	}
	if !validReturnReasons[req.Reason] {
		respondError(w, http.StatusBadRequest, "invalid reason")
		return
	}
	if req.RefundType == "" {
		req.RefundType = "full"
	}
	if !validRefundTypes[req.RefundType] {
		respondError(w, http.StatusBadRequest, "invalid refund_type")
		return
	}
	if req.Qty <= 0 {
		respondError(w, http.StatusBadRequest, "qty must be greater than 0")
		return
	}

	var orderID int
	if err := h.DB.QueryRow(r.Context(), `SELECT id FROM orders WHERE order_no=$1`, strings.TrimSpace(req.OrderNo)).Scan(&orderID); err != nil {
		respondError(w, http.StatusNotFound, "order not found: "+req.OrderNo)
		return
	}

	var createdBy *int
	if claims != nil {
		createdBy = &claims.UserID
	}

	var id int
	err := h.DB.QueryRow(r.Context(), `
		INSERT INTO returns (order_id, reason, refund_type, qty, amount, note, created_by)
		VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
		orderID, req.Reason, req.RefundType, req.Qty, req.Amount, req.Note, createdBy).Scan(&id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create return")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]int{"id": id})
}

// Approve advances an active return to its next stage, or - once already at the final stage
// (6, Refund) - marks it completed. Matches the single "Approve" button in the UI, which just
// moves the pipeline forward one step at a time.
func (h *ReturnHandler) Approve(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid return id")
		return
	}
	var stage int
	var status string
	if err := h.DB.QueryRow(r.Context(), `SELECT stage, status FROM returns WHERE id=$1`, id).Scan(&stage, &status); err != nil {
		respondError(w, http.StatusNotFound, "return not found")
		return
	}
	if status != "active" {
		respondError(w, http.StatusBadRequest, "return is not active")
		return
	}

	if stage >= 6 {
		if _, err := h.DB.Exec(r.Context(), `UPDATE returns SET status='completed', updated_at=now() WHERE id=$1`, id); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to complete return")
			return
		}
		respondJSON(w, http.StatusOK, map[string]interface{}{"stage": stage, "status": "completed"})
		return
	}

	newStage := stage + 1
	if _, err := h.DB.Exec(r.Context(), `UPDATE returns SET stage=$1, updated_at=now() WHERE id=$2`, newStage, id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to advance return")
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"stage": newStage, "status": "active"})
}

// Reject marks an active return as rejected, freezing it at its current stage.
func (h *ReturnHandler) Reject(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid return id")
		return
	}
	ct, err := h.DB.Exec(r.Context(), `UPDATE returns SET status='rejected', updated_at=now() WHERE id=$1 AND status='active'`, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to reject return")
		return
	}
	if ct.RowsAffected() == 0 {
		respondError(w, http.StatusNotFound, "active return not found")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "rejected"})
}
