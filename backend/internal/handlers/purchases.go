package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
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

var validPurchaseStatuses = map[string]bool{"ordered": true, "pending_arrival": true, "partially_received": true, "received": true, "cancelled": true}

// A PO is "open" (still has goods to receive, qty/dates editable) in these statuses.
// ordered/pending_arrival = Waiting for Delivery; partially_received is set automatically once a
// delivery batch has been confirmed but some quantity is still outstanding in Incoming.
func isOpenPurchaseStatus(s string) bool {
	return s == "ordered" || s == "pending_arrival" || s == "partially_received"
}

type purchaseBatchView struct {
	ID          int     `json:"id"`
	BatchNo     int     `json:"batch_no"`
	PlannedQty  int     `json:"planned_qty"`
	ReceivedQty *int    `json:"received_qty"`
	IsReceived  bool    `json:"is_received"`
	ReceivedAt  *string `json:"received_at"`
}

type purchaseListItemLine struct {
	ID          int                 `json:"id"`
	ProductSKU  string              `json:"product_sku"`
	ProductName string              `json:"product_name"`
	Color       string              `json:"color"`
	Size        string              `json:"size"`
	Qty         int                 `json:"qty"`
	ReceivedQty int                 `json:"received_qty"`
	Batches     []purchaseBatchView `json:"batches"`
}

type purchaseListItem struct {
	ID                  int                    `json:"id"`
	PONumber            string                 `json:"po_number"`
	SourcePRNo          *string                `json:"source_pr_no"`
	SupplierName        string                 `json:"supplier_name"`
	OrderDate           string                 `json:"order_date"`
	ExpectedArrivalDate *string                `json:"expected_arrival_date"`
	Status              string                 `json:"status"`
	ItemCount           int                    `json:"item_count"`
	TotalQty            int                    `json:"total_qty"`
	ReceivedQty         int                    `json:"received_qty"`
	TotalCost           float64                `json:"total_cost"`
	CreatedAt           string                 `json:"created_at"`
	Items               []purchaseListItemLine `json:"items"`
}

