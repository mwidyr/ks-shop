package handlers

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	appmw "ordermgmt/internal/middleware"
)

// PurchaseHandler manages purchase orders (riwayat pembelian): waiting -> received, with stock
// and cost_price automatically updated on receipt so purchase cost feeds directly into the
// existing profit/cost analysis built on product_variants.cost_price.
type PurchaseHandler struct {
	DB *pgxpool.Pool
}

type purchaseListItem struct {
	ID           int     `json:"id"`
	SupplierName string  `json:"supplier_name"`
	OrderDate    string  `json:"order_date"`
	Status       string  `json:"status"`
	ItemCount    int     `json:"item_count"`
	TotalQty     int     `json:"total_qty"`
	TotalCost    float64 `json:"total_cost"`
	CreatedAt    string  `json:"created_at"`
}

func (h *PurchaseHandler) List(w http.ResponseWriter, r *http.Request) {
	where := " WHERE 1=1 "
	args := []interface{}{}
	if status := r.URL.Query().Get("status"); status != "" {
		where += " AND p.status = $1 "
		args = append(args, status)
	}
	rows, err := h.DB.Query(r.Context(), `
		SELECT p.id, s.name, p.order_date::text, p.status,
		       COALESCE((SELECT COUNT(*) FROM purchase_items pi WHERE pi.purchase_id = p.id), 0),
		       COALESCE((SELECT SUM(pi.qty) FROM purchase_items pi WHERE pi.purchase_id = p.id), 0),
		       COALESCE((SELECT SUM(pi.qty * pi.unit_cost) FROM purchase_items pi WHERE pi.purchase_id = p.id), 0),
		       p.created_at::text
		FROM purchases p
		JOIN suppliers s ON s.id = p.supplier_id`+where+`
		ORDER BY p.created_at DESC`, args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch purchases")
		return
	}
	defer rows.Close()

	list := []purchaseListItem{}
	for rows.Next() {
		var p purchaseListItem
		if err := rows.Scan(&p.ID, &p.SupplierName, &p.OrderDate, &p.Status, &p.ItemCount, &p.TotalQty, &p.TotalCost, &p.CreatedAt); err != nil {
			continue
		}
		list = append(list, p)
	}
	respondJSON(w, http.StatusOK, list)
}

type purchaseItemView struct {
	ID          int     `json:"id"`
	VariantID   int     `json:"variant_id"`
	ProductName string  `json:"product_name"`
	Color       string  `json:"color"`
	Size        string  `json:"size"`
	SKU         string  `json:"sku"`
	Qty         int     `json:"qty"`
	UnitCost    float64 `json:"unit_cost"`
}

type purchaseDetailView struct {
	ID           int                `json:"id"`
	SupplierID   int                `json:"supplier_id"`
	SupplierName string             `json:"supplier_name"`
	OrderDate    string             `json:"order_date"`
	Status       string             `json:"status"`
	Notes        string             `json:"notes"`
	Items        []purchaseItemView `json:"items"`
	CreatedAt    string             `json:"created_at"`
	ReceivedAt   *string            `json:"received_at"`
}

func (h *PurchaseHandler) Detail(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid purchase id")
		return
	}
	ctx := r.Context()

	var p purchaseDetailView
	var receivedAt *string
	if err := h.DB.QueryRow(ctx, `
		SELECT p.id, p.supplier_id, s.name, p.order_date::text, p.status, COALESCE(p.notes,''), p.created_at::text, p.received_at::text
		FROM purchases p JOIN suppliers s ON s.id = p.supplier_id WHERE p.id=$1`, id).
		Scan(&p.ID, &p.SupplierID, &p.SupplierName, &p.OrderDate, &p.Status, &p.Notes, &p.CreatedAt, &receivedAt); err != nil {
		respondError(w, http.StatusNotFound, "purchase not found")
		return
	}
	p.ReceivedAt = receivedAt

	rows, err := h.DB.Query(ctx, `
		SELECT pi.id, pi.variant_id, pr.name, pv.color, pv.size, pv.sku, pi.qty, pi.unit_cost
		FROM purchase_items pi
		JOIN product_variants pv ON pv.id = pi.variant_id
		JOIN products pr ON pr.id = pv.product_id
		WHERE pi.purchase_id = $1 ORDER BY pi.id`, id)
	p.Items = []purchaseItemView{}
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var it purchaseItemView
			if err := rows.Scan(&it.ID, &it.VariantID, &it.ProductName, &it.Color, &it.Size, &it.SKU, &it.Qty, &it.UnitCost); err != nil {
				continue
			}
			p.Items = append(p.Items, it)
		}
	}
	respondJSON(w, http.StatusOK, p)
}

