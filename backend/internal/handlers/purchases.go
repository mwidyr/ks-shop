package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	appmw "ordermgmt/internal/middleware"
)

// PurchaseHandler manages purchase orders: ordered -> pending_arrival -> received (or cancelled
// at any point pre-receipt), with stock and cost_price automatically updated on receipt so
// purchase cost feeds directly into the existing profit/cost analysis built on
// product_variants.cost_price. See migration 063 for the schema rework this implements.
type PurchaseHandler struct {
	DB *pgxpool.Pool
}

var validPurchaseStatuses = map[string]bool{"ordered": true, "pending_arrival": true, "received": true, "cancelled": true}

type purchaseListItem struct {
	ID                  int     `json:"id"`
	PONumber            string  `json:"po_number"`
	SupplierName        string  `json:"supplier_name"`
	OrderDate           string  `json:"order_date"`
	ExpectedArrivalDate *string `json:"expected_arrival_date"`
	Status              string  `json:"status"`
	ItemCount           int     `json:"item_count"`
	TotalQty            int     `json:"total_qty"`
	TotalCost           float64 `json:"total_cost"`
	CreatedAt           string  `json:"created_at"`
}

func (h *PurchaseHandler) List(w http.ResponseWriter, r *http.Request) {
	where := " WHERE 1=1 "
	args := []interface{}{}
	if status := r.URL.Query().Get("status"); status != "" {
		where += " AND p.status = $1 "
		args = append(args, status)
	}
	rows, err := h.DB.Query(r.Context(), `
		SELECT p.id, p.po_number, s.name, p.order_date::text, p.expected_arrival_date::text, p.status,
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
		if err := rows.Scan(&p.ID, &p.PONumber, &p.SupplierName, &p.OrderDate, &p.ExpectedArrivalDate, &p.Status,
			&p.ItemCount, &p.TotalQty, &p.TotalCost, &p.CreatedAt); err != nil {
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
	ReceivedQty *int    `json:"received_qty"`
}

type purchaseChangeView struct {
	FieldName string `json:"field_name"`
	OldValue  string `json:"old_value"`
	NewValue  string `json:"new_value"`
	ChangedBy string `json:"changed_by"`
	ChangedAt string `json:"changed_at"`
	Reason    string `json:"reason"`
}

type purchaseDetailView struct {
	ID                  int                  `json:"id"`
	PONumber            string               `json:"po_number"`
	SupplierID          int                  `json:"supplier_id"`
	SupplierName        string               `json:"supplier_name"`
	OrderDate           string               `json:"order_date"`
	ExpectedArrivalDate *string              `json:"expected_arrival_date"`
	Status              string               `json:"status"`
	Notes               string               `json:"notes"`
	Items               []purchaseItemView   `json:"items"`
	ChangeLog           []purchaseChangeView `json:"change_log"`
	CreatedAt           string               `json:"created_at"`
	ReceivedAt          *string              `json:"received_at"`
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
		SELECT p.id, p.po_number, p.supplier_id, s.name, p.order_date::text, p.expected_arrival_date::text, p.status,
		       COALESCE(p.notes,''), p.created_at::text, p.received_at::text
		FROM purchases p JOIN suppliers s ON s.id = p.supplier_id WHERE p.id=$1`, id).
		Scan(&p.ID, &p.PONumber, &p.SupplierID, &p.SupplierName, &p.OrderDate, &p.ExpectedArrivalDate, &p.Status,
			&p.Notes, &p.CreatedAt, &receivedAt); err != nil {
		respondError(w, http.StatusNotFound, "purchase not found")
		return
	}
	p.ReceivedAt = receivedAt

	rows, err := h.DB.Query(ctx, `
		SELECT pi.id, pi.variant_id, pr.name, pv.color, pv.size, pv.sku, pi.qty, pi.unit_cost, pi.received_qty
		FROM purchase_items pi
		JOIN product_variants pv ON pv.id = pi.variant_id
		JOIN products pr ON pr.id = pv.product_id
		WHERE pi.purchase_id = $1 ORDER BY pi.id`, id)
	p.Items = []purchaseItemView{}
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var it purchaseItemView
			if err := rows.Scan(&it.ID, &it.VariantID, &it.ProductName, &it.Color, &it.Size, &it.SKU, &it.Qty, &it.UnitCost, &it.ReceivedQty); err != nil {
				continue
			}
			p.Items = append(p.Items, it)
		}
	}

	p.ChangeLog = []purchaseChangeView{}
	if clRows, err := h.DB.Query(ctx, `
		SELECT pcl.field_name, COALESCE(pcl.old_value,''), COALESCE(pcl.new_value,''), COALESCE(u.name,'-'), pcl.changed_at::text, COALESCE(pcl.reason,'')
		FROM purchase_change_log pcl LEFT JOIN users u ON u.id = pcl.changed_by
		WHERE pcl.purchase_id = $1 ORDER BY pcl.changed_at DESC`, id); err == nil {
		defer clRows.Close()
		for clRows.Next() {
			var c purchaseChangeView
			if clRows.Scan(&c.FieldName, &c.OldValue, &c.NewValue, &c.ChangedBy, &c.ChangedAt, &c.Reason) == nil {
				p.ChangeLog = append(p.ChangeLog, c)
			}
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
	SupplierID          int                  `json:"supplier_id"`
	OrderDate           string               `json:"order_date"`
	ExpectedArrivalDate string               `json:"expected_arrival_date"`
	Notes               string               `json:"notes"`
	Items               []createPurchaseItem `json:"items"`
}

// Create records a new purchase in 'ordered' status and immediately reserves the ordered
// quantities in incoming_stock, so Replenishment Planning's Sellable Stock reflects it right
// away (previously, creating a purchase had no stock effect at all until receipt).
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

	var expectedArrival interface{}
	if req.ExpectedArrivalDate != "" {
		expectedArrival = req.ExpectedArrivalDate
	}

	var purchaseID int
	if err := tx.QueryRow(ctx, `
		INSERT INTO purchases (supplier_id, order_date, expected_arrival_date, notes, created_by)
		VALUES ($1,$2,$3,$4,$5) RETURNING id`,
		req.SupplierID, req.OrderDate, expectedArrival, req.Notes, claims.UserID).Scan(&purchaseID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create purchase")
		return
	}
	if _, err := tx.Exec(ctx, `UPDATE purchases SET po_number = 'PO-' || LPAD($1::text, 5, '0') WHERE id=$1`, purchaseID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to assign PO number")
		return
	}
	for _, it := range req.Items {
		if _, err := tx.Exec(ctx, `
			INSERT INTO purchase_items (purchase_id, variant_id, qty, unit_cost) VALUES ($1,$2,$3,$4)`,
			purchaseID, it.VariantID, it.Qty, it.UnitCost); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to add purchase item")
			return
		}
		if _, err := tx.Exec(ctx, `UPDATE stock_buckets SET incoming_stock = incoming_stock + $1 WHERE variant_id=$2`, it.Qty, it.VariantID); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to reserve incoming stock")
			return
		}
	}
	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "db commit failed")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]int{"id": purchaseID})
}

