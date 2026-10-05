package handlers

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	appmw "ordermgmt/internal/middleware"
)

// PurchaseRequisitionHandler implements the "Purchase Requisition & Procurement Workflow" PDF
// and its follow-up "Purchase Requisitions - Adjustments" PDF: pick Products first (not
// Suppliers), the system auto-groups the picked items by their product's Supplier, each Supplier
// group is confirmed independently (qty/cost), and confirming the order creates one real
// Purchase Order per confirmed group via the existing purchases.go machinery (createPurchaseTx)
// - this handler never touches stock or purchase_items itself outside of that shared call.
//
// A requisition's status is a 4-state lifecycle: draft -> pending_contact -> ordered -> completed
// (the purchase_requisitions.status column stays a plain VARCHAR, matching orders.status/
// purchases.status's existing convention - no CHECK constraint).
//   - SubmitForConfirmation moves draft -> pending_contact (no side effects, just opens the
//     requisition up for per-supplier confirmation).
//   - ConfirmOrder moves pending_contact -> ordered, and is the moment real Purchase Orders are
//     created (one per confirmed Supplier group) - blocked until every group is confirmed.
//   - Detail auto-completes ordered -> completed once every linked Purchase Order is fully
//     received (see the UPDATE at the top of Detail).
//
// REQ Detail remains the operational workspace throughout - PO status changes and receiving are
// driven from the same page via the existing purchases.go endpoints, not a separate "go manage
// it in Purchases" step.
type PurchaseRequisitionHandler struct {
	DB *pgxpool.Pool
}

// validRequisitionSupplierStatuses are the per-Supplier-group confirmation values (unchanged
// data values from the original build - only the UI label for "pending_contact" changed, from
// "Pending Contact" to "Waiting", to avoid colliding with the new requisition-level
// "Pending Contact" status introduced by the Adjustments PDF).
var validRequisitionSupplierStatuses = map[string]bool{"pending_contact": true, "confirmed": true}

type requisitionListItem struct {
	ID            int     `json:"id"`
	RequisitionNo string  `json:"requisition_no"`
	Status        string  `json:"status"`
	SupplierCount int     `json:"supplier_count"`
	TotalAmount   float64 `json:"total_amount"`
	CreatedAt     string  `json:"created_at"`
	CompletedAt   *string `json:"completed_at"`
}

func (h *PurchaseRequisitionHandler) List(w http.ResponseWriter, r *http.Request) {
	rows, err := h.DB.Query(r.Context(), `
		SELECT pr.id, pr.requisition_no, pr.status, pr.created_at::text, pr.completed_at::text,
		       COALESCE((SELECT COUNT(*) FROM purchase_requisition_suppliers prs WHERE prs.requisition_id = pr.id), 0),
		       COALESCE((
		           SELECT SUM(COALESCE(pri.confirmed_qty, pri.planned_qty) * COALESCE(pri.unit_cost, pv.cost_price, 0))
		           FROM purchase_requisition_suppliers prs
		           JOIN purchase_requisition_items pri ON pri.requisition_supplier_id = prs.id
		           JOIN product_variants pv ON pv.id = pri.variant_id
		           WHERE prs.requisition_id = pr.id
		       ), 0)
		FROM purchase_requisitions pr
		ORDER BY pr.created_at DESC`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch requisitions")
		return
	}
	defer rows.Close()

	list := []requisitionListItem{}
	for rows.Next() {
		var it requisitionListItem
		if err := rows.Scan(&it.ID, &it.RequisitionNo, &it.Status, &it.CreatedAt, &it.CompletedAt, &it.SupplierCount, &it.TotalAmount); err != nil {
			continue
		}
		list = append(list, it)
	}
	respondJSON(w, http.StatusOK, list)
}

