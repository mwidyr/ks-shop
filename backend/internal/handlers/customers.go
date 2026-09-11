package handlers

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var allowedCustomerLabels = map[string]bool{
	"vip": true, "blacklist": true, "sering_retur": true, "pelanggan_baru": true,
}

type CustomerHandler struct {
	DB *pgxpool.Pool
}

type customerView struct {
	ID      int    `json:"id"`
	Name    string `json:"name"`
	Phone   string `json:"phone"`
	Address string `json:"address"`
}

// Search finds customers by name or phone (used by Sales during checkout attribution).
func (h *CustomerHandler) Search(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")
	var rows interface {
		Next() bool
		Scan(...interface{}) error
		Close()
	}
	var err error
	if q == "" {
		res, e := h.DB.Query(r.Context(), `SELECT id, name, phone, COALESCE(address,'') FROM customers ORDER BY name LIMIT 50`)
		rows, err = res, e
	} else {
		res, e := h.DB.Query(r.Context(), `
			SELECT id, name, phone, COALESCE(address,'') FROM customers
			WHERE name ILIKE '%'||$1||'%' OR phone ILIKE '%'||$1||'%' ORDER BY name LIMIT 50`, q)
		rows, err = res, e
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to search customers")
		return
	}
	defer rows.Close()

	list := []customerView{}
	for rows.Next() {
		var c customerView
		rows.Scan(&c.ID, &c.Name, &c.Phone, &c.Address)
		list = append(list, c)
	}
	respondJSON(w, http.StatusOK, list)
}

type createCustomerRequest struct {
	Name    string `json:"name"`
	Phone   string `json:"phone"`
	Address string `json:"address"`
}

func (h *CustomerHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req createCustomerRequest
	if err := decodeJSON(r, &req); err != nil || req.Name == "" || req.Phone == "" {
		respondError(w, http.StatusBadRequest, "name and phone are required")
		return
	}
	var id int
	err := h.DB.QueryRow(r.Context(), `INSERT INTO customers (name, phone, address) VALUES ($1,$2,$3) RETURNING id`,
		req.Name, req.Phone, req.Address).Scan(&id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create customer")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]int{"id": id})
}

type customerStats struct {
	ID          int        `json:"id"`
	Name        string     `json:"name"`
	Phone       string     `json:"phone"`
	Address     string     `json:"address"`
	OrderCount  int        `json:"order_count"`
	TotalSpend  float64    `json:"total_spend"`
	LastOrderAt *time.Time `json:"last_order_at"`
	Segment     string     `json:"segment"`
	Labels      []string   `json:"labels"`
}

// Stats returns every customer with order count, total spend, last order date, and a
// computed CRM segment (New/Returning/VIP/High Value/Inactive), for the Customers page.
func (h *CustomerHandler) Stats(w http.ResponseWriter, r *http.Request) {
	rows, err := h.DB.Query(r.Context(), `
		SELECT c.id, c.name, c.phone, COALESCE(c.address,''),
		       COALESCE(stats.order_count, 0), COALESCE(stats.total_spend, 0), stats.last_order_at
		FROM customers c
		LEFT JOIN LATERAL (
			SELECT COUNT(*) AS order_count,
			       SUM(item_totals.total) AS total_spend,
			       MAX(o.created_at) AS last_order_at
			FROM orders o
			JOIN LATERAL (
				SELECT COALESCE(SUM(oi.qty * oi.price_at_order),0) - o.discount_amount + o.additional_amount AS total
				FROM order_items oi WHERE oi.order_id = o.id
			) item_totals ON true
			WHERE o.customer_id = c.id
		) stats ON true
		ORDER BY c.name`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch customer stats")
		return
	}
	defer rows.Close()

	list := []customerStats{}
	idIndex := map[int]int{}
	for rows.Next() {
		var s customerStats
		if err := rows.Scan(&s.ID, &s.Name, &s.Phone, &s.Address, &s.OrderCount, &s.TotalSpend, &s.LastOrderAt); err != nil {
			continue
		}
		s.Segment = segmentFor(s.OrderCount, s.TotalSpend, s.LastOrderAt)
		s.Labels = []string{}
		idIndex[s.ID] = len(list)
		list = append(list, s)
	}

	labelRows, err := h.DB.Query(r.Context(), `SELECT customer_id, label FROM customer_labels`)
	if err == nil {
		defer labelRows.Close()
		for labelRows.Next() {
			var customerID int
			var label string
			if err := labelRows.Scan(&customerID, &label); err != nil {
				continue
			}
			if idx, ok := idIndex[customerID]; ok {
				list[idx].Labels = append(list[idx].Labels, label)
			}
		}
	}

	respondJSON(w, http.StatusOK, list)
}

func segmentFor(orderCount int, totalSpend float64, lastOrderAt *time.Time) string {
	if orderCount == 0 {
		return "inactive"
	}
	if lastOrderAt != nil && time.Since(*lastOrderAt) > 90*24*time.Hour {
		return "inactive"
	}
	if totalSpend >= 10_000_000 || orderCount >= 20 {
		return "vip"
	}
	if totalSpend >= 3_000_000 {
		return "high_value"
	}
	if orderCount >= 2 {
		return "returning"
	}
	return "new"
}

type setLabelRequest struct {
	Label   string `json:"label"`
	Enabled bool   `json:"enabled"`
}

// SetLabel toggles one manual CRM label (vip/blacklist/sering_retur/pelanggan_baru) on a
// customer - independent of the computed segment above, this is a staff action.
func (h *CustomerHandler) SetLabel(w http.ResponseWriter, r *http.Request) {
	customerID, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid customer id")
		return
	}
	var req setLabelRequest
	if err := decodeJSON(r, &req); err != nil || !allowedCustomerLabels[req.Label] {
		respondError(w, http.StatusBadRequest, "invalid label")
		return
	}
	if req.Enabled {
		if _, err := h.DB.Exec(r.Context(), `
			INSERT INTO customer_labels (customer_id, label) VALUES ($1,$2)
			ON CONFLICT (customer_id, label) DO NOTHING`, customerID, req.Label); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to set label")
			return
		}
	} else {
		if _, err := h.DB.Exec(r.Context(), `
			DELETE FROM customer_labels WHERE customer_id=$1 AND label=$2`, customerID, req.Label); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to remove label")
			return
		}
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// Delete removes a customer permanently. Blocked with 409 if they have order history, since
// order_items has no cascade delete from customers.
func (h *CustomerHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid customer id")
		return
	}
	_, err = h.DB.Exec(r.Context(), `DELETE FROM customers WHERE id=$1`, id)
	if err != nil {
		if strings.Contains(err.Error(), "foreign key") || strings.Contains(err.Error(), "violates") {
			respondError(w, http.StatusConflict, "pelanggan pernah memiliki order; tidak bisa dihapus")
			return
		}
		respondError(w, http.StatusInternalServerError, "failed to delete customer")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