type updatePurchaseItem struct {
	ID       int      `json:"id"`
	Qty      *int     `json:"qty"`
	UnitCost *float64 `json:"unit_cost"`
}

type updatePurchaseRequest struct {
	ExpectedArrivalDate *string              `json:"expected_arrival_date"`
	Notes               *string              `json:"notes"`
	Reason              string               `json:"reason"`
	Items               []updatePurchaseItem `json:"items"`
}

// Update edits a purchase pre-receipt: Expected Arrival Date, per-item Qty/Unit Cost, and Notes.
// Every actual change is written to purchase_change_log. QTY should normally never change
// (orders are usually paid before the supplier ships) but exceptions happen (supplier
// shortages, order adjustments) - editing is allowed, just logged, per spec.
func (h *PurchaseHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid purchase id")
		return
	}
	var req updatePurchaseRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
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
	var oldExpected *time.Time
	var oldNotes string
	if err := tx.QueryRow(ctx, `SELECT status, expected_arrival_date, COALESCE(notes,'') FROM purchases WHERE id=$1 FOR UPDATE`, id).
		Scan(&status, &oldExpected, &oldNotes); err != nil {
		respondError(w, http.StatusNotFound, "purchase not found")
		return
	}
	if status != "ordered" && status != "pending_arrival" {
		respondError(w, http.StatusBadRequest, "purchase can only be edited before it's received or cancelled")
		return
	}

	if req.ExpectedArrivalDate != nil {
		oldVal := ""
		if oldExpected != nil {
			oldVal = oldExpected.Format("2006-01-02")
		}
		if oldVal != *req.ExpectedArrivalDate {
			var newArrival interface{}
			if *req.ExpectedArrivalDate != "" {
				newArrival = *req.ExpectedArrivalDate
			}
			tx.Exec(ctx, `UPDATE purchases SET expected_arrival_date=$1 WHERE id=$2`, newArrival, id)
			tx.Exec(ctx, `INSERT INTO purchase_change_log (purchase_id, field_name, old_value, new_value, changed_by, reason) VALUES ($1,'expected_arrival_date',$2,$3,$4,$5)`,
				id, oldVal, *req.ExpectedArrivalDate, claims.UserID, req.Reason)
		}
	}
	if req.Notes != nil && *req.Notes != oldNotes {
		tx.Exec(ctx, `UPDATE purchases SET notes=$1 WHERE id=$2`, *req.Notes, id)
		tx.Exec(ctx, `INSERT INTO purchase_change_log (purchase_id, field_name, old_value, new_value, changed_by, reason) VALUES ($1,'notes',$2,$3,$4,$5)`,
			id, oldNotes, *req.Notes, claims.UserID, req.Reason)
	}

	for _, itUpdate := range req.Items {
		var oldQty int
		var oldUnitCost float64
		if err := tx.QueryRow(ctx, `SELECT qty, unit_cost FROM purchase_items WHERE id=$1 AND purchase_id=$2`, itUpdate.ID, id).
			Scan(&oldQty, &oldUnitCost); err != nil {
			continue
		}
		if itUpdate.Qty != nil && *itUpdate.Qty != oldQty {
			if *itUpdate.Qty <= 0 {
				respondError(w, http.StatusBadRequest, "qty must be greater than 0")
				return
			}
			var variantID int
			tx.QueryRow(ctx, `SELECT variant_id FROM purchase_items WHERE id=$1`, itUpdate.ID).Scan(&variantID)
			delta := *itUpdate.Qty - oldQty
			tx.Exec(ctx, `UPDATE purchase_items SET qty=$1 WHERE id=$2`, *itUpdate.Qty, itUpdate.ID)
			tx.Exec(ctx, `UPDATE stock_buckets SET incoming_stock = incoming_stock + $1 WHERE variant_id=$2`, delta, variantID)
			tx.Exec(ctx, `INSERT INTO purchase_change_log (purchase_id, field_name, old_value, new_value, changed_by, reason) VALUES ($1,'qty',$2,$3,$4,$5)`,
				id, strconv.Itoa(oldQty), strconv.Itoa(*itUpdate.Qty), claims.UserID, req.Reason)
		}
		if itUpdate.UnitCost != nil && *itUpdate.UnitCost != oldUnitCost {
			if *itUpdate.UnitCost < 0 {
				respondError(w, http.StatusBadRequest, "unit_cost must not be negative")
				return
			}
			tx.Exec(ctx, `UPDATE purchase_items SET unit_cost=$1 WHERE id=$2`, *itUpdate.UnitCost, itUpdate.ID)
			tx.Exec(ctx, `INSERT INTO purchase_change_log (purchase_id, field_name, old_value, new_value, changed_by, reason) VALUES ($1,'unit_cost',$2,$3,$4,$5)`,
				id, fmt.Sprintf("%.2f", oldUnitCost), fmt.Sprintf("%.2f", *itUpdate.UnitCost), claims.UserID, req.Reason)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "db commit failed")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

type updatePurchaseStatusRequest struct {
	Status string `json:"status"`
	Reason string `json:"reason"`
}

// UpdateStatus moves a purchase between ordered/pending_arrival, or cancels it. Receiving has
// its own dedicated endpoint (Receive) since it also has to move stock.
func (h *PurchaseHandler) UpdateStatus(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid purchase id")
		return
	}
	var req updatePurchaseStatusRequest
	if err := decodeJSON(r, &req); err != nil || !validPurchaseStatuses[req.Status] || req.Status == "received" {
		respondError(w, http.StatusBadRequest, "status must be one of: ordered, pending_arrival, cancelled")
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

	var oldStatus string
	if err := tx.QueryRow(ctx, `SELECT status FROM purchases WHERE id=$1 FOR UPDATE`, id).Scan(&oldStatus); err != nil {
		respondError(w, http.StatusNotFound, "purchase not found")
		return
	}
	if oldStatus == "received" || oldStatus == "cancelled" {
		respondError(w, http.StatusBadRequest, "purchase is already "+oldStatus)
		return
	}
	if req.Status == "cancelled" {
		rows, _ := tx.Query(ctx, `SELECT variant_id, qty FROM purchase_items WHERE purchase_id=$1`, id)
		for rows.Next() {
			var variantID, qty int
			if rows.Scan(&variantID, &qty) == nil {
				tx.Exec(ctx, `UPDATE stock_buckets SET incoming_stock = incoming_stock - $1 WHERE variant_id=$2`, qty, variantID)
			}
		}
		rows.Close()
	}
	tx.Exec(ctx, `UPDATE purchases SET status=$1 WHERE id=$2`, req.Status, id)
	tx.Exec(ctx, `INSERT INTO purchase_change_log (purchase_id, field_name, old_value, new_value, changed_by, reason) VALUES ($1,'status',$2,$3,$4,$5)`,
		id, oldStatus, req.Status, claims.UserID, req.Reason)

	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "db commit failed")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": req.Status})
}