// List supports ?status, ?search (supplier name, internal product code - product or variant
// SKU - partial/case-insensitive; also PO and source PR number) and ?date=YYYY-MM-DD (POs created
// that day, Jakarta time). Search and date combine. Each row carries its items with delivery
// batches so the page can expand a PO without another request.
func (h *PurchaseHandler) List(w http.ResponseWriter, r *http.Request) {
	where := " WHERE 1=1 "
	args := []interface{}{}
	add := func(v interface{}) string { args = append(args, v); return "$" + strconv.Itoa(len(args)) }
	q := r.URL.Query()
	if status := q.Get("status"); status != "" {
		where += " AND p.status = " + add(status)
	}
	if search := strings.TrimSpace(q.Get("search")); search != "" {
		like := add("%" + search + "%")
		where += ` AND (s.name ILIKE ` + like + ` OR p.po_number ILIKE ` + like + `
			OR EXISTS (SELECT 1 FROM purchase_requisition_suppliers prs JOIN purchase_requisitions pq ON pq.id = prs.requisition_id
			           WHERE prs.purchase_id = p.id AND pq.requisition_no ILIKE ` + like + `)
			OR EXISTS (SELECT 1 FROM purchase_items pi
			           JOIN product_variants pv ON pv.id = pi.variant_id JOIN products pr ON pr.id = pv.product_id
			           WHERE pi.purchase_id = p.id AND (pr.sku ILIKE ` + like + ` OR pv.sku ILIKE ` + like + `)))`
	}
	if date := strings.TrimSpace(q.Get("date")); date != "" {
		where += " AND (p.created_at AT TIME ZONE 'Asia/Jakarta')::date = " + add(date) + "::date"
	}
	rows, err := h.DB.Query(r.Context(), `
		SELECT p.id, p.po_number,
		       (SELECT pq.requisition_no FROM purchase_requisition_suppliers prs
		        JOIN purchase_requisitions pq ON pq.id = prs.requisition_id WHERE prs.purchase_id = p.id LIMIT 1),
		       s.name, p.order_date::text, p.expected_arrival_date::text, p.status,
		       COALESCE((SELECT COUNT(*) FROM purchase_items pi WHERE pi.purchase_id = p.id), 0),
		       COALESCE((SELECT SUM(pi.qty) FROM purchase_items pi WHERE pi.purchase_id = p.id), 0),
		       COALESCE((SELECT SUM(COALESCE(pi.received_qty,0)) FROM purchase_items pi WHERE pi.purchase_id = p.id), 0),
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
	ids := []int{}
	idx := map[int]int{}
	for rows.Next() {
		var p purchaseListItem
		if err := rows.Scan(&p.ID, &p.PONumber, &p.SourcePRNo, &p.SupplierName, &p.OrderDate, &p.ExpectedArrivalDate, &p.Status,
			&p.ItemCount, &p.TotalQty, &p.ReceivedQty, &p.TotalCost, &p.CreatedAt); err != nil {
			continue
		}
		p.Items = []purchaseListItemLine{}
		idx[p.ID] = len(list)
		ids = append(ids, p.ID)
		list = append(list, p)
	}
	rows.Close()

	if len(ids) > 0 {
		lineIdx := map[int][2]int{} // item id -> [list idx, line idx]
		itemRows, err := h.DB.Query(r.Context(), `
			SELECT pi.purchase_id, pi.id, COALESCE(pr.sku,''), `+productNameSQL(r, "pr")+`, pv.color, pv.size, pi.qty, COALESCE(pi.received_qty,0)
			FROM purchase_items pi
			JOIN product_variants pv ON pv.id = pi.variant_id
			JOIN products pr ON pr.id = pv.product_id
			WHERE pi.purchase_id = ANY($1) ORDER BY pi.id`, ids)
		if err == nil {
			for itemRows.Next() {
				var pid int
				var l purchaseListItemLine
				if itemRows.Scan(&pid, &l.ID, &l.ProductSKU, &l.ProductName, &l.Color, &l.Size, &l.Qty, &l.ReceivedQty) != nil {
					continue
				}
				l.Batches = []purchaseBatchView{}
				i := idx[pid]
				lineIdx[l.ID] = [2]int{i, len(list[i].Items)}
				list[i].Items = append(list[i].Items, l)
			}
			itemRows.Close()
		}
		itemIDs := make([]int, 0, len(lineIdx))
		for id := range lineIdx {
			itemIDs = append(itemIDs, id)
		}
		if bRows, err := h.DB.Query(r.Context(), `
			SELECT purchase_item_id, id, batch_no, planned_qty, received_qty, is_received, received_at::text
			FROM purchase_item_batches WHERE purchase_item_id = ANY($1) ORDER BY purchase_item_id, batch_no`, itemIDs); err == nil {
			for bRows.Next() {
				var itemID int
				var b purchaseBatchView
				if bRows.Scan(&itemID, &b.ID, &b.BatchNo, &b.PlannedQty, &b.ReceivedQty, &b.IsReceived, &b.ReceivedAt) != nil {
					continue
				}
				pos := lineIdx[itemID]
				list[pos[0]].Items[pos[1]].Batches = append(list[pos[0]].Items[pos[1]].Batches, b)
			}
			bRows.Close()
		}
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
	ProductSKU  string  `json:"product_sku"` // the internal Product Code (e.g. C011), not the variant SKU
	Qty         int     `json:"qty"`
	UnitCost    float64 `json:"unit_cost"`
	ReceivedQty *int    `json:"received_qty"`
	// Remaining is what is still outstanding in Incoming for this line (qty - received).
	Remaining int                 `json:"remaining"`
	Batches   []purchaseBatchView `json:"batches"`
	// PlanTotal is the sum of all batch planned qty; PlanMismatch warns (never blocks) when it
	// differs from the order qty.
	PlanTotal    int  `json:"plan_total"`
	PlanMismatch bool `json:"plan_mismatch"`
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
	SourcePRID          *int                 `json:"source_pr_id"`
	SourcePRNo          *string              `json:"source_pr_no"`
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
	h.DB.QueryRow(ctx, `
		SELECT pq.id, pq.requisition_no FROM purchase_requisition_suppliers prs
		JOIN purchase_requisitions pq ON pq.id = prs.requisition_id WHERE prs.purchase_id = $1 LIMIT 1`, id).
		Scan(&p.SourcePRID, &p.SourcePRNo)

	rows, err := h.DB.Query(ctx, `
		SELECT pi.id, pi.variant_id, `+productNameSQL(r, "pr")+`, pv.color, pv.size, pv.sku, COALESCE(pr.sku,''), pi.qty, pi.unit_cost, pi.received_qty
		FROM purchase_items pi
		JOIN product_variants pv ON pv.id = pi.variant_id
		JOIN products pr ON pr.id = pv.product_id
		WHERE pi.purchase_id = $1 ORDER BY pi.id`, id)
	p.Items = []purchaseItemView{}
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var it purchaseItemView
			if err := rows.Scan(&it.ID, &it.VariantID, &it.ProductName, &it.Color, &it.Size, &it.SKU, &it.ProductSKU, &it.Qty, &it.UnitCost, &it.ReceivedQty); err != nil {
				continue
			}
			it.Batches = []purchaseBatchView{}
			it.Remaining = it.Qty
			if it.ReceivedQty != nil {
				it.Remaining = it.Qty - *it.ReceivedQty
			}
			if it.Remaining < 0 || p.Status == "received" || p.Status == "cancelled" {
				it.Remaining = 0
			}
			p.Items = append(p.Items, it)
		}
		rows.Close()
	}
	if len(p.Items) > 0 {
		itemPos := map[int]int{}
		itemIDs := []int{}
		for i, it := range p.Items {
			itemPos[it.ID] = i
			itemIDs = append(itemIDs, it.ID)
		}
		if bRows, err := h.DB.Query(ctx, `
			SELECT purchase_item_id, id, batch_no, planned_qty, received_qty, is_received, received_at::text
			FROM purchase_item_batches WHERE purchase_item_id = ANY($1) ORDER BY purchase_item_id, batch_no`, itemIDs); err == nil {
			for bRows.Next() {
				var itemID int
				var b purchaseBatchView
				if bRows.Scan(&itemID, &b.ID, &b.BatchNo, &b.PlannedQty, &b.ReceivedQty, &b.IsReceived, &b.ReceivedAt) != nil {
					continue
				}
				i := itemPos[itemID]
				p.Items[i].Batches = append(p.Items[i].Batches, b)
				p.Items[i].PlanTotal += b.PlannedQty
			}
			bRows.Close()
		}
		for i := range p.Items {
			p.Items[i].PlanMismatch = p.Items[i].PlanTotal != p.Items[i].Qty
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

// createPurchaseTx inserts one purchases row + its purchase_items + reserves incoming_stock per
// item, within a caller-managed transaction. Shared by PurchaseHandler.Create (direct quick
// create) and the Purchase Requisition Submit flow (one call per confirmed supplier group) -
// the only two places a real Purchase Order is ever created, so both funnel through here to
// keep the "PO number assignment + incoming_stock reservation" logic in exactly one place.
func createPurchaseTx(ctx context.Context, tx pgx.Tx, supplierID int, orderDate string, expectedArrivalDate string, notes string, createdBy int, items []createPurchaseItem) (int, error) {
	var expectedArrival interface{}
	if expectedArrivalDate != "" {
		expectedArrival = expectedArrivalDate
	}

	// po_number is NOT NULL + UNIQUE (migration 063) but derived from the row's own id, which
	// isn't known until after INSERT - seed it with a throwaway-but-unique placeholder (fits
	// VARCHAR(30): 'P' + 20 hex chars) so the INSERT itself satisfies both constraints, then
	// overwrite it with the real PO-#### value right below.
	var purchaseID int
	if err := tx.QueryRow(ctx, `
		INSERT INTO purchases (po_number, supplier_id, order_date, expected_arrival_date, notes, created_by)
		VALUES ('P' || substr(md5(clock_timestamp()::text || random()::text), 1, 20), $1,$2,$3,$4,$5) RETURNING id`,
		supplierID, orderDate, expectedArrival, notes, createdBy).Scan(&purchaseID); err != nil {
		return 0, fmt.Errorf("failed to create purchase: %w", err)
	}
	if _, err := tx.Exec(ctx, `UPDATE purchases SET po_number = 'PO-' || LPAD($1::text, 5, '0') WHERE id=$1`, purchaseID); err != nil {
		return 0, fmt.Errorf("failed to assign PO number: %w", err)
	}
	for _, it := range items {
		var itemID int
		if err := tx.QueryRow(ctx, `
			INSERT INTO purchase_items (purchase_id, variant_id, qty, unit_cost) VALUES ($1,$2,$3,$4) RETURNING id`,
			purchaseID, it.VariantID, it.Qty, it.UnitCost).Scan(&itemID); err != nil {
			return 0, fmt.Errorf("failed to add purchase item: %w", err)
		}
		// Every item starts with one delivery batch for the full qty; "Split Delivery" adds more.
		if _, err := tx.Exec(ctx, `INSERT INTO purchase_item_batches (purchase_item_id, batch_no, planned_qty) VALUES ($1, 1, $2)`, itemID, it.Qty); err != nil {
			return 0, fmt.Errorf("failed to add delivery batch: %w", err)
		}
		if _, err := tx.Exec(ctx, `UPDATE stock_buckets SET incoming_stock = incoming_stock + $1 WHERE variant_id=$2`, it.Qty, it.VariantID); err != nil {
			return 0, fmt.Errorf("failed to reserve incoming stock: %w", err)
		}
	}
	return purchaseID, nil
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

	purchaseID, err := createPurchaseTx(ctx, tx, req.SupplierID, req.OrderDate, req.ExpectedArrivalDate, req.Notes, claims.UserID, req.Items)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
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
	if !isOpenPurchaseStatus(status) {
		respondError(w, http.StatusBadRequest, "purchase can only be edited before it's fully received or cancelled")
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
		var alreadyReceived int
		if err := tx.QueryRow(ctx, `SELECT qty, unit_cost, COALESCE(received_qty,0) FROM purchase_items WHERE id=$1 AND purchase_id=$2`, itUpdate.ID, id).
			Scan(&oldQty, &oldUnitCost, &alreadyReceived); err != nil {
			continue
		}
		if itUpdate.Qty != nil && *itUpdate.Qty != oldQty {
			if *itUpdate.Qty <= 0 {
				respondError(w, http.StatusBadRequest, "qty must be greater than 0")
				return
			}
			if *itUpdate.Qty < alreadyReceived {
				respondError(w, http.StatusBadRequest, fmt.Sprintf("qty cannot be lower than the %d already received", alreadyReceived))
				return
			}
			var variantID int
			tx.QueryRow(ctx, `SELECT variant_id FROM purchase_items WHERE id=$1`, itUpdate.ID).Scan(&variantID)
			delta := *itUpdate.Qty - oldQty
			tx.Exec(ctx, `UPDATE purchase_items SET qty=$1 WHERE id=$2`, *itUpdate.Qty, itUpdate.ID)
			tx.Exec(ctx, `UPDATE stock_buckets SET incoming_stock = incoming_stock + $1 WHERE variant_id=$2`, delta, variantID)
			// A line that was never split (exactly one, still-open batch) keeps that batch in step
			// with the new order qty, so receiving it defaults to the right amount.
			tx.Exec(ctx, `
				UPDATE purchase_item_batches SET planned_qty=$1
				WHERE purchase_item_id=$2 AND NOT is_received
				  AND (SELECT COUNT(*) FROM purchase_item_batches WHERE purchase_item_id=$2) = 1`, *itUpdate.Qty, itUpdate.ID)
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

	// Lowering a partially received line's qty to what was already received resolves it.
	if _, err := recomputePurchaseStatus(ctx, tx, id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to update purchase status")
		return
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
	if err := decodeJSON(r, &req); err != nil || !validPurchaseStatuses[req.Status] || req.Status == "received" || req.Status == "partially_received" {
		respondError(w, http.StatusBadRequest, "status must be one of: ordered, pending_arrival, cancelled (received / partially received follow the receiving progress automatically)")
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
	if oldStatus == "partially_received" && req.Status != "cancelled" {
		respondError(w, http.StatusBadRequest, "a partially received purchase can only be cancelled")
		return
	}
	if req.Status == "cancelled" {
		// Release only what is still outstanding in Incoming - batches already received have
		// already moved to Actual Stock and stay there.
		if err := releaseIncomingTx(ctx, tx, id); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to release incoming stock")
			return
		}
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

// Receive is the legacy "whole PO" receive endpoint, kept for compatibility: it confirms every
// open delivery batch (at its planned qty, or the item's override when the line has a single open
// batch). Receiving is really per batch now (ConfirmBatch) - a PO becomes Received only when no
// quantity is left outstanding in Incoming.
func (h *PurchaseHandler) Receive(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid purchase id")
		return
	}
	var req receivePurchaseRequest
	decodeJSON(r, &req) // optional body
	override := map[int]int{}
	for _, it := range req.Items {
		if it.ReceivedQty != nil {
			override[it.ID] = *it.ReceivedQty
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
	if !isOpenPurchaseStatus(status) {
		respondError(w, http.StatusBadRequest, "purchase is not awaiting receipt")
		return
	}
	rows, err := tx.Query(ctx, `
		SELECT b.id, b.purchase_item_id, b.planned_qty,
		       (SELECT COUNT(*) FROM purchase_item_batches x WHERE x.purchase_item_id = b.purchase_item_id AND NOT x.is_received)
		FROM purchase_item_batches b JOIN purchase_items pi ON pi.id = b.purchase_item_id
		WHERE pi.purchase_id=$1 AND NOT b.is_received ORDER BY b.purchase_item_id, b.batch_no`, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load delivery batches")
		return
	}
	type open struct{ batchID, itemID, planned, openOnLine int }
	var batches []open
	for rows.Next() {
		var o open
		if rows.Scan(&o.batchID, &o.itemID, &o.planned, &o.openOnLine) == nil {
			batches = append(batches, o)
		}
	}
	rows.Close()
	for _, o := range batches {
		qty := o.planned
		if v, ok := override[o.itemID]; ok && o.openOnLine == 1 {
			qty = v
		}
		if qty <= 0 {
			continue
		}
		if msg := confirmBatchTx(ctx, tx, o.batchID, qty, claims.UserID); msg != "" {
			respondError(w, http.StatusBadRequest, msg)
			return
		}
	}
	if _, err := recomputePurchaseStatus(ctx, tx, id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to update purchase status")
		return
	}
	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "db commit failed")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// releaseIncomingTx gives back to Incoming-reservations whatever a PO still has outstanding
// (qty - received) when it is cancelled or deleted. The rows are read fully BEFORE any UPDATE:
// running tx.Exec while a tx.Query result is still open is "conn busy" in pgx, and the earlier
// inline loops ignored that error, so a cancelled/deleted PO never actually released its Incoming.
func releaseIncomingTx(ctx context.Context, tx pgx.Tx, purchaseID int) error {
	rows, err := tx.Query(ctx, `SELECT variant_id, GREATEST(qty - COALESCE(received_qty,0), 0) FROM purchase_items WHERE purchase_id=$1`, purchaseID)
	if err != nil {
		return err
	}
	type line struct{ variantID, qty int }
	var lines []line
	for rows.Next() {
		var l line
		if err := rows.Scan(&l.variantID, &l.qty); err != nil {
			rows.Close()
			return err
		}
		lines = append(lines, l)
	}
	rows.Close()
	for _, l := range lines {
		if _, err := tx.Exec(ctx, `UPDATE stock_buckets SET incoming_stock = incoming_stock - $1 WHERE variant_id=$2`, l.qty, l.variantID); err != nil {
			return err
		}
	}
	return nil
}

// recomputePurchaseStatus derives the PO status from receiving progress: nothing received yet ->
// unchanged (Waiting for Delivery); something received and nothing left outstanding in Incoming ->
// received; otherwise partially_received. Never touches cancelled/received POs' other fields.
func recomputePurchaseStatus(ctx context.Context, tx pgx.Tx, purchaseID int) (string, error) {
	var status string
	if err := tx.QueryRow(ctx, `SELECT status FROM purchases WHERE id=$1`, purchaseID).Scan(&status); err != nil {
		return "", err
	}
	if !isOpenPurchaseStatus(status) {
		return status, nil
	}
	var remaining, received int
	if err := tx.QueryRow(ctx, `
		SELECT COALESCE(SUM(GREATEST(qty - COALESCE(received_qty,0), 0)), 0), COALESCE(SUM(COALESCE(received_qty,0)), 0)
		FROM purchase_items WHERE purchase_id=$1`, purchaseID).Scan(&remaining, &received); err != nil {
		return "", err
	}
	switch {
	case received > 0 && remaining == 0:
		status = "received"
		if _, err := tx.Exec(ctx, `UPDATE purchases SET status='received', received_at=COALESCE(received_at, now()) WHERE id=$1`, purchaseID); err != nil {
			return "", err
		}
	case received > 0:
		status = "partially_received"
		if _, err := tx.Exec(ctx, `UPDATE purchases SET status='partially_received' WHERE id=$1`, purchaseID); err != nil {
			return "", err
		}
	}
	return status, nil
}

// confirmBatchTx marks one delivery batch received with the actual quantity and moves stock:
// Incoming -= actual, Actual Stock += actual (+ a stock movement, and the variant's cost_price is
// refreshed to the PO unit cost as before). Anything not received stays in Incoming - it is never
// removed automatically. The caller holds the PO row lock and recomputes the PO status. Returns a
// user-facing error message ("" on success).
func confirmBatchTx(ctx context.Context, tx pgx.Tx, batchID, actual, userID int) string {
	var itemID, purchaseID, variantID, qty int
	var unitCost float64
	var isReceived bool
	if err := tx.QueryRow(ctx, `
		SELECT b.purchase_item_id, pi.purchase_id, pi.variant_id, pi.qty, pi.unit_cost, b.is_received
		FROM purchase_item_batches b JOIN purchase_items pi ON pi.id = b.purchase_item_id
		WHERE b.id=$1 FOR UPDATE OF b`, batchID).Scan(&itemID, &purchaseID, &variantID, &qty, &unitCost, &isReceived); err != nil {
		return "delivery batch not found"
	}
	if isReceived {
		return "this delivery batch is already confirmed as received"
	}
	if actual <= 0 {
		return "actual received qty must be greater than 0"
	}
	var receivedSoFar int
	tx.QueryRow(ctx, `SELECT COALESCE(SUM(received_qty),0) FROM purchase_item_batches WHERE purchase_item_id=$1 AND is_received`, itemID).Scan(&receivedSoFar)
	if remaining := qty - receivedSoFar; actual > remaining {
		return fmt.Sprintf("actual received qty %d is more than the %d still outstanding on this order line - raise the order quantity first", actual, max(remaining, 0))
	}
	if _, err := tx.Exec(ctx, `
		UPDATE stock_buckets SET available_stock = available_stock + $1, incoming_stock = incoming_stock - $1 WHERE variant_id=$2`,
		actual, variantID); err != nil {
		return "failed to update stock"
	}
	if _, err := tx.Exec(ctx, `
		UPDATE purchase_item_batches SET received_qty=$1, is_received=true, received_at=now(), received_by=$2 WHERE id=$3`,
		actual, userID, batchID); err != nil {
		return "failed to record received batch"
	}
	if _, err := tx.Exec(ctx, `UPDATE purchase_items SET received_qty=$1 WHERE id=$2`, receivedSoFar+actual, itemID); err != nil {
		return "failed to record received qty"
	}
	tx.Exec(ctx, `UPDATE product_variants SET cost_price=$1 WHERE id=$2`, unitCost, variantID)
	tx.Exec(ctx, `
		INSERT INTO stock_movements (variant_id, bucket_from, bucket_to, qty, event_type, user_id, note)
		VALUES ($1,'(supplier)','available_stock',$2,'purchase_received',$3,$4)`,
		variantID, actual, userID, fmt.Sprintf("purchase #%d batch received", purchaseID))
	return ""
}

type batchRequest struct {
	PlannedQty  *int `json:"planned_qty"`
	ReceivedQty *int `json:"received_qty"`
}

// batchPurchase loads the open PO that owns an item/batch (locking it) - ("" status = not found).
func (h *PurchaseHandler) lockPurchaseFor(ctx context.Context, tx pgx.Tx, query string, arg int) (int, string) {
	var purchaseID int
	if err := tx.QueryRow(ctx, query, arg).Scan(&purchaseID); err != nil {
		return 0, ""
	}
	var status string
	if err := tx.QueryRow(ctx, `SELECT status FROM purchases WHERE id=$1 FOR UPDATE`, purchaseID).Scan(&status); err != nil {
		return 0, ""
	}
	return purchaseID, status
}

// AddBatch ("Split Delivery" / "+ Add Batch") appends a delivery batch to an order line. The
// planned qty is typed by hand; a total that differs from the order qty is only a warning.
func (h *PurchaseHandler) AddBatch(w http.ResponseWriter, r *http.Request) {
	itemID, err := strconv.Atoi(chi.URLParam(r, "itemId"))
	var req batchRequest
	decodeJSON(r, &req)
	if err != nil || (req.PlannedQty != nil && *req.PlannedQty < 0) {
		respondError(w, http.StatusBadRequest, "invalid item or planned qty")
		return
	}
	planned := 0
	if req.PlannedQty != nil {
		planned = *req.PlannedQty
	}
	ctx := r.Context()
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(ctx)
	_, status := h.lockPurchaseFor(ctx, tx, `SELECT purchase_id FROM purchase_items WHERE id=$1`, itemID)
	if status == "" {
		respondError(w, http.StatusNotFound, "order line not found")
		return
	}
	if !isOpenPurchaseStatus(status) {
		respondError(w, http.StatusBadRequest, "delivery batches can only be changed on an open purchase")
		return
	}
	var id int
	if err := tx.QueryRow(ctx, `
		INSERT INTO purchase_item_batches (purchase_item_id, batch_no, planned_qty)
		SELECT $1, COALESCE(MAX(batch_no),0)+1, $2 FROM purchase_item_batches WHERE purchase_item_id=$1 RETURNING id`,
		itemID, planned).Scan(&id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to add batch")
		return
	}
	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "db commit failed")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]int{"id": id})
}

// UpdateBatch edits an unreceived batch's planned qty.
func (h *PurchaseHandler) UpdateBatch(w http.ResponseWriter, r *http.Request) {
	batchID, err := strconv.Atoi(chi.URLParam(r, "batchId"))
	var req batchRequest
	if err != nil || decodeJSON(r, &req) != nil || req.PlannedQty == nil || *req.PlannedQty < 0 {
		respondError(w, http.StatusBadRequest, "planned_qty (0 or more) is required")
		return
	}
	ctx := r.Context()
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(ctx)
	_, status := h.lockPurchaseFor(ctx, tx, `SELECT pi.purchase_id FROM purchase_item_batches b JOIN purchase_items pi ON pi.id=b.purchase_item_id WHERE b.id=$1`, batchID)
	if status == "" {
		respondError(w, http.StatusNotFound, "delivery batch not found")
		return
	}
	if !isOpenPurchaseStatus(status) {
		respondError(w, http.StatusBadRequest, "delivery batches can only be changed on an open purchase")
		return
	}
	ct, err := tx.Exec(ctx, `UPDATE purchase_item_batches SET planned_qty=$1 WHERE id=$2 AND NOT is_received`, *req.PlannedQty, batchID)
	if err != nil || ct.RowsAffected() == 0 {
		respondError(w, http.StatusBadRequest, "a received batch can't be edited")
		return
	}
	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "db commit failed")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// DeleteBatch removes an unreceived batch (a line always keeps at least one).
func (h *PurchaseHandler) DeleteBatch(w http.ResponseWriter, r *http.Request) {
	batchID, err := strconv.Atoi(chi.URLParam(r, "batchId"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid batch id")
		return
	}
	ctx := r.Context()
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(ctx)
	_, status := h.lockPurchaseFor(ctx, tx, `SELECT pi.purchase_id FROM purchase_item_batches b JOIN purchase_items pi ON pi.id=b.purchase_item_id WHERE b.id=$1`, batchID)
	if status == "" {
		respondError(w, http.StatusNotFound, "delivery batch not found")
		return
	}
	if !isOpenPurchaseStatus(status) {
		respondError(w, http.StatusBadRequest, "delivery batches can only be changed on an open purchase")
		return
	}
	var itemID, count int
	var received bool
	tx.QueryRow(ctx, `SELECT purchase_item_id, is_received FROM purchase_item_batches WHERE id=$1`, batchID).Scan(&itemID, &received)
	tx.QueryRow(ctx, `SELECT COUNT(*) FROM purchase_item_batches WHERE purchase_item_id=$1`, itemID).Scan(&count)
	if received {
		respondError(w, http.StatusBadRequest, "a received batch can't be deleted")
		return
	}
	if count <= 1 {
		respondError(w, http.StatusBadRequest, "an order line needs at least one delivery batch")
		return
	}
	if _, err := tx.Exec(ctx, `DELETE FROM purchase_item_batches WHERE id=$1`, batchID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to delete batch")
		return
	}
	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "db commit failed")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ConfirmBatch is the "Received" checkbox: confirms one batch with its actual received qty
// (defaults to the batch's planned qty, editable) and updates Incoming / Actual Stock and the PO
// status (Waiting for Delivery -> Partially Received -> Received) in one transaction.
func (h *PurchaseHandler) ConfirmBatch(w http.ResponseWriter, r *http.Request) {
	batchID, err := strconv.Atoi(chi.URLParam(r, "batchId"))
	var req batchRequest
	decodeJSON(r, &req)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid batch id")
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
	purchaseID, status := h.lockPurchaseFor(ctx, tx, `SELECT pi.purchase_id FROM purchase_item_batches b JOIN purchase_items pi ON pi.id=b.purchase_item_id WHERE b.id=$1`, batchID)
	if status == "" {
		respondError(w, http.StatusNotFound, "delivery batch not found")
		return
	}
	if !isOpenPurchaseStatus(status) {
		respondError(w, http.StatusBadRequest, "this purchase is already received or cancelled")
		return
	}
	actual := 0
	if req.ReceivedQty != nil {
		actual = *req.ReceivedQty
	} else {
		tx.QueryRow(ctx, `SELECT planned_qty FROM purchase_item_batches WHERE id=$1`, batchID).Scan(&actual)
	}
	if msg := confirmBatchTx(ctx, tx, batchID, actual, claims.UserID); msg != "" {
		respondError(w, http.StatusBadRequest, msg)
		return
	}
	newStatus, err := recomputePurchaseStatus(ctx, tx, purchaseID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to update purchase status")
		return
	}
	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "db commit failed")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": newStatus})
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
	if status == "partially_received" {
		respondError(w, http.StatusBadRequest, "part of this purchase is already received - cancel it instead of deleting")
		return
	}
	if status != "ordered" && status != "pending_arrival" {
		respondError(w, http.StatusBadRequest, "purchase already received or cancelled")
		return
	}
	if err := releaseIncomingTx(ctx, tx, id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to release incoming stock")
		return
	}
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
		SELECT p.po_number, s.name, p.order_date::text, COALESCE(pr.sku,''), `+chineseNameSQL("pr")+`, pi.qty, pi.unit_cost,
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
