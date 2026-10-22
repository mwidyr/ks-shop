package handlers

import (
	"context"
	"net/http"
	"strconv"
	"strings"

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
	pg := parsePage(r, 20, 100)
	total := 0
	listArgs := []interface{}{}
	limit := ""
	if isPaged(r) {
		h.DB.QueryRow(r.Context(), `SELECT COUNT(*) FROM purchase_requisitions`).Scan(&total)
		limit = pg.limitSQL(&listArgs)
	}
	rows, err := h.DB.Query(r.Context(), `
		SELECT pr.id, pr.requisition_no, pr.status, pr.created_at::text, pr.completed_at::text,
		       COALESCE((SELECT COUNT(*) FROM purchase_requisition_suppliers prs WHERE prs.requisition_id = pr.id), 0),
		       COALESCE((
		           SELECT SUM(pri.planned_qty * COALESCE(pri.unit_cost, pv.cost_price, 0))
		           FROM purchase_requisition_suppliers prs
		           JOIN purchase_requisition_items pri ON pri.requisition_supplier_id = prs.id
		           JOIN product_variants pv ON pv.id = pri.variant_id
		           WHERE prs.requisition_id = pr.id
		       ), 0) + COALESCE((
		           SELECT SUM(prs.shipping_amount + prs.extra_amount - prs.discount_amount)
		           FROM purchase_requisition_suppliers prs WHERE prs.requisition_id = pr.id
		       ), 0)
		FROM purchase_requisitions pr
		ORDER BY pr.created_at DESC, pr.id DESC`+limit, listArgs...)
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
	if isPaged(r) {
		respondJSON(w, http.StatusOK, pageResponse(list, total, pg))
		return
	}
	respondJSON(w, http.StatusOK, list)
}

type requisitionItemView struct {
	ID          int      `json:"id"`
	VariantID   int      `json:"variant_id"`
	ProductSKU  string   `json:"product_sku"`
	VendorSKU   string   `json:"vendor_sku"`
	ProductName string   `json:"product_name"`
	Color       string   `json:"color"`
	Size        string   `json:"size"`
	SKU         string   `json:"sku"`
	PlannedQty  int      `json:"planned_qty"`
	UnitCost    *float64 `json:"unit_cost"`
	RuleWarning string   `json:"rule_warning,omitempty"`
	// SupplierOptions are the variant's active linked suppliers (#126) - more than one means the
	// line's supplier can be switched (ChangeItemSupplier).
	SupplierOptions []requisitionSupplierOption `json:"supplier_options"`
}

type requisitionSupplierOption struct {
	SupplierID          int      `json:"supplier_id"`
	SupplierName        string   `json:"supplier_name"`
	SupplierProductCode string   `json:"supplier_product_code"`
	RefPrice            *float64 `json:"ref_price"`
	IsPreferred         bool     `json:"is_preferred"`
}

type requisitionNoteView struct {
	ID            int    `json:"id"`
	Note          string `json:"note"`
	CreatedByName string `json:"created_by_name"`
	CreatedAt     string `json:"created_at"`
	UpdatedAt     string `json:"updated_at"`
}

type requisitionSupplierView struct {
	ID           int                   `json:"id"`
	SupplierID   int                   `json:"supplier_id"`
	SupplierName string                `json:"supplier_name"`
	Status       string                `json:"status"`
	Notes        string                `json:"notes"`
	NotesLog     []requisitionNoteView `json:"notes_log"`
	PurchaseID   *int                  `json:"purchase_id"`
	PONumber     *string               `json:"po_number"`
	Items        []requisitionItemView `json:"items"`
	// Whole-order RMB adjustments so the group total matches the supplier invoice (#134), plus
	// the RMB->TWD rate carried to the PO (used only for FIFO valuation on receipt).
	ExchangeRate   *float64 `json:"exchange_rate"`
	DiscountAmount float64  `json:"discount_amount"`
	ShippingAmount float64  `json:"shipping_amount"`
	ExtraAmount    float64  `json:"extra_amount"`
}