type receiveItem struct {
	ID          int  `json:"id"`
	ReceivedQty *int `json:"received_qty"`
}

type receivePurchaseRequest struct {
	Items []receiveItem `json:"items"`
}

// Receive confirms goods received: incoming_stock is released for the full ordered qty (the PO
// is resolved either way), available_stock increases by the actual received qty (which may be
// less than ordered - supplier shortages etc, reviewable/editable before confirming), and each
// variant's cost_price is refreshed to the purchase's unit_cost.
func (h *PurchaseHandler) Receive(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid purchase id")
		return
	}
	var req receivePurchaseRequest
	decodeJSON(r, &req) // optional body - omitted/empty items means "received exactly as ordered"
	receivedByItem := map[int]int{}
	for _, it := range req.Items {
		if it.ReceivedQty != nil {
			receivedByItem[it.ID] = *it.ReceivedQty
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

	var status string
	if err := tx.QueryRow(ctx, `SELECT status FROM purchases WHERE id=$1 FOR UPDATE`, id).Scan(&status); err != nil {
		respondError(w, http.StatusNotFound, "purchase not found")
		return
	}
	if status != "ordered" && status != "pending_arrival" {
		respondError(w, http.StatusBadRequest, "purchase is not awaiting receipt")
		return
	}

	rows, err := tx.Query(ctx, `SELECT id, variant_id, qty, unit_cost FROM purchase_items WHERE purchase_id=$1`, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load purchase items")
		return
	}
	type item struct {
		ID        int
		VariantID int
		Qty       int
		UnitCost  float64
	}
	var items []item
	for rows.Next() {
		var it item
		rows.Scan(&it.ID, &it.VariantID, &it.Qty, &it.UnitCost)
		items = append(items, it)
	}
	rows.Close()

	for _, it := range items {
		receivedQty := it.Qty
		if v, ok := receivedByItem[it.ID]; ok {
			receivedQty = v
		}
		if _, err := tx.Exec(ctx, `
			UPDATE stock_buckets SET available_stock = available_stock + $1, incoming_stock = incoming_stock - $2 WHERE variant_id=$3`,
			receivedQty, it.Qty, it.VariantID); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to update stock")
			return
		}
		if _, err := tx.Exec(ctx, `UPDATE purchase_items SET received_qty=$1 WHERE id=$2`, receivedQty, it.ID); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to record received qty")
			return
		}
		if _, err := tx.Exec(ctx, `UPDATE product_variants SET cost_price=$1 WHERE id=$2`, it.UnitCost, it.VariantID); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to update cost price")
			return
		}
		tx.Exec(ctx, `
			INSERT INTO stock_movements (variant_id, bucket_from, bucket_to, qty, event_type, user_id, note)
			VALUES ($1,'(supplier)','available_stock',$2,'purchase_received',$3,$4)`,
			it.VariantID, receivedQty, claims.UserID, fmt.Sprintf("purchase #%d received", id))
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

