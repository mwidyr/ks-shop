package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	appmw "ordermgmt/internal/middleware"
)

// OpeningInventoryHandler is FIFO go-live (#132): staff upload the verified on-hand quantities and
// approved RMB unit costs (a CSV, parsed in the browser and posted as JSON), review it against the
// system's Actual stock, and a super_user approves it. Approval creates one opening cost layer per
// line; the first approval switches FIFO on (fifoActive). Past orders are never rewritten - their
// cost simply stays unrecorded (shown as an estimate).
type OpeningInventoryHandler struct {
	DB *pgxpool.Pool
}

type openingLineInput struct {
	RowNo        int     `json:"row_no"`
	SKU          string  `json:"sku"`
	Qty          int     `json:"qty"`
	UnitCostRMB  float64 `json:"unit_cost_rmb"`
	ExchangeRate float64 `json:"exchange_rate"`
}

type openingImportRequest struct {
	FileName string             `json:"file_name"`
	Note     string             `json:"note"`
	Lines    []openingLineInput `json:"lines"`
}

type openingLineView struct {
	openingLineInput
	ID           int     `json:"id"`
	VariantID    *int    `json:"variant_id"`
	ProductName  string  `json:"product_name"`
	SystemActual *int    `json:"system_actual"`
	UnitCostTWD  float64 `json:"unit_cost_twd"`
	Error        string  `json:"error"`
}

type openingImportView struct {
	ID         int               `json:"id"`
	Status     string            `json:"status"`
	FileName   string            `json:"file_name"`
	Note       string            `json:"note"`
	CreatedBy  string            `json:"created_by"`
	CreatedAt  string            `json:"created_at"`
	ApprovedBy *string           `json:"approved_by"`
	ApprovedAt *string           `json:"approved_at"`
	LineCount  int               `json:"line_count"`
	ErrorCount int               `json:"error_count"`
	TotalQty   int               `json:"total_qty"`
	Lines      []openingLineView `json:"lines,omitempty"`
}

// validateOpeningLine returns why a parsed line can't be imported ("" when fine).
func validateOpeningLine(l openingLineInput) string {
	switch {
	case strings.TrimSpace(l.SKU) == "":
		return "SKU is empty"
	case l.Qty < 0:
		return "quantity must not be negative"
	case l.UnitCostRMB < 0:
		return "unit cost must not be negative"
	case l.ExchangeRate <= 0:
		return "exchange rate must be greater than 0"
	}
	return ""
}

const openingImportSelect = `
	SELECT i.id, i.status, i.file_name, COALESCE(i.note,''), COALESCE(cu.name,'-'), i.created_at::text, au.name, i.approved_at::text,
	       (SELECT COUNT(*) FROM opening_inventory_lines l WHERE l.import_id = i.id),
	       (SELECT COUNT(*) FROM opening_inventory_lines l WHERE l.import_id = i.id AND l.error IS NOT NULL),
	       COALESCE((SELECT SUM(qty) FROM opening_inventory_lines l WHERE l.import_id = i.id), 0)
	FROM opening_inventory_imports i
	LEFT JOIN users cu ON cu.id = i.created_by
	LEFT JOIN users au ON au.id = i.approved_by`

func scanOpeningImport(row interface{ Scan(...any) error }) (openingImportView, error) {
	var v openingImportView
	err := row.Scan(&v.ID, &v.Status, &v.FileName, &v.Note, &v.CreatedBy, &v.CreatedAt, &v.ApprovedBy, &v.ApprovedAt,
		&v.LineCount, &v.ErrorCount, &v.TotalQty)
	return v, err
}

// List handles GET /opening-inventory/imports. live tells the page whether FIFO is already on.
func (h *OpeningInventoryHandler) List(w http.ResponseWriter, r *http.Request) {
	rows, err := h.DB.Query(r.Context(), openingImportSelect+` ORDER BY i.created_at DESC, i.id DESC LIMIT 100`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch imports")
		return
	}
	defer rows.Close()
	list := []openingImportView{}
	live := false
	for rows.Next() {
		if v, err := scanOpeningImport(rows); err == nil {
			list = append(list, v)
			live = live || v.Status == "approved"
		}
	}
	respondJSON(w, http.StatusOK, map[string]any{"imports": list, "fifo_live": live})
}

// Detail handles GET /opening-inventory/imports/{id}.
func (h *OpeningInventoryHandler) Detail(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid import id")
		return
	}
	ctx := r.Context()
	v, err := scanOpeningImport(h.DB.QueryRow(ctx, openingImportSelect+` WHERE i.id=$1`, id))
	if err != nil {
		respondError(w, http.StatusNotFound, "import not found")
		return
	}
	rows, err := h.DB.Query(ctx, `
		SELECT l.id, l.row_no, l.sku, l.variant_id, COALESCE(`+chineseNameSQL("p")+`, ''), l.qty, l.unit_cost_rmb, l.exchange_rate,
		       l.system_actual, COALESCE(l.error,'')
		FROM opening_inventory_lines l
		LEFT JOIN product_variants pv ON pv.id = l.variant_id
		LEFT JOIN products p ON p.id = pv.product_id
		WHERE l.import_id=$1 ORDER BY l.row_no, l.id`, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch lines")
		return
	}
	defer rows.Close()
	v.Lines = []openingLineView{}
	for rows.Next() {
		var l openingLineView
		if rows.Scan(&l.ID, &l.RowNo, &l.SKU, &l.VariantID, &l.ProductName, &l.Qty, &l.UnitCostRMB, &l.ExchangeRate, &l.SystemActual, &l.Error) == nil {
			l.UnitCostTWD = round2(l.UnitCostRMB * l.ExchangeRate)
			v.Lines = append(v.Lines, l)
		}
	}
	respondJSON(w, http.StatusOK, v)
}