type requisitionDetailView struct {
	ID            int                       `json:"id"`
	RequisitionNo string                    `json:"requisition_no"`
	Status        string                    `json:"status"`
	CreatedAt     string                    `json:"created_at"`
	UpdatedAt     string                    `json:"updated_at"`
	CompletedAt   *string                   `json:"completed_at"`
	CreatedByName string                    `json:"created_by_name"`
	Note          string                    `json:"note"`
	Suppliers     []requisitionSupplierView `json:"suppliers"`
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
		SELECT prs.id, prs.supplier_id, s.name, prs.status, COALESCE(prs.notes,''), prs.purchase_id, p.po_number,
		       prs.exchange_rate, prs.discount_amount, prs.shipping_amount, prs.extra_amount
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
		if err := supRows.Scan(&sv.ID, &sv.SupplierID, &sv.SupplierName, &sv.Status, &sv.Notes, &sv.PurchaseID, &sv.PONumber,
			&sv.ExchangeRate, &sv.DiscountAmount, &sv.ShippingAmount, &sv.ExtraAmount); err != nil {
			continue
		}
		sv.Items = []requisitionItemView{}
		sv.NotesLog = []requisitionNoteView{}
		d.Suppliers = append(d.Suppliers, sv)
	}
	supRows.Close()

	itemRows, err := h.DB.Query(ctx, `
		SELECT pri.requisition_supplier_id, pri.id, pri.variant_id, COALESCE(p.sku,''), COALESCE(p.vendor_sku,''), `+chineseNameSQL("p")+`, pv.color, pv.size, pv.sku,
		       pri.planned_qty, pri.unit_cost
		FROM purchase_requisition_items pri
		JOIN purchase_requisition_suppliers prs ON prs.id = pri.requisition_supplier_id
		JOIN product_variants pv ON pv.id = pri.variant_id
		JOIN products p ON p.id = pv.product_id
		WHERE prs.requisition_id = $1`, id)
	if err == nil {
		byGroup := map[int][]requisitionItemView{}
		variantIDs := []int{}
		for itemRows.Next() {
			var groupID int
			var it requisitionItemView
			if err := itemRows.Scan(&groupID, &it.ID, &it.VariantID, &it.ProductSKU, &it.VendorSKU, &it.ProductName, &it.Color, &it.Size, &it.SKU,
				&it.PlannedQty, &it.UnitCost); err != nil {
				continue
			}
			it.SupplierOptions = []requisitionSupplierOption{}
			byGroup[groupID] = append(byGroup[groupID], it)
			variantIDs = append(variantIDs, it.VariantID)
		}
		itemRows.Close()
		options := map[int][]requisitionSupplierOption{}
		if optRows, err := h.DB.Query(ctx, `
			SELECT vs.variant_id, vs.supplier_id, s.name, COALESCE(vs.supplier_product_code,''), vs.ref_price, vs.is_preferred
			FROM variant_suppliers vs JOIN suppliers s ON s.id = vs.supplier_id
			WHERE vs.variant_id = ANY($1) AND vs.is_active
			ORDER BY vs.is_preferred DESC, s.name`, variantIDs); err == nil {
			for optRows.Next() {
				var vid int
				var o requisitionSupplierOption
				if optRows.Scan(&vid, &o.SupplierID, &o.SupplierName, &o.SupplierProductCode, &o.RefPrice, &o.IsPreferred) == nil {
					options[vid] = append(options[vid], o)
				}
			}
			optRows.Close()
		}
		for i := range d.Suppliers {
			items := byGroup[d.Suppliers[i].ID]
			for j := range items {
				if o := options[items[j].VariantID]; o != nil {
					items[j].SupplierOptions = o
				}
			}
			d.Suppliers[i].Items = items
		}
	}

	// Supplier notes log (added one by one, editable in every status - see AddGroupNote etc).
	if noteRows, err := h.DB.Query(ctx, `
		SELECT n.group_id, n.id, n.note, COALESCE(u.name,'-'), n.created_at::text, n.updated_at::text
		FROM purchase_requisition_supplier_notes n
		JOIN purchase_requisition_suppliers prs ON prs.id = n.group_id
		LEFT JOIN users u ON u.id = n.created_by
		WHERE prs.requisition_id = $1 ORDER BY n.created_at`, id); err == nil {
		defer noteRows.Close()
		byGroup := map[int][]requisitionNoteView{}
		for noteRows.Next() {
			var gid int
			var n requisitionNoteView
			if noteRows.Scan(&gid, &n.ID, &n.Note, &n.CreatedByName, &n.CreatedAt, &n.UpdatedAt) == nil {
				byGroup[gid] = append(byGroup[gid], n)
			}
		}
		for i := range d.Suppliers {
			if l := byGroup[d.Suppliers[i].ID]; l != nil {
				d.Suppliers[i].NotesLog = l
			}
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
	VariantID  int  `json:"variant_id"`
	PlannedQty int  `json:"planned_qty"`
	SupplierID *int `json:"supplier_id"`
}

// errMissingSupplier is AddItem's answer for a product with no supplier at all. It uses its own
// status (422) so the page can collect these into one warning above the product list (#136).
const errMissingSupplier = "this product has no Supplier set - assign one in Product Management first"

// resolveRequisitionSupplier picks the supplier for a variant (#125, #126): the requested one when
// it is linked to the variant (or is the product's default supplier), else the variant's preferred
// active supplier, else any active linked one, else the product's default supplier. ok=false: none.
func resolveRequisitionSupplier(ctx context.Context, db *pgxpool.Pool, variantID int, requested *int) (supplierID int, ok bool) {
	var productSupplier *int
	db.QueryRow(ctx, `SELECT p.supplier_id FROM product_variants pv JOIN products p ON p.id = pv.product_id WHERE pv.id=$1`, variantID).Scan(&productSupplier)
	if requested != nil {
		var linked bool
		db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM variant_suppliers WHERE variant_id=$1 AND supplier_id=$2 AND is_active)`, variantID, *requested).Scan(&linked)
		if linked || (productSupplier != nil && *productSupplier == *requested) {
			return *requested, true
		}
		return 0, false
	}
	if err := db.QueryRow(ctx, `
		SELECT supplier_id FROM variant_suppliers WHERE variant_id=$1 AND is_active
		ORDER BY is_preferred DESC, id LIMIT 1`, variantID).Scan(&supplierID); err == nil {
		return supplierID, true
	}
	if productSupplier != nil {
		return *productSupplier, true
	}
	return 0, false
}

// requisitionDefaultCostSQL is a line's default RMB unit cost (#134): the chosen supplier's
// reference price for the variant, else the product's default cost from Product Management.
// $1 = variant id, $2 = supplier id.
const requisitionDefaultCostSQL = `
	SELECT COALESCE(
	    (SELECT NULLIF(vs.ref_price, 0) FROM variant_suppliers vs WHERE vs.variant_id = pv.id AND vs.supplier_id = $2),
	    NULLIF(p.cost_rmb, 0), 0)
	FROM product_variants pv JOIN products p ON p.id = pv.product_id WHERE pv.id = $1`

// AddItem adds one product's variant + Planned QTY to the requisition. The Supplier defaults to the
// variant's preferred supplier (resolveRequisitionSupplier) and the item is grouped into (or merged
// with) that Supplier's group; a variant linked to several suppliers can be switched later
// (ChangeItemSupplier). Adding the same variant again updates its planned_qty rather than
// erroring, so re-opening a product and changing the qty just works. Allowed in both Draft and
// Pending Contact (Planned QTY stays editable through Pending Contact per the Adjustments PDF),
// locked once Ordered.
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

	var productID int
	if err := h.DB.QueryRow(ctx, `SELECT product_id FROM product_variants WHERE id=$1`, req.VariantID).Scan(&productID); err != nil {
		respondError(w, http.StatusNotFound, "variant not found")
		return
	}
	supplierID, ok := resolveRequisitionSupplier(ctx, h.DB, req.VariantID, req.SupplierID)
	if !ok {
		if req.SupplierID != nil {
			respondError(w, http.StatusBadRequest, "this supplier is not linked to the product")
			return
		}
		respondError(w, http.StatusUnprocessableEntity, errMissingSupplier)
		return
	}
	var costPrice float64
	h.DB.QueryRow(ctx, requisitionDefaultCostSQL, req.VariantID, supplierID).Scan(&costPrice)

	var groupID int
	if err := h.DB.QueryRow(ctx, `
		INSERT INTO purchase_requisition_suppliers (requisition_id, supplier_id) VALUES ($1,$2)
		ON CONFLICT (requisition_id, supplier_id) DO UPDATE SET supplier_id = EXCLUDED.supplier_id
		RETURNING id`, requisitionID, supplierID).Scan(&groupID); err != nil {
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

	respondJSON(w, http.StatusOK, map[string]interface{}{"supplier_id": supplierID, "rule_warning": warning})
}

type changeItemSupplierRequest struct {
	SupplierID int `json:"supplier_id"`
}

// ChangeItemSupplier moves a line to another of its variant's linked suppliers (#126): the line
// joins (or opens) that supplier's group with the supplier's reference price as unit cost, and a
// group left empty is removed. Only before the order is confirmed; the receiving group goes back
// to Waiting so its new line is confirmed with the supplier too.
func (h *PurchaseRequisitionHandler) ChangeItemSupplier(w http.ResponseWriter, r *http.Request) {
	itemID, err := strconv.Atoi(chi.URLParam(r, "itemId"))
	var req changeItemSupplierRequest
	if err != nil || decodeJSON(r, &req) != nil || req.SupplierID == 0 {
		respondError(w, http.StatusBadRequest, "supplier_id is required")
		return
	}
	ctx := r.Context()
	var requisitionID, oldGroupID, oldSupplierID, variantID, plannedQty int
	var status string
	if err := h.DB.QueryRow(ctx, `
		SELECT pr.id, pr.status, prs.id, prs.supplier_id, pri.variant_id, pri.planned_qty
		FROM purchase_requisition_items pri
		JOIN purchase_requisition_suppliers prs ON prs.id = pri.requisition_supplier_id
		JOIN purchase_requisitions pr ON pr.id = prs.requisition_id
		WHERE pri.id=$1`, itemID).Scan(&requisitionID, &status, &oldGroupID, &oldSupplierID, &variantID, &plannedQty); err != nil {
		respondError(w, http.StatusNotFound, "item not found")
		return
	}
	if status != "draft" && status != "pending_contact" {
		respondError(w, http.StatusBadRequest, "the supplier can only be changed before the order is confirmed")
		return
	}
	if req.SupplierID == oldSupplierID {
		respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
		return
	}
	supplierID, ok := resolveRequisitionSupplier(ctx, h.DB, variantID, &req.SupplierID)
	if !ok {
		respondError(w, http.StatusBadRequest, "this supplier is not linked to the product")
		return
	}
	var costPrice float64
	h.DB.QueryRow(ctx, requisitionDefaultCostSQL, variantID, supplierID).Scan(&costPrice)

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(ctx)
	var groupID int
	if err := tx.QueryRow(ctx, `
		INSERT INTO purchase_requisition_suppliers (requisition_id, supplier_id) VALUES ($1,$2)
		ON CONFLICT (requisition_id, supplier_id) DO UPDATE SET status = 'pending_contact'
		RETURNING id`, requisitionID, supplierID).Scan(&groupID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to group by supplier")
		return
	}
	// The same variant already in the target group: merge the quantities.
	ct, err := tx.Exec(ctx, `UPDATE purchase_requisition_items SET planned_qty = planned_qty + $1 WHERE requisition_supplier_id=$2 AND variant_id=$3`,
		plannedQty, groupID, variantID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to move item")
		return
	}
	if ct.RowsAffected() > 0 {
		_, err = tx.Exec(ctx, `DELETE FROM purchase_requisition_items WHERE id=$1`, itemID)
	} else {
		_, err = tx.Exec(ctx, `UPDATE purchase_requisition_items SET requisition_supplier_id=$1, unit_cost=$2 WHERE id=$3`, groupID, costPrice, itemID)
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to move item")
		return
	}
	tx.Exec(ctx, `
		DELETE FROM purchase_requisition_suppliers prs WHERE prs.id=$1
		AND NOT EXISTS (SELECT 1 FROM purchase_requisition_items WHERE requisition_supplier_id=$1)`, oldGroupID)
	tx.Exec(ctx, `UPDATE purchase_requisitions SET updated_at=now() WHERE id=$1`, requisitionID)
	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "db commit failed")
		return
	}
	respondJSON(w, http.StatusOK, map[string]int{"supplier_id": supplierID, "group_id": groupID})
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
	ID       int      `json:"id"`
	UnitCost *float64 `json:"unit_cost"`
}

type updateSupplierGroupRequest struct {
	Status *string             `json:"status"`
	Notes  *string             `json:"notes"`
	Items  []confirmItemUpdate `json:"items"`
	// RMB adjustments + exchange rate (#134), carried into the PO on ConfirmOrder.
	ExchangeRate   *float64 `json:"exchange_rate"`
	DiscountAmount *float64 `json:"discount_amount"`
	ShippingAmount *float64 `json:"shipping_amount"`
	ExtraAmount    *float64 `json:"extra_amount"`
}

// UpdateSupplierGroup is the Supplier Confirmation step: per-item Unit Cost, plus the group's
// status. (There is a single quantity per line - Planned QTY - edited via UpdateItemQty.) Setting
// status='confirmed' without an explicit unit_cost for an item defaults it to the product's
// current cost_price. The frontend only
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
	for _, v := range []*float64{req.DiscountAmount, req.ShippingAmount, req.ExtraAmount} {
		if v != nil && *v < 0 {
			respondError(w, http.StatusBadRequest, "adjustments must not be negative")
			return
		}
	}
	if req.ExchangeRate != nil && *req.ExchangeRate <= 0 {
		respondError(w, http.StatusBadRequest, "exchange rate must be greater than 0")
		return
	}
	ctx := r.Context()

	if req.ExchangeRate != nil || req.DiscountAmount != nil || req.ShippingAmount != nil || req.ExtraAmount != nil {
		h.DB.Exec(ctx, `
			UPDATE purchase_requisition_suppliers SET
			    exchange_rate = COALESCE($1, exchange_rate), discount_amount = COALESCE($2, discount_amount),
			    shipping_amount = COALESCE($3, shipping_amount), extra_amount = COALESCE($4, extra_amount)
			WHERE id=$5`, req.ExchangeRate, req.DiscountAmount, req.ShippingAmount, req.ExtraAmount, groupID)
	}

	for _, it := range req.Items {
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
			UPDATE purchase_requisition_items pri SET unit_cost = COALESCE(
			    (SELECT NULLIF(vs.ref_price, 0) FROM variant_suppliers vs WHERE vs.variant_id = pv.id AND vs.supplier_id = prs.supplier_id),
			    NULLIF(p.cost_rmb, 0), 0)
			FROM purchase_requisition_suppliers prs, product_variants pv JOIN products p ON p.id = pv.product_id
			WHERE prs.id = pri.requisition_supplier_id AND pri.variant_id = pv.id
			  AND pri.requisition_supplier_id=$1 AND pri.unit_cost IS NULL`, groupID)
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
		Adj        purchaseAdjustments
	}
	groupRows, err := tx.Query(ctx, `
		SELECT id, supplier_id, status, exchange_rate, discount_amount, shipping_amount, extra_amount
		FROM purchase_requisition_suppliers WHERE requisition_id=$1`, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load supplier groups")
		return
	}
	var groups []group
	for groupRows.Next() {
		var g group
		if groupRows.Scan(&g.ID, &g.SupplierID, &g.Status, &g.Adj.ExchangeRate, &g.Adj.DiscountAmount, &g.Adj.ShippingAmount, &g.Adj.ExtraAmount) == nil {
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
	tx.QueryRow(ctx, `SELECT (now() AT TIME ZONE 'Asia/Jakarta')::date::text`).Scan(&today)

	for _, g := range groups {
		itemRows, err := tx.Query(ctx, `
			SELECT variant_id, planned_qty, COALESCE(unit_cost, 0)
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

		// Creating the PO finalizes it (status ordered): its prices update the products' default
		// RMB cost here (#133/#134), never earlier while the requisition is being edited.
		purchaseID, err := createPurchaseTx(ctx, tx, g.SupplierID, today, "", poNotes, claims.UserID, items, g.Adj)
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

type noteRequest struct {
	Note string `json:"note"`
}

// AddGroupNote appends one note to a supplier group's notes log. Allowed in every requisition
// status (notes stay editable after confirmation), like Supplier Profile > Notes.
func (h *PurchaseRequisitionHandler) AddGroupNote(w http.ResponseWriter, r *http.Request) {
	groupID, err := strconv.Atoi(chi.URLParam(r, "supplierGroupId"))
	var req noteRequest
	if err != nil || decodeJSON(r, &req) != nil || strings.TrimSpace(req.Note) == "" {
		respondError(w, http.StatusBadRequest, "note is required")
		return
	}
	claims := appmw.GetClaims(r)
	var id int
	if err := h.DB.QueryRow(r.Context(), `
		INSERT INTO purchase_requisition_supplier_notes (group_id, note, created_by)
		SELECT $1, $2, $3 WHERE EXISTS (SELECT 1 FROM purchase_requisition_suppliers WHERE id=$1) RETURNING id`,
		groupID, strings.TrimSpace(req.Note), claims.UserID).Scan(&id); err != nil {
		respondError(w, http.StatusNotFound, "supplier group not found")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]int{"id": id})
}

func (h *PurchaseRequisitionHandler) UpdateGroupNote(w http.ResponseWriter, r *http.Request) {
	noteID, err := strconv.Atoi(chi.URLParam(r, "noteId"))
	var req noteRequest
	if err != nil || decodeJSON(r, &req) != nil || strings.TrimSpace(req.Note) == "" {
		respondError(w, http.StatusBadRequest, "note is required")
		return
	}
	ct, err := h.DB.Exec(r.Context(), `UPDATE purchase_requisition_supplier_notes SET note=$1, updated_at=now() WHERE id=$2`, strings.TrimSpace(req.Note), noteID)
	if err != nil || ct.RowsAffected() == 0 {
		respondError(w, http.StatusNotFound, "note not found")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *PurchaseRequisitionHandler) DeleteGroupNote(w http.ResponseWriter, r *http.Request) {
	noteID, err := strconv.Atoi(chi.URLParam(r, "noteId"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid note id")
		return
	}
	ct, err := h.DB.Exec(r.Context(), `DELETE FROM purchase_requisition_supplier_notes WHERE id=$1`, noteID)
	if err != nil || ct.RowsAffected() == 0 {
		respondError(w, http.StatusNotFound, "note not found")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

type itemQtyRequest struct {
	PlannedQty int `json:"planned_qty"`
}

// UpdateItemQty edits a line's Planned QTY - the one and only quantity field. Editable in Draft,
// Pending Contact AND after the order is confirmed (purchasing is handled in-house, so
// adjustments must stay possible). Once the supplier PO exists the change is carried into it: the
// PO line quantity moves with it, the delta goes to Incoming (never below what is already
// received), and the PO status is recomputed - so Inventory > Incoming always matches.
func (h *PurchaseRequisitionHandler) UpdateItemQty(w http.ResponseWriter, r *http.Request) {
	itemID, err := strconv.Atoi(chi.URLParam(r, "itemId"))
	var req itemQtyRequest
	if err != nil || decodeJSON(r, &req) != nil || req.PlannedQty <= 0 {
		respondError(w, http.StatusBadRequest, "planned_qty must be greater than 0")
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

	var requisitionID, variantID int
	var oldQty int
	var reqStatus string
	var purchaseID *int
	if err := tx.QueryRow(ctx, `
		SELECT pr.id, pr.status, pri.variant_id, pri.planned_qty, prs.purchase_id
		FROM purchase_requisition_items pri
		JOIN purchase_requisition_suppliers prs ON prs.id = pri.requisition_supplier_id
		JOIN purchase_requisitions pr ON pr.id = prs.requisition_id
		WHERE pri.id=$1 FOR UPDATE OF pri`, itemID).Scan(&requisitionID, &reqStatus, &variantID, &oldQty, &purchaseID); err != nil {
		respondError(w, http.StatusNotFound, "item not found")
		return
	}
	if reqStatus != "draft" && reqStatus != "pending_contact" && reqStatus != "ordered" {
		respondError(w, http.StatusBadRequest, "this requisition is completed - its quantities can no longer be changed")
		return
	}

	if reqStatus == "ordered" && purchaseID != nil && req.PlannedQty != oldQty {
		var poStatus string
		if err := tx.QueryRow(ctx, `SELECT status FROM purchases WHERE id=$1 FOR UPDATE`, *purchaseID).Scan(&poStatus); err != nil {
			respondError(w, http.StatusNotFound, "linked purchase order not found")
			return
		}
		if !isOpenPurchaseStatus(poStatus) {
			respondError(w, http.StatusBadRequest, "the linked purchase order is already "+poStatus+" - its quantity can no longer be changed")
			return
		}
		if msg := setPurchaseItemQtyTx(ctx, tx, *purchaseID, variantID, req.PlannedQty, claims.UserID, "changed from Purchase Requisition"); msg != "" {
			respondError(w, http.StatusBadRequest, msg)
			return
		}
		if _, err := recomputePurchaseStatus(ctx, tx, *purchaseID); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to update purchase status")
			return
		}
	}

	if _, err := tx.Exec(ctx, `UPDATE purchase_requisition_items SET planned_qty=$1 WHERE id=$2`, req.PlannedQty, itemID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to update planned qty")
		return
	}
	tx.Exec(ctx, `UPDATE purchase_requisitions SET updated_at=now() WHERE id=$1`, requisitionID)
	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "db commit failed")
		return
	}
	respondJSON(w, http.StatusOK, map[string]int{"planned_qty": req.PlannedQty})
}