// Delete removes a purchase still in 'ordered'/'pending_arrival' status, releasing its
// incoming_stock reservation (a received purchase has already affected stock and cost_price -
// use Cancel via UpdateStatus for anything past that, or Delete for a plain mistake before
// receipt).
func (h *PurchaseHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid purchase id")
		return
	}
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
	if status != "ordered" && status != "pending_arrival" {
		respondError(w, http.StatusBadRequest, "purchase already received or cancelled")
		return
	}
	rows, _ := tx.Query(ctx, `SELECT variant_id, qty FROM purchase_items WHERE purchase_id=$1`, id)
	for rows.Next() {
		var variantID, qty int
		if rows.Scan(&variantID, &qty) == nil {
			tx.Exec(ctx, `UPDATE stock_buckets SET incoming_stock = incoming_stock - $1 WHERE variant_id=$2`, qty, variantID)
		}
	}
	rows.Close()
	if _, err := tx.Exec(ctx, `DELETE FROM purchases WHERE id=$1`, id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to delete purchase")
		return
	}
	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "db commit failed")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// --- Purchase History & Cost Analysis ---

type purchaseHistoryRow struct {
	PONumber     string  `json:"po_number"`
	SupplierName string  `json:"supplier_name"`
	PurchaseDate string  `json:"purchase_date"`
	ProductSKU   string  `json:"product_sku"`
	ProductName  string  `json:"product_name"`
	Qty          int     `json:"qty"`
	UnitCost     float64 `json:"unit_cost"`
	TotalCost    float64 `json:"total_cost"`
	ReceivedDate *string `json:"received_date"`
}

