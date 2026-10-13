package handlers

import (
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
)

// maskName turns "Wang Xiaomei" into "Wa***" so a review never shows a full customer name.
func maskName(name string) string {
	r := []rune(strings.TrimSpace(name))
	if len(r) == 0 {
		return "***"
	}
	n := 2
	if len(r) < n {
		n = len(r)
	}
	return string(r[:n]) + "***"
}

type reviewDTO struct {
	ID        int       `json:"id"`
	Rating    int       `json:"rating"`
	Body      string    `json:"body"`
	Name      string    `json:"name"`
	Variant   string    `json:"variant"`
	CreatedAt time.Time `json:"created_at"`
}

// ProductReviews serves GET /public/store/products/{id}/reviews (approved reviews + average).
func (h *SiteHandler) ProductReviews(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid product id")
		return
	}
	var avg float64
	var count int
	h.DB.QueryRow(r.Context(), `SELECT COALESCE(AVG(rating),0), COUNT(*) FROM product_reviews WHERE product_id=$1 AND status='approved'`, id).Scan(&avg, &count)
	items := []reviewDTO{}
	if rows, err := h.DB.Query(r.Context(), `
		SELECT rv.id, rv.rating, COALESCE(rv.body,''), rv.display_name, TRIM(BOTH ' /' FROM COALESCE(pv.color,'') || ' / ' || COALESCE(pv.size,'')), rv.created_at
		FROM product_reviews rv JOIN order_items oi ON oi.id = rv.order_item_id JOIN product_variants pv ON pv.id = oi.variant_id
		WHERE rv.product_id=$1 AND rv.status='approved' ORDER BY rv.created_at DESC LIMIT 30`, id); err == nil {
		for rows.Next() {
			var x reviewDTO
			if rows.Scan(&x.ID, &x.Rating, &x.Body, &x.Name, &x.Variant, &x.CreatedAt) == nil {
				items = append(items, x)
			}
		}
		rows.Close()
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"average": avg, "count": count, "items": items})
}

// SubmitReview serves POST /public/store/reviews {order_no, phone, item_id, rating, body}. Order number +
// phone are the shared secret (as for tracking); only delivered orders can be reviewed, once per line.
// New reviews wait for moderation in Ralulu Hub.
func (h *SiteHandler) SubmitReview(w http.ResponseWriter, r *http.Request) {
	if !siteLimiter.allow("review:"+clientIP(r), 10, time.Hour) {
		respondError(w, http.StatusTooManyRequests, "too many requests")
		return
	}
	var req struct {
		OrderNo string `json:"order_no"`
		Phone   string `json:"phone"`
		ItemID  int    `json:"item_id"`
		Rating  int    `json:"rating"`
		Body    string `json:"body"`
	}
	if err := decodeJSON(r, &req); err != nil || req.Rating < 1 || req.Rating > 5 || req.ItemID == 0 {
		respondError(w, http.StatusBadRequest, "rating 1-5 and item are required")
		return
	}
	req.Body = strings.TrimSpace(req.Body)
	if utf8.RuneCountInString(req.Body) > 1000 {
		respondError(w, http.StatusBadRequest, "ulasan terlalu panjang")
		return
	}
	var productID int
	var status, name string
	err := h.DB.QueryRow(r.Context(), `
		SELECT v.product_id, o.status, c.name
		FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN customers c ON c.id = o.customer_id JOIN product_variants v ON v.id = oi.variant_id
		WHERE oi.id=$1 AND o.order_no=$2 AND c.phone=$3`, req.ItemID, strings.TrimSpace(req.OrderNo), strings.TrimSpace(req.Phone)).Scan(&productID, &status, &name)
	if err != nil {
		respondError(w, http.StatusNotFound, "pesanan tidak ditemukan")
		return
	}
	if status != "delivered" {
		respondError(w, http.StatusConflict, "ulasan hanya untuk pesanan yang sudah selesai")
		return
	}
	if _, err := h.DB.Exec(r.Context(), `INSERT INTO product_reviews (product_id, order_item_id, rating, body, display_name) VALUES ($1,$2,$3,NULLIF($4,''),$5)`,
		productID, req.ItemID, req.Rating, req.Body, maskName(name)); err != nil {
		respondError(w, http.StatusConflict, "produk ini sudah diulas")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]string{"status": "pending"})
}

// ---- moderation (Ralulu Hub) ----

// AdminReviews serves GET /admin/product-reviews?status=pending|approved|hidden.
func (h *SiteAdminHandler) AdminReviews(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	where := ""
	args := []interface{}{}
	if status == "pending" || status == "approved" || status == "hidden" {
		where = " WHERE rv.status=$1"
		args = append(args, status)
	}
	rows, err := h.DB.Query(r.Context(), `
		SELECT rv.id, p.id, p.name, rv.rating, COALESCE(rv.body,''), rv.display_name, rv.status, rv.created_at
		FROM product_reviews rv JOIN products p ON p.id = rv.product_id`+where+` ORDER BY rv.created_at DESC LIMIT 200`, args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load reviews")
		return
	}
	defer rows.Close()
	type row struct {
		ID        int       `json:"id"`
		ProductID int       `json:"product_id"`
		Product   string    `json:"product"`
		Rating    int       `json:"rating"`
		Body      string    `json:"body"`
		Name      string    `json:"name"`
		Status    string    `json:"status"`
		CreatedAt time.Time `json:"created_at"`
	}
	out := []row{}
	for rows.Next() {
		var x row
		if rows.Scan(&x.ID, &x.ProductID, &x.Product, &x.Rating, &x.Body, &x.Name, &x.Status, &x.CreatedAt) == nil {
			out = append(out, x)
		}
	}
	respondJSON(w, http.StatusOK, out)
}

// SetReviewStatus serves PATCH /admin/product-reviews/{id}.
func (h *SiteAdminHandler) SetReviewStatus(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.Atoi(chi.URLParam(r, "id"))
	var req struct {
		Status string `json:"status"`
	}
	if err := decodeJSON(r, &req); err != nil || (req.Status != "pending" && req.Status != "approved" && req.Status != "hidden") {
		respondError(w, http.StatusBadRequest, "invalid status")
		return
	}
	h.DB.Exec(r.Context(), `UPDATE product_reviews SET status=$2 WHERE id=$1`, id, req.Status)
	respondJSON(w, http.StatusOK, map[string]string{"status": req.Status})
}

// LimitedUpload wraps the shared image upload for the public website (return photos): a few uploads
// per IP per hour; the handler itself validates type (JPEG/PNG/WebP) and size (5MB).
func (h *SiteHandler) LimitedUpload(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !siteLimiter.allow("upload:"+clientIP(r), 12, time.Hour) {
			respondError(w, http.StatusTooManyRequests, "too many uploads")
			return
		}
		next(w, r)
	}
}