type requisitionItemView struct {
	ID           int      `json:"id"`
	VariantID    int      `json:"variant_id"`
	ProductSKU   string   `json:"product_sku"`
	VendorSKU    string   `json:"vendor_sku"`
	ProductName  string   `json:"product_name"`
	Color        string   `json:"color"`
	Size         string   `json:"size"`
	SKU          string   `json:"sku"`
	PlannedQty   int      `json:"planned_qty"`
	ConfirmedQty *int     `json:"confirmed_qty"`
	UnitCost     *float64 `json:"unit_cost"`
	RuleWarning  string   `json:"rule_warning,omitempty"`
}

type requisitionSupplierView struct {
	ID           int                   `json:"id"`
	SupplierID   int                   `json:"supplier_id"`
	SupplierName string                `json:"supplier_name"`
	Status       string                `json:"status"`
	Notes        string                `json:"notes"`
	PurchaseID   *int                  `json:"purchase_id"`
	PONumber     *string               `json:"po_number"`
	Items        []requisitionItemView `json:"items"`
}

type requisitionDetailView struct {
	ID              int                       `json:"id"`
	RequisitionNo   string                    `json:"requisition_no"`
	Status          string                    `json:"status"`
	CreatedAt       string                    `json:"created_at"`
	UpdatedAt       string                    `json:"updated_at"`
	CompletedAt     *string                   `json:"completed_at"`
	CreatedByName   string                    `json:"created_by_name"`
	Note            string                    `json:"note"`
	Suppliers       []requisitionSupplierView `json:"suppliers"`
}

func (h *PurchaseRequisitionHandler) Detail(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid requisition id")
		return
	}
	ctx := r.Context()

	// An Ordered requisition completes itself the moment every linked Purchase Order (one per
	// confirmed supplier group) has been fully received - no manual "mark complete" step. Running
	// this check on every fetch keeps the completion rule in exactly one place. Groups with no
	// linked purchase_id (an empty group with zero items) are skipped rather than blocking.
	h.DB.Exec(ctx, `
		UPDATE purchase_requisitions SET status='completed', completed_at=now()
		WHERE id=$1 AND status='ordered' AND NOT EXISTS (
			SELECT 1 FROM purchase_requisition_suppliers prs
			JOIN purchases p ON p.id = prs.purchase_id
			WHERE prs.requisition_id=$1 AND p.status <> 'received'
		)`, id)

	var d requisitionDetailView
	if err := h.DB.QueryRow(ctx, `
		SELECT pr.id, pr.requisition_no, pr.status, pr.created_at::text, pr.updated_at::text, pr.completed_at::text,
		       COALESCE(u.name, ''), COALESCE(pr.note, '')
		FROM purchase_requisitions pr
		LEFT JOIN users u ON u.id = pr.created_by
		WHERE pr.id=$1`, id).
		Scan(&d.ID, &d.RequisitionNo, &d.Status, &d.CreatedAt, &d.UpdatedAt, &d.CompletedAt, &d.CreatedByName, &d.Note); err != nil {
		respondError(w, http.StatusNotFound, "requisition not found")
		return
	}

	supRows, err := h.DB.Query(ctx, `
		SELECT prs.id, prs.supplier_id, s.name, prs.status, COALESCE(prs.notes,''), prs.purchase_id, p.po_number
		FROM purchase_requisition_suppliers prs
		JOIN suppliers s ON s.id = prs.supplier_id
		LEFT JOIN purchases p ON p.id = prs.purchase_id
		WHERE prs.requisition_id = $1 ORDER BY s.name`, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch requisition suppliers")
		return
	}
	d.Suppliers = []requisitionSupplierView{}
	for supRows.Next() {
		var sv requisitionSupplierView
		if err := supRows.Scan(&sv.ID, &sv.SupplierID, &sv.SupplierName, &sv.Status, &sv.Notes, &sv.PurchaseID, &sv.PONumber); err != nil {
			continue
		}
		sv.Items = []requisitionItemView{}
		d.Suppliers = append(d.Suppliers, sv)
	}
	supRows.Close()

	itemRows, err := h.DB.Query(ctx, `
		SELECT pri.requisition_supplier_id, pri.id, pri.variant_id, COALESCE(p.sku,''), COALESCE(p.vendor_sku,''), p.name, pv.color, pv.size, pv.sku,
		       pri.planned_qty, pri.confirmed_qty, pri.unit_cost
		FROM purchase_requisition_items pri
		JOIN purchase_requisition_suppliers prs ON prs.id = pri.requisition_supplier_id
		JOIN product_variants pv ON pv.id = pri.variant_id
		JOIN products p ON p.id = pv.product_id
		WHERE prs.requisition_id = $1`, id)
	if err == nil {
		defer itemRows.Close()
		byGroup := map[int][]requisitionItemView{}
		for itemRows.Next() {
			var groupID int
			var it requisitionItemView
			if err := itemRows.Scan(&groupID, &it.ID, &it.VariantID, &it.ProductSKU, &it.VendorSKU, &it.ProductName, &it.Color, &it.Size, &it.SKU,
				&it.PlannedQty, &it.ConfirmedQty, &it.UnitCost); err != nil {
				continue
			}
			byGroup[groupID] = append(byGroup[groupID], it)
		}
		for i := range d.Suppliers {
			d.Suppliers[i].Items = byGroup[d.Suppliers[i].ID]
		}
	}

	respondJSON(w, http.StatusOK, d)
}