type createPurchaseItem struct {
	VariantID int     `json:"variant_id"`
	Qty       int     `json:"qty"`
	UnitCost  float64 `json:"unit_cost"`
}

type createPurchaseRequest struct {
	SupplierID int                  `json:"supplier_id"`
	OrderDate  string               `json:"order_date"`
	Notes      string               `json:"notes"`
	Items      []createPurchaseItem `json:"items"`
}

// Create records a new purchase in 'waiting' status - no stock effect yet.
func (h *PurchaseHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req createPurchaseRequest
	if err := decodeJSON(r, &req); err != nil || req.SupplierID == 0 || req.OrderDate == "" || len(req.Items) == 0 {
		respondError(w, http.StatusBadRequest, "supplier_id, order_date and at least one item are required")
		return
	}
	for _, it := range req.Items {
		if it.VariantID == 0 || it.Qty <= 0 || it.UnitCost < 0 {
			respondError(w, http.StatusBadRequest, "each item requires variant_id, a positive qty and a non-negative unit_cost")
			return
		}
	}
	claims := appmw.GetClaims(r)
	ctx := r.Context()

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(ctx)

	var purchaseID int
	if err := tx.QueryRow(ctx, `
		INSERT INTO purchases (supplier_id, order_date, notes, created_by) VALUES ($1,$2,$3,$4) RETURNING id`,
		req.SupplierID, req.OrderDate, req.Notes, claims.UserID).Scan(&purchaseID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create purchase")
		return
	}
	for _, it := range req.Items {
		if _, err := tx.Exec(ctx, `
			INSERT INTO purchase_items (purchase_id, variant_id, qty, unit_cost) VALUES ($1,$2,$3,$4)`,
			purchaseID, it.VariantID, it.Qty, it.UnitCost); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to add purchase item")
			return
		}
	}
	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "db commit failed")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]int{"id": purchaseID})
}

// Receive confirms goods received: stock auto-increments (available_stock) and each variant's
// cost_price is refreshed to the purchase's unit_cost, per the client's stated purpose ("Data
// biaya pembelian dapat digunakan untuk perhitungan cost dan analisis profit").
func (h *PurchaseHandler) Receive(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid purchase id")
		return
	}
	claims := appmw.GetClaims(r)
	ctx := r.Context()

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(ctx)

	var status string
	if err := tx.QueryRow(ctx, `SELECT status FROM purchases WHERE id=$1 FOR UPDATE`, id).Scan(&status); err != nil {
		respondError(w, http.StatusNotFound, "purchase not found")
		return
	}
	if status != "waiting" {
		respondError(w, http.StatusBadRequest, "purchase is not in waiting status")
		return
	}

	rows, err := tx.Query(ctx, `SELECT variant_id, qty, unit_cost FROM purchase_items WHERE purchase_id=$1`, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load purchase items")
		return
	}
	type item struct {
		VariantID int
		Qty       int
		UnitCost  float64
	}
	var items []item
	for rows.Next() {
		var it item
		rows.Scan(&it.VariantID, &it.Qty, &it.UnitCost)
		items = append(items, it)
	}
	rows.Close()

	for _, it := range items {
		if _, err := tx.Exec(ctx, `
			UPDATE stock_buckets SET available_stock = available_stock + $1 WHERE variant_id=$2`, it.Qty, it.VariantID); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to update stock")
			return
		}
		if _, err := tx.Exec(ctx, `UPDATE product_variants SET cost_price=$1 WHERE id=$2`, it.UnitCost, it.VariantID); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to update cost price")
			return
		}
		tx.Exec(ctx, `
			INSERT INTO stock_movements (variant_id, bucket_from, bucket_to, qty, event_type, user_id, note)
			VALUES ($1,'(supplier)','available_stock',$2,'purchase_received',$3,$4)`,
			it.VariantID, it.Qty, claims.UserID, fmt.Sprintf("purchase #%d received", id))
	}

	if _, err := tx.Exec(ctx, `UPDATE purchases SET status='received', received_at=now() WHERE id=$1`, id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to update purchase status")
		return
	}
	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "db commit failed")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// Delete removes a purchase still in 'waiting' status (a received purchase has already affected
// stock and cost_price - cancelling it after the fact would require an explicit reversal flow,
// not built here since it wasn't requested).
func (h *PurchaseHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid purchase id")
		return
	}
	ct, err := h.DB.Exec(r.Context(), `DELETE FROM purchases WHERE id=$1 AND status='waiting'`, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to delete purchase")
		return
	}
	if ct.RowsAffected() == 0 {
		respondError(w, http.StatusNotFound, "purchase not found or already received")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