// Create handles POST /opening-inventory/imports: stores the uploaded lines as a draft for review.
// Each line is matched to a variant by SKU; lines that can't be imported carry the reason (unknown
// SKU, the SKU twice in the file, the variant already has FIFO layers, invalid numbers).
func (h *OpeningInventoryHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req openingImportRequest
	if err := decodeJSON(r, &req); err != nil || len(req.Lines) == 0 {
		respondError(w, http.StatusBadRequest, "the file has no lines")
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

	var id int
	if err := tx.QueryRow(ctx, `INSERT INTO opening_inventory_imports (file_name, note, created_by) VALUES ($1, NULLIF($2,''), $3) RETURNING id`,
		req.FileName, strings.TrimSpace(req.Note), claims.UserID).Scan(&id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create import")
		return
	}
	seen := map[string]bool{}
	for _, l := range req.Lines {
		sku := strings.TrimSpace(l.SKU)
		problem := validateOpeningLine(l)
		var variantID *int
		var actual *int
		if sku != "" {
			var vid, act int
			var hasLayer bool
			if err := tx.QueryRow(ctx, `
				SELECT pv.id, COALESCE(sb.available_stock, 0), EXISTS (SELECT 1 FROM cost_layers cl WHERE cl.variant_id = pv.id)
				FROM product_variants pv LEFT JOIN stock_buckets sb ON sb.variant_id = pv.id
				WHERE pv.sku = $1 OR lower(pv.sku) = lower($1)
				   OR pv.id IN (SELECT variant_id FROM variant_sku_history WHERE lower(old_sku) = lower($1))
				ORDER BY (pv.sku = $1) DESC, (lower(pv.sku) = lower($1)) DESC, pv.id LIMIT 1`, sku).Scan(&vid, &act, &hasLayer); err == nil {
				variantID, actual = &vid, &act
				if problem == "" && hasLayer {
					problem = "this SKU already has FIFO cost layers"
				}
			} else if problem == "" {
				problem = "unknown SKU"
			}
			if problem == "" && seen[strings.ToLower(sku)] {
				problem = "SKU appears more than once in the file"
			}
			seen[strings.ToLower(sku)] = true
		}
		var errText any
		if problem != "" {
			errText = problem
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO opening_inventory_lines (import_id, row_no, sku, variant_id, qty, unit_cost_rmb, exchange_rate, system_actual, error)
			VALUES ($1,$2,$3,$4,GREATEST($5,0),GREATEST($6,0),$7,$8,$9)`,
			id, l.RowNo, sku, variantID, l.Qty, l.UnitCostRMB, max(l.ExchangeRate, 0.000001), actual, errText); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to save line")
			return
		}
	}
	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "db commit failed")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]int{"id": id})
}

// Approve handles POST /opening-inventory/imports/{id}/approve (super_user): creates the opening
// cost layers. Refused while any line has a problem - fix the file and upload it again.
func (h *OpeningInventoryHandler) Approve(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid import id")
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
	if err := tx.QueryRow(ctx, `SELECT status FROM opening_inventory_imports WHERE id=$1 FOR UPDATE`, id).Scan(&status); err != nil {
		respondError(w, http.StatusNotFound, "import not found")
		return
	}
	if status != "draft" {
		respondError(w, http.StatusConflict, "this import is already "+status)
		return
	}
	var problems, layered int
	tx.QueryRow(ctx, `
		SELECT COUNT(*) FILTER (WHERE l.error IS NOT NULL OR l.variant_id IS NULL),
		       COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM cost_layers cl WHERE cl.variant_id = l.variant_id))
		FROM opening_inventory_lines l WHERE l.import_id=$1`, id).Scan(&problems, &layered)
	if problems > 0 {
		respondError(w, http.StatusBadRequest, "some lines have problems - fix the file and upload it again")
		return
	}
	if layered > 0 {
		respondError(w, http.StatusConflict, "some SKUs got FIFO cost layers since this file was uploaded - upload it again")
		return
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO cost_layers (variant_id, source, opening_line_id, qty_in, qty_remaining, unit_cost_rmb, exchange_rate, unit_cost_twd)
		SELECT variant_id, 'opening', id, qty, qty, unit_cost_rmb, exchange_rate, unit_cost_rmb * exchange_rate
		FROM opening_inventory_lines WHERE import_id=$1 AND qty > 0`, id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create the opening cost layers")
		return
	}
	if _, err := tx.Exec(ctx, `UPDATE opening_inventory_imports SET status='approved', approved_by=$1, approved_at=now() WHERE id=$2`, claims.UserID, id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to approve import")
		return
	}
	logActivity(ctx, tx, "opening_inventory", id, "approved", &claims.UserID, "")
	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "db commit failed")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "approved"})
}

// Reject handles POST /opening-inventory/imports/{id}/reject: a draft that won't be used.
func (h *OpeningInventoryHandler) Reject(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid import id")
		return
	}
	ct, err := h.DB.Exec(r.Context(), `UPDATE opening_inventory_imports SET status='rejected' WHERE id=$1 AND status='draft'`, id)
	if err != nil || ct.RowsAffected() == 0 {
		respondError(w, http.StatusConflict, "only a draft import can be rejected")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "rejected"})
}