// Create starts a new empty draft requisition.
func (h *PurchaseRequisitionHandler) Create(w http.ResponseWriter, r *http.Request) {
	claims := appmw.GetClaims(r)
	var id int
	if err := h.DB.QueryRow(r.Context(), `
		INSERT INTO purchase_requisitions (requisition_no, status, created_by) VALUES ('', 'draft', $1) RETURNING id`,
		claims.UserID).Scan(&id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create requisition")
		return
	}
	if _, err := h.DB.Exec(r.Context(), `UPDATE purchase_requisitions SET requisition_no = 'REQ-' || LPAD($1::text, 5, '0') WHERE id=$1`, id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to assign requisition number")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]int{"id": id})
}

type updateRequisitionRequest struct {
	Note *string `json:"note"`
}

// UpdateRequisition sets the requisition-level Note (distinct from each Supplier group's own
// note) from the header's "Edit" action.
func (h *PurchaseRequisitionHandler) UpdateRequisition(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid requisition id")
		return
	}
	var req updateRequisitionRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Note != nil {
		if _, err := h.DB.Exec(r.Context(), `UPDATE purchase_requisitions SET note=$1, updated_at=now() WHERE id=$2`, *req.Note, id); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to update requisition")
			return
		}
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

type addRequisitionItemRequest struct {
	VariantID  int `json:"variant_id"`
	PlannedQty int `json:"planned_qty"`
}

// AddItem adds one product's variant + Planned QTY to the requisition. The Supplier is
// auto-detected from the variant's product and the item is grouped into (or merged with) that
// Supplier's group automatically - the caller never picks a supplier. Adding the same variant
// again updates its planned_qty rather than erroring, so re-opening a product and changing the
// qty just works. Allowed in both Draft and Pending Contact (Planned QTY stays editable through
// Pending Contact per the Adjustments PDF), locked once Ordered.
func (h *PurchaseRequisitionHandler) AddItem(w http.ResponseWriter, r *http.Request) {
	requisitionID, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid requisition id")
		return
	}
	var req addRequisitionItemRequest
	if err := decodeJSON(r, &req); err != nil || req.VariantID == 0 || req.PlannedQty <= 0 {
		respondError(w, http.StatusBadRequest, "variant_id and a positive planned_qty are required")
		return
	}
	ctx := r.Context()

	var status string
	if err := h.DB.QueryRow(ctx, `SELECT status FROM purchase_requisitions WHERE id=$1`, requisitionID).Scan(&status); err != nil {
		respondError(w, http.StatusNotFound, "requisition not found")
		return
	}
	if status != "draft" && status != "pending_contact" {
		respondError(w, http.StatusBadRequest, "requisition is no longer open for product changes")
		return
	}

	var supplierID *int
	var productID int
	var costPrice float64
	// Unit Cost defaults from the parent product's own Cost field when set (so every variant of
	// that product shares the same cost), falling back to the variant's own cost_price otherwise.
	if err := h.DB.QueryRow(ctx, `
		SELECT p.id, p.supplier_id, COALESCE(NULLIF(p.cost, 0), pv.cost_price)
		FROM product_variants pv JOIN products p ON p.id = pv.product_id WHERE pv.id=$1`,
		req.VariantID).Scan(&productID, &supplierID, &costPrice); err != nil {
		respondError(w, http.StatusNotFound, "variant not found")
		return
	}
	if supplierID == nil {
		respondError(w, http.StatusBadRequest, "this product has no Supplier set - assign one in Product Management first")
		return
	}

	var groupID int
	if err := h.DB.QueryRow(ctx, `
		INSERT INTO purchase_requisition_suppliers (requisition_id, supplier_id) VALUES ($1,$2)
		ON CONFLICT (requisition_id, supplier_id) DO UPDATE SET supplier_id = EXCLUDED.supplier_id
		RETURNING id`, requisitionID, *supplierID).Scan(&groupID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to group by supplier")
		return
	}

	// Unit Cost defaults from the product's current cost price immediately on add (item 054),
	// instead of staying blank until the group is confirmed - still freely editable afterward.
	// Only set on first insert; a conflict (re-adding/adjusting qty on the same variant) leaves
	// any already-edited unit_cost untouched.
	if _, err := h.DB.Exec(ctx, `
		INSERT INTO purchase_requisition_items (requisition_supplier_id, variant_id, planned_qty, unit_cost)
		VALUES ($1,$2,$3,$4)
		ON CONFLICT (requisition_supplier_id, variant_id) DO UPDATE SET planned_qty = EXCLUDED.planned_qty`,
		groupID, req.VariantID, req.PlannedQty, costPrice); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to add item")
		return
	}
	h.DB.Exec(ctx, `UPDATE purchase_requisitions SET updated_at=now() WHERE id=$1`, requisitionID)

	rules := resolvePurchaseRules(ctx, h.DB, productID)
	var unitPrice float64
	h.DB.QueryRow(ctx, `SELECT price FROM product_variants WHERE id=$1`, req.VariantID).Scan(&unitPrice)
	warning := checkPurchaseRule(rules, req.PlannedQty, unitPrice*float64(req.PlannedQty))

	respondJSON(w, http.StatusOK, map[string]interface{}{"supplier_id": *supplierID, "rule_warning": warning})
}