type purchaseHistorySummary struct {
	TotalPurchaseAmount float64  `json:"total_purchase_amount"`
	TotalPurchaseQty    int      `json:"total_purchase_qty"`
	AveragePurchaseCost *float64 `json:"average_purchase_cost"`
	GrossProfit         float64  `json:"gross_profit"`
	GrossMargin         *float64 `json:"gross_margin"`
}

// History lists completed (received) purchases for lookup/analysis, filterable by supplier,
// product code, and date range, with summary cards including Gross Profit/Margin computed the
// same way as the existing Profit dashboard (GMV minus qty-sold x current cost_price - not
// per-lot/FIFO costing).
func (h *PurchaseHandler) History(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	where := ` WHERE p.status = 'received'`
	args := []interface{}{}
	argN := 1
	if supplierID := q.Get("supplier_id"); supplierID != "" {
		args = append(args, supplierID)
		where += fmt.Sprintf(" AND p.supplier_id = $%d", argN)
		argN++
	}
	if productSKU := q.Get("product_sku"); productSKU != "" {
		args = append(args, productSKU)
		where += fmt.Sprintf(" AND pr.sku = $%d", argN)
		argN++
	}
	from, to, filtered := dateRange(r)
	if filtered {
		args = append(args, from, to)
		where += fmt.Sprintf(" AND p.order_date >= $%d AND p.order_date < $%d", argN, argN+1)
		argN += 2
	}

	rows, err := h.DB.Query(r.Context(), `
		SELECT p.po_number, s.name, p.order_date::text, COALESCE(pr.sku,''), pr.name, pi.qty, pi.unit_cost,
		       pi.qty*pi.unit_cost, p.received_at::text
		FROM purchase_items pi
		JOIN purchases p ON p.id = pi.purchase_id
		JOIN suppliers s ON s.id = p.supplier_id
		JOIN product_variants pv ON pv.id = pi.variant_id
		JOIN products pr ON pr.id = pv.product_id`+where+`
		ORDER BY p.order_date DESC`, args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch purchase history")
		return
	}
	defer rows.Close()

	list := []purchaseHistoryRow{}
	var totalAmount float64
	var totalQty int
	for rows.Next() {
		var row purchaseHistoryRow
		if err := rows.Scan(&row.PONumber, &row.SupplierName, &row.PurchaseDate, &row.ProductSKU, &row.ProductName,
			&row.Qty, &row.UnitCost, &row.TotalCost, &row.ReceivedDate); err != nil {
			continue
		}
		totalAmount += row.TotalCost
		totalQty += row.Qty
		list = append(list, row)
	}

	summary := purchaseHistorySummary{TotalPurchaseAmount: totalAmount, TotalPurchaseQty: totalQty}
	if totalQty > 0 {
		avg := totalAmount / float64(totalQty)
		summary.AveragePurchaseCost = &avg
	}

	// Gross profit for the same scope: GMV of sold items in-range minus qty_sold x current cost_price.
	gpWhere := ` WHERE o.status NOT IN ('cancelled','return') AND o.created_at >= $1 AND o.created_at < $2`
	gpArgs := []interface{}{from, to}
	if !filtered {
		gpWhere = ` WHERE o.status NOT IN ('cancelled','return')`
		gpArgs = []interface{}{}
	}
	if supplierID := q.Get("supplier_id"); supplierID != "" {
		gpArgs = append(gpArgs, supplierID)
		gpWhere += fmt.Sprintf(" AND pr.supplier_id = $%d", len(gpArgs))
	}
	if productSKU := q.Get("product_sku"); productSKU != "" {
		gpArgs = append(gpArgs, productSKU)
		gpWhere += fmt.Sprintf(" AND pr.sku = $%d", len(gpArgs))
	}
	h.DB.QueryRow(r.Context(), `
		SELECT COALESCE(SUM(oi.qty*oi.price_at_order - oi.qty*pv.cost_price),0)
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		JOIN product_variants pv ON pv.id = oi.variant_id
		JOIN products pr ON pr.id = pv.product_id`+gpWhere, gpArgs...).Scan(&summary.GrossProfit)
	var gmv float64
	gmvWhere := gpWhere
	h.DB.QueryRow(r.Context(), `
		SELECT COALESCE(SUM(oi.qty*oi.price_at_order),0)
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		JOIN product_variants pv ON pv.id = oi.variant_id
		JOIN products pr ON pr.id = pv.product_id`+gmvWhere, gpArgs...).Scan(&gmv)
	if gmv > 0 {
		margin := summary.GrossProfit / gmv * 100
		summary.GrossMargin = &margin
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{"rows": list, "summary": summary})
}