func (h *PurchaseRequisitionHandler) RemoveItem(w http.ResponseWriter, r *http.Request) {
	itemID, err := strconv.Atoi(chi.URLParam(r, "itemId"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid item id")
		return
	}
	if _, err := h.DB.Exec(r.Context(), `DELETE FROM purchase_requisition_items WHERE id=$1`, itemID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to remove item")
		return
	}
	h.DB.Exec(r.Context(), `
		UPDATE purchase_requisitions SET updated_at=now() WHERE id=(
			SELECT prs.requisition_id FROM purchase_requisition_suppliers prs
			JOIN purchase_requisition_items pri ON pri.requisition_supplier_id = prs.id
			WHERE pri.id=$1
		)`, itemID)
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

type confirmItemUpdate struct {
	ID           int      `json:"id"`
	ConfirmedQty *int     `json:"confirmed_qty"`
	UnitCost     *float64 `json:"unit_cost"`
}

type updateSupplierGroupRequest struct {
	Status *string             `json:"status"`
	Notes  *string             `json:"notes"`
	Items  []confirmItemUpdate `json:"items"`
}

// UpdateSupplierGroup is the Supplier Confirmation step: per-item Confirmed QTY/Unit Cost, plus
// the group's note/status. Setting status='confirmed' without an explicit confirmed_qty/unit_cost
// for an item defaults it to planned_qty / the product's current cost_price. The frontend only
// exposes this while the requisition is Pending Contact (per the Adjustments PDF), but the
// backend doesn't need its own extra gate beyond the existing status enum check.
func (h *PurchaseRequisitionHandler) UpdateSupplierGroup(w http.ResponseWriter, r *http.Request) {
	groupID, err := strconv.Atoi(chi.URLParam(r, "supplierGroupId"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid supplier group id")
		return
	}
	var req updateSupplierGroupRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Status != nil && !validRequisitionSupplierStatuses[*req.Status] {
		respondError(w, http.StatusBadRequest, "status must be pending_contact or confirmed")
		return
	}
	ctx := r.Context()

	for _, it := range req.Items {
		if it.ConfirmedQty != nil {
			h.DB.Exec(ctx, `UPDATE purchase_requisition_items SET confirmed_qty=$1 WHERE id=$2 AND requisition_supplier_id=$3`, *it.ConfirmedQty, it.ID, groupID)
		}
		if it.UnitCost != nil {
			h.DB.Exec(ctx, `UPDATE purchase_requisition_items SET unit_cost=$1 WHERE id=$2 AND requisition_supplier_id=$3`, *it.UnitCost, it.ID, groupID)
		}
	}

	if req.Notes != nil {
		h.DB.Exec(ctx, `UPDATE purchase_requisition_suppliers SET notes=$1 WHERE id=$2`, *req.Notes, groupID)
	}

	if req.Status != nil && *req.Status == "confirmed" {
		// Default any still-unset Confirmed QTY/Unit Cost before locking the group in.
		h.DB.Exec(ctx, `
			UPDATE purchase_requisition_items SET confirmed_qty = planned_qty
			WHERE requisition_supplier_id=$1 AND confirmed_qty IS NULL`, groupID)
		h.DB.Exec(ctx, `
			UPDATE purchase_requisition_items pri SET unit_cost = COALESCE(NULLIF(p.cost, 0), pv.cost_price)
			FROM product_variants pv JOIN products p ON p.id = pv.product_id
			WHERE pri.variant_id = pv.id AND pri.requisition_supplier_id=$1 AND pri.unit_cost IS NULL`, groupID)
	}
	if req.Status != nil {
		h.DB.Exec(ctx, `UPDATE purchase_requisition_suppliers SET status=$1 WHERE id=$2`, *req.Status, groupID)
	}
	h.DB.Exec(ctx, `
		UPDATE purchase_requisitions SET updated_at=now()
		WHERE id=(SELECT requisition_id FROM purchase_requisition_suppliers WHERE id=$1)`, groupID)

	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// SubmitForConfirmation moves Draft -> Pending Contact: no side effects besides the status flip -
// it just opens the requisition up for per-Supplier confirmation. Requires at least one item.
func (h *PurchaseRequisitionHandler) SubmitForConfirmation(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid requisition id")
		return
	}
	ctx := r.Context()

	var status string
	if err := h.DB.QueryRow(ctx, `SELECT status FROM purchase_requisitions WHERE id=$1`, id).Scan(&status); err != nil {
		respondError(w, http.StatusNotFound, "requisition not found")
		return
	}
	if status != "draft" {
		respondError(w, http.StatusBadRequest, "requisition is no longer a draft")
		return
	}
	var groupCount int
	h.DB.QueryRow(ctx, `SELECT COUNT(*) FROM purchase_requisition_suppliers WHERE requisition_id=$1`, id).Scan(&groupCount)
	if groupCount == 0 {
		respondError(w, http.StatusBadRequest, "requisition has no items")
		return
	}

	if _, err := h.DB.Exec(ctx, `UPDATE purchase_requisitions SET status='pending_contact', updated_at=now() WHERE id=$1`, id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to submit requisition")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "pending_contact"})
}

// ConfirmOrder creates one real Purchase Order per confirmed Supplier group (via the same
// createPurchaseTx used by the quick-create Purchase Order flow) and marks the requisition
// Ordered (not Completed - see Detail's auto-completion check: the requisition only becomes
// Completed once every linked Purchase Order is fully received, and REQ Detail stays the
// workspace for managing those POs after confirming). Blocked until every Supplier group is
// confirmed.
func (h *PurchaseRequisitionHandler) ConfirmOrder(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid requisition id")
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
	var reqNote *string
	if err := tx.QueryRow(ctx, `SELECT status, note FROM purchase_requisitions WHERE id=$1 FOR UPDATE`, id).Scan(&status, &reqNote); err != nil {
		respondError(w, http.StatusNotFound, "requisition not found")
		return
	}
	if status != "pending_contact" {
		respondError(w, http.StatusBadRequest, "requisition must be Pending Contact to confirm the order")
		return
	}
	// Item 053: whatever the staff wrote in the requisition's own Note field (editable from
	// Draft onward) carries forward onto every Purchase Order this confirmation creates.
	poNotes := "Created from Purchase Requisition"
	if reqNote != nil && *reqNote != "" {
		poNotes = *reqNote
	}

	type group struct {
		ID         int
		SupplierID int
		Status     string
	}
	groupRows, err := tx.Query(ctx, `SELECT id, supplier_id, status FROM purchase_requisition_suppliers WHERE requisition_id=$1`, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load supplier groups")
		return
	}
	var groups []group
	for groupRows.Next() {
		var g group
		if groupRows.Scan(&g.ID, &g.SupplierID, &g.Status) == nil {
			groups = append(groups, g)
		}
	}
	groupRows.Close()

	if len(groups) == 0 {
		respondError(w, http.StatusBadRequest, "requisition has no items")
		return
	}
	for _, g := range groups {
		if g.Status != "confirmed" {
			respondError(w, http.StatusBadRequest, "every supplier group must be confirmed before confirming the order")
			return
		}
	}

	today := ""
	tx.QueryRow(ctx, `SELECT now()::date::text`).Scan(&today)

	for _, g := range groups {
		itemRows, err := tx.Query(ctx, `
			SELECT variant_id, COALESCE(confirmed_qty, planned_qty), COALESCE(unit_cost, 0)
			FROM purchase_requisition_items WHERE requisition_supplier_id=$1`, g.ID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "failed to load requisition items")
			return
		}
		var items []createPurchaseItem
		for itemRows.Next() {
			var it createPurchaseItem
			if itemRows.Scan(&it.VariantID, &it.Qty, &it.UnitCost) == nil {
				items = append(items, it)
			}
		}
		itemRows.Close()
		if len(items) == 0 {
			continue
		}

		purchaseID, err := createPurchaseTx(ctx, tx, g.SupplierID, today, "", poNotes, claims.UserID, items)
		if err != nil {
			respondError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if _, err := tx.Exec(ctx, `UPDATE purchase_requisition_suppliers SET purchase_id=$1 WHERE id=$2`, purchaseID, g.ID); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to link purchase order")
			return
		}
	}

	if _, err := tx.Exec(ctx, `UPDATE purchase_requisitions SET status='ordered', updated_at=now() WHERE id=$1`, id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to confirm order")
		return
	}
	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "db commit failed")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ordered"})
}

// Delete removes a requisition that hasn't produced any real Purchase Orders yet (Draft or
// Pending Contact - POs are only created at ConfirmOrder). Cascades its supplier groups/items. A
// requisition past that point has real linked Purchase Orders managed from Purchases as usual -
// this never deletes those.
func (h *PurchaseRequisitionHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid requisition id")
		return
	}
	var status string
	if err := h.DB.QueryRow(r.Context(), `SELECT status FROM purchase_requisitions WHERE id=$1`, id).Scan(&status); err != nil {
		respondError(w, http.StatusNotFound, "requisition not found")
		return
	}
	if status != "draft" && status != "pending_contact" {
		respondError(w, http.StatusBadRequest, "only a Draft or Pending Contact requisition can be deleted")
		return
	}
	if _, err := h.DB.Exec(r.Context(), `DELETE FROM purchase_requisitions WHERE id=$1`, id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to delete requisition")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
