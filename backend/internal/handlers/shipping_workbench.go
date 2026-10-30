package handlers

import (
	"context"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"ordermgmt/internal/cache"
	appmw "ordermgmt/internal/middleware"
)

// batchSummary is everything the list and header of a batch need. All numbers are computed from
// the orders' CURRENT statuses on every request - there are no stored counters to drift.
type batchSummary struct {
	ID         int         `json:"id"`
	BatchNo    string      `json:"batch_no"`
	Provider   string      `json:"provider"`
	CreatedAt  string      `json:"created_at"`
	CreatedBy  string      `json:"created_by"`
	Counts     batchCounts `json:"counts"`
	Unresolved int         `json:"unresolved"`
	Stage      string      `json:"stage"`
	Status     string      `json:"status"`
	// Matched: orders whose creation on the platform was confirmed (a milestone, not a status).
	Matched int `json:"matched"`
	// Failed: orders the platform rejected (or staff confirmed as not created), still Processing.
	Failed int `json:"failed"`
	// MissingShippingNo: matched orders still without a shipping number.
	MissingShippingNo int `json:"missing_shipping_no"`
	// AwaitingResults: exported orders no result file has mentioned yet (Pending Verification once
	// at least one result file has been imported, plain "awaiting" before).
	AwaitingResults    int     `json:"awaiting_results"`
	ResultsImported    bool    `json:"results_imported"`
	HasProblems        bool    `json:"has_problems"`
	OldestUnresolvedAt *string `json:"oldest_unresolved_at"`
}

func (b *batchSummary) finish() {
	b.Unresolved = b.Counts.Unresolved()
	b.Stage = b.Counts.Stage()
	b.Status = b.Counts.BatchStatus()
	b.HasProblems = b.Failed > 0 || b.MissingShippingNo > 0 || (b.ResultsImported && b.AwaitingResults > 0)
}

// loadBatchSummaries aggregates batches (filtered by a WHERE over shipping_batches b) in one query.
func loadBatchSummaries(ctx context.Context, db queryer, where string, args ...any) ([]batchSummary, error) {
	rows, err := db.Query(ctx, `
		SELECT b.id, b.batch_no, b.provider, b.created_at, COALESCE(u.name,''),
		       o.status,
		       COUNT(*),
		       COUNT(*) FILTER (WHERE sbo.create_result = 'created'),
		       COUNT(*) FILTER (WHERE sbo.create_result = 'failed' AND o.status IN ('pending','processing')),
		       COUNT(*) FILTER (WHERE sbo.create_result = 'created' AND COALESCE(o.tracking_number,'') = ''
		                        AND o.status IN ('processing','ready_to_ship')),
		       COUNT(*) FILTER (WHERE sbo.create_result IS NULL AND o.status = 'processing'),
		       MIN(o.created_at) FILTER (WHERE o.status IN ('pending','processing','ready_to_ship','shipped')),
		       EXISTS (SELECT 1 FROM shipping_import_log l WHERE l.batch_id = b.id
		               AND l.kind IN ('711_validation','711_export','fm_result','hct_result'))
		FROM shipping_batches b
		JOIN shipping_batch_orders sbo ON sbo.batch_id = b.id
		JOIN orders o ON o.id = sbo.order_id
		LEFT JOIN users u ON u.id = b.created_by `+where+`
		GROUP BY b.id, u.name, o.status
		ORDER BY b.created_at DESC, b.id DESC`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	byID := map[int]*batchSummary{}
	var order []int
	for rows.Next() {
		var id, n, matched, failed, missing, awaiting int
		var batchNo, provider, createdBy, status string
		var created time.Time
		var oldest *time.Time
		var resultsImported bool
		if err := rows.Scan(&id, &batchNo, &provider, &created, &createdBy, &status, &n, &matched, &failed, &missing, &awaiting, &oldest, &resultsImported); err != nil {
			return nil, err
		}
		b, ok := byID[id]
		if !ok {
			b = &batchSummary{ID: id, BatchNo: batchNo, Provider: provider, CreatedBy: createdBy,
				CreatedAt: created.Format(time.RFC3339), ResultsImported: resultsImported}
			byID[id] = b
			order = append(order, id)
		}
		for i := 0; i < n; i++ {
			b.Counts.add(status)
		}
		b.Matched += matched
		b.Failed += failed
		b.MissingShippingNo += missing
		b.AwaitingResults += awaiting
		if oldest != nil {
			v := oldest.Format(time.RFC3339)
			if b.OldestUnresolvedAt == nil || v < *b.OldestUnresolvedAt {
				b.OldestUnresolvedAt = &v
			}
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	out := make([]batchSummary, 0, len(order))
	for _, id := range order {
		b := byID[id]
		b.finish()
		out = append(out, *b)
	}
	return out, nil
}

type batchStageCards struct {
	PendingMatching int `json:"pending_order_matching"`
	Awaiting3PL     int `json:"awaiting_3pl_shipment"`
	ShippedAwaiting int `json:"shipped_awaiting_completion"`
	Closed          int `json:"closed"`
}

// ListBatches handles GET /shipping-workbench/batches?provider=&filter=pending|closed|all&q=
func (h *ShippingWorkbenchHandler) ListBatches(w http.ResponseWriter, r *http.Request) {
	provider := r.URL.Query().Get("provider")
	if provider != "" && !validProvider(provider) {
		respondError(w, http.StatusBadRequest, "invalid provider")
		return
	}
	filter := r.URL.Query().Get("filter")
	if filter == "" {
		filter = "pending"
	}
	// Every batch's progress is aggregated from its orders, which costs more as batches pile up, so the
	// aggregate is kept for a few seconds (dropped on every change, see invalidateShippingCache) and
	// searching, sorting and paging are served from it.
	all, err := cache.Get("shipping:batches:"+provider, overviewTTL, func() ([]batchSummary, error) {
		return loadBatchSummaries(context.Background(), h.DB, ` WHERE ($1 = '' OR b.provider = $1)`, provider)
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load batches")
		return
	}
	var cards batchStageCards
	for _, b := range all {
		switch b.Stage {
		case stagePendingMatching:
			cards.PendingMatching++
		case stageAwaiting3PL:
			cards.Awaiting3PL++
		case stageShippedAwaiting:
			cards.ShippedAwaiting++
		default:
			cards.Closed++
		}
	}
	q := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q")))
	list := []batchSummary{}
	for _, b := range all {
		if filter == "pending" && b.Status != batchStatusPending || filter == "closed" && b.Status != batchStatusClosed {
			continue
		}
		if q != "" && !strings.Contains(strings.ToLower(b.BatchNo), q) {
			continue
		}
		list = append(list, b)
	}
	// batches with problems first, then newest first (or oldest first with ?sort=oldest)
	oldestFirst := r.URL.Query().Get("sort") == "oldest"
	sort.SliceStable(list, func(i, j int) bool {
		if list[i].HasProblems != list[j].HasProblems {
			return list[i].HasProblems
		}
		if oldestFirst {
			return list[i].ID < list[j].ID
		}
		return list[i].ID > list[j].ID
	})
	if !isPaged(r) {
		respondJSON(w, http.StatusOK, map[string]any{"cards": cards, "batches": list})
		return
	}
	pg := parsePage(r, 20, 100)
	from := min(pg.Offset, len(list))
	to := min(from+pg.Size, len(list))
	resp := pageResponse(list[from:to], len(list), pg)
	resp["batches"] = resp["items"]
	resp["cards"] = cards
	respondJSON(w, http.StatusOK, resp)
}

type batchOrderView struct {
	OrderID         int    `json:"order_id"`
	OrderNo         string `json:"order_no"`
	Seq             int    `json:"seq"`
	ShipmentNo      int    `json:"shipment_no"`
	Status          string `json:"status"`
	CustomerName    string `json:"customer_name"`
	StoreName       string `json:"store_name"`
	StoreCode       string `json:"store_code"`
	PlatformOrderNo string `json:"platform_order_no"`
	ShippingNo      string `json:"shipping_no"`
	CreateResult    string `json:"create_result"`
	LastError       string `json:"last_error"`
	// Verification: created | failed | pending_verification | awaiting_results
	Verification string `json:"verification"`
	// LikelyFailing: FamilyMart stops importing at the first rejected row, so after a partial
	// import the first order without a result is the likely culprit.
	LikelyFailing bool    `json:"likely_failing"`
	StatusSince   string  `json:"status_since"`
	PackingAt     *string `json:"packing_exported_at"`
	StickerAt     *string `json:"sticker_exported_at"`
	ExportedAt    *string `json:"exported_at"`
}

type exportHistoryItem struct {
	Kind       string `json:"kind"`
	ExportedAt string `json:"exported_at"`
	User       string `json:"user"`
	Orders     int    `json:"orders"`
	Reexport   bool   `json:"reexport"`
}

type importHistoryItem struct {
	ID        int            `json:"id"`
	Kind      string         `json:"kind"`
	FileName  string         `json:"file_name"`
	User      string         `json:"user"`
	CreatedAt string         `json:"created_at"`
	Summary   map[string]any `json:"summary"`
}

type batchIssueView struct {
	ID        int            `json:"id"`
	Kind      string         `json:"kind"` // the import kind that raised it
	Issue     string         `json:"issue"`
	Ref       string         `json:"ref"`
	Detail    map[string]any `json:"detail"`
	CreatedAt string         `json:"created_at"`
}

// GetBatch handles GET /shipping-workbench/batches/{id}: the header numbers, every order with its
// verification state, and the export / import history.
func (h *ShippingWorkbenchHandler) GetBatch(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid batch id")
		return
	}
	ctx := r.Context()
	sums, err := loadBatchSummaries(ctx, h.DB, ` WHERE b.id = $1`, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load batch")
		return
	}
	if len(sums) == 0 {
		respondError(w, http.StatusNotFound, "batch not found")
		return
	}
	sum := sums[0]

	orows, err := h.DB.Query(ctx, `
		SELECT o.id, o.order_no, sbo.seq, o.status, c.name, COALESCE(o.pickup_store_name,''), COALESCE(o.pickup_store_code,''),
		       COALESCE(o.platform_order_no,''), COALESCE(o.tracking_number,''), COALESCE(sbo.create_result,''), COALESCE(sbo.last_error,''),
		       COALESCE((SELECT MAX(l.created_at) FROM order_status_log l WHERE l.order_id = o.id AND l.status_to = o.status), o.created_at),
		       o.exported_at,
		       (SELECT MAX(x.exported_at) FROM order_export_log x WHERE x.order_id = o.id AND x.kind = '3pl_packing'),
		       (SELECT MAX(x.exported_at) FROM order_export_log x WHERE x.order_id = o.id AND x.kind = '3pl_sticker'),
		       (SELECT gm.group_id FROM order_shipment_group_members gm WHERE gm.order_id = o.id)
		FROM shipping_batch_orders sbo
		JOIN orders o ON o.id = sbo.order_id
		JOIN customers c ON c.id = o.customer_id
		WHERE sbo.batch_id = $1 ORDER BY sbo.seq`, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load batch orders")
		return
	}
	orders := []batchOrderView{}
	shipments := 0
	groupShipment := map[int]int{}
	for orows.Next() {
		var v batchOrderView
		var since time.Time
		var exp, pack, stick *time.Time
		var groupID *int
		if err := orows.Scan(&v.OrderID, &v.OrderNo, &v.Seq, &v.Status, &v.CustomerName, &v.StoreName, &v.StoreCode,
			&v.PlatformOrderNo, &v.ShippingNo, &v.CreateResult, &v.LastError, &since, &exp, &pack, &stick, &groupID); err != nil {
			orows.Close()
			respondError(w, http.StatusInternalServerError, "failed to read batch orders")
			return
		}
		// merged orders ship as one parcel (one row in the exported files): they share one shipment number
		if groupID != nil && groupShipment[*groupID] > 0 {
			v.ShipmentNo = groupShipment[*groupID]
		} else {
			shipments++
			v.ShipmentNo = shipments
			if groupID != nil {
				groupShipment[*groupID] = shipments
			}
		}
		v.StatusSince = since.Format(time.RFC3339)
		v.ExportedAt, v.PackingAt, v.StickerAt = fmtTimePtr(exp), fmtTimePtr(pack), fmtTimePtr(stick)
		switch {
		case v.CreateResult == "created":
			v.Verification = "created"
		case v.CreateResult == "failed":
			v.Verification = "failed"
		case v.Status == "processing" && sum.ResultsImported:
			v.Verification = "pending_verification"
		case v.Status == "processing":
			v.Verification = "awaiting_results"
		}
		orders = append(orders, v)
	}
	orows.Close()

	if sum.Provider == "cvs_familymart" && sum.ResultsImported && sum.Matched > 0 {
		for i := range orders {
			if orders[i].Verification == "pending_verification" {
				orders[i].LikelyFailing = true
				break
			}
		}
	}

	exports := []exportHistoryItem{}
	erows, err := h.DB.Query(ctx, `
		SELECT x.kind, x.exported_at, COALESCE(u.name,''), COUNT(*), bool_and(x.is_reexport)
		FROM order_export_log x LEFT JOIN users u ON u.id = x.user_id
		WHERE x.batch_id = $1 GROUP BY x.kind, x.exported_at, u.name ORDER BY x.exported_at DESC`, id)
	if err == nil {
		for erows.Next() {
			var e exportHistoryItem
			var at time.Time
			if erows.Scan(&e.Kind, &at, &e.User, &e.Orders, &e.Reexport) == nil {
				e.ExportedAt = at.Format(time.RFC3339Nano)
				exports = append(exports, e)
			}
		}
		erows.Close()
	}

	imports := []importHistoryItem{}
	irows, err := h.DB.Query(ctx, `
		SELECT l.id, l.kind, l.file_name, COALESCE(u.name,''), l.created_at, l.summary
		FROM shipping_import_log l LEFT JOIN users u ON u.id = l.user_id
		WHERE l.batch_id = $1 ORDER BY l.created_at DESC LIMIT 100`, id)
	if err == nil {
		for irows.Next() {
			var it importHistoryItem
			var at time.Time
			if irows.Scan(&it.ID, &it.Kind, &it.FileName, &it.User, &at, &it.Summary) == nil {
				it.CreatedAt = at.Format(time.RFC3339)
				imports = append(imports, it)
			}
		}
		irows.Close()
	}

	issues := []batchIssueView{}
	xrows, err := h.DB.Query(ctx, `
		SELECT i.id, l.kind, i.issue, i.ref, i.detail, i.created_at FROM shipping_import_issues i
		JOIN shipping_import_log l ON l.id = i.import_id
		WHERE i.resolved_at IS NULL AND l.batch_id = $1 ORDER BY i.created_at DESC LIMIT 200`, id)
	if err == nil {
		for xrows.Next() {
			var it batchIssueView
			var at time.Time
			if xrows.Scan(&it.ID, &it.Kind, &it.Issue, &it.Ref, &it.Detail, &at) == nil {
				it.CreatedAt = at.Format(time.RFC3339)
				issues = append(issues, it)
			}
		}
		xrows.Close()
	}

	respondJSON(w, http.StatusOK, map[string]any{
		"batch": sum, "shipments": shipments, "orders": orders, "exports": exports, "imports": imports, "issues": issues,
	})
}

func fmtTimePtr(t *time.Time) *string {
	if t == nil {
		return nil
	}
	v := t.Format(time.RFC3339Nano)
	return &v
}

// Export kinds recorded in order_export_log.
var exportKinds = map[string]bool{"initial": true, "retry": true, "3pl_packing": true, "3pl_sticker": true}

// ExportRows handles GET /shipping-workbench/batches/{id}/export-rows?kind=&exported_at=
// It returns the shipment rows to put in the file; the browser builds the Excel and then reports
// the export with RecordExport. With exported_at it returns exactly the rows of an earlier export
// (re-download / reprint) instead of the not-yet-exported ones.
func (h *ShippingWorkbenchHandler) ExportRows(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid batch id")
		return
	}
	kind := r.URL.Query().Get("kind")
	if !exportKinds[kind] {
		respondError(w, http.StatusBadRequest, "invalid export kind")
		return
	}
	ctx := r.Context()
	var provider string
	if err := h.DB.QueryRow(ctx, `SELECT provider FROM shipping_batches WHERE id=$1`, id).Scan(&provider); err != nil {
		respondError(w, http.StatusNotFound, "batch not found")
		return
	}

	var cond string
	args := []any{id}
	if at := r.URL.Query().Get("exported_at"); at != "" {
		ts, err := time.Parse(time.RFC3339Nano, at)
		if err != nil {
			respondError(w, http.StatusBadRequest, "invalid exported_at")
			return
		}
		cond = ` AND EXISTS (SELECT 1 FROM order_export_log x WHERE x.order_id = o.id AND x.batch_id = $1 AND x.kind = $2 AND x.exported_at = $3)`
		args = append(args, kind, ts)
	} else {
		switch kind {
		case "initial":
			// the original membership; a re-download reproduces the same file
			cond = ` AND o.status IN ('pending','processing','ready_to_ship')`
		case "retry":
			cond = ` AND o.status = 'processing' AND sbo.create_result = 'failed'`
		default:
			// 3PL files: verified orders not yet sent with this kind of file
			cond = ` AND o.status = 'ready_to_ship' AND NOT EXISTS (SELECT 1 FROM order_export_log x WHERE x.order_id = o.id AND x.kind = '` + kind + `')`
		}
	}
	idRows, err := h.DB.Query(ctx, `
		SELECT o.id, sbo.seq FROM shipping_batch_orders sbo JOIN orders o ON o.id = sbo.order_id
		WHERE sbo.batch_id = $1`+cond+` ORDER BY sbo.seq`, args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load orders")
		return
	}
	var ids []int
	seqOf := map[int]int{}
	for idRows.Next() {
		var oid, seq int
		if idRows.Scan(&oid, &seq) == nil {
			ids = append(ids, oid)
			seqOf[oid] = seq
		}
	}
	idRows.Close()
	rows := []shippingExportRow{}
	if len(ids) > 0 {
		rows, err = loadShipmentRows(r, h.DB, ` WHERE o.id = ANY($1)`, ids)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "failed to build export rows")
			return
		}
		minSeq := func(row shippingExportRow) int {
			m := 1 << 30
			for _, oid := range row.OrderIDs {
				if s, ok := seqOf[oid]; ok && s < m {
					m = s
				}
			}
			return m
		}
		sort.SliceStable(rows, func(i, j int) bool { return minSeq(rows[i]) < minSeq(rows[j]) })
	}
	respondJSON(w, http.StatusOK, map[string]any{"kind": kind, "provider": provider, "rows": rows})
}

type recordExportRequest struct {
	Kind     string `json:"kind"`
	OrderIDs []int  `json:"order_ids"`
}

// RecordExport handles POST /shipping-workbench/batches/{id}/exports, called once the browser has
// generated a file. It logs which orders went into it and, for the first INITIAL export, moves the
// orders from New to Processing and locks them. The first 3PL file moves its Ready to Ship orders to
// Shipped: the 3PL sends no confirmation back, so handing the file over is the shipment (Actual stock
// and the FIFO cost are booked then, exactly as the old confirmation import did). A repeated download
// is logged as a re-export and changes nothing else.
func (h *ShippingWorkbenchHandler) RecordExport(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid batch id")
		return
	}
	var req recordExportRequest
	if err := decodeJSON(r, &req); err != nil || !exportKinds[req.Kind] || len(req.OrderIDs) == 0 {
		respondError(w, http.StatusBadRequest, "kind and order_ids are required")
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

	type member struct {
		id     int
		status string
	}
	rows, err := tx.Query(ctx, `
		SELECT o.id, o.status FROM shipping_batch_orders sbo JOIN orders o ON o.id = sbo.order_id
		WHERE sbo.batch_id = $1 AND o.id = ANY($2) ORDER BY o.id FOR UPDATE OF o`, id, req.OrderIDs)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load orders")
		return
	}
	var members []member
	for rows.Next() {
		var m member
		if rows.Scan(&m.id, &m.status) == nil {
			members = append(members, m)
		}
	}
	rows.Close()
	if len(members) != len(uniqueInts(req.OrderIDs)) {
		respondError(w, http.StatusBadRequest, "some orders do not belong to this batch")
		return
	}
	for _, m := range members {
		ok := false
		switch req.Kind {
		case "initial", "retry":
			ok = m.status == "pending" || m.status == "processing" || (req.Kind == "initial" && m.status == "ready_to_ship")
		default:
			ok = m.status == "ready_to_ship" || m.status == "shipped" || m.status == "delivered"
		}
		if !ok {
			respondError(w, http.StatusConflict, fmt.Sprintf("order %d (%s) cannot be part of a %s export", m.id, m.status, req.Kind))
			return
		}
	}

	var exportedAt time.Time
	if err := tx.QueryRow(ctx, `SELECT now()`).Scan(&exportedAt); err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO order_export_log (order_id, provider, exported_at, user_id, is_reexport, batch_id, kind)
		SELECT o.id, pc.chain_type, $3, $4,
		       EXISTS (SELECT 1 FROM order_export_log p WHERE p.order_id = o.id AND p.kind = $5),
		       $2, $5
		FROM orders o JOIN pickup_chains pc ON pc.id = o.pickup_chain_id WHERE o.id = ANY($1)`,
		req.OrderIDs, id, exportedAt, claims.UserID, req.Kind); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to log export")
		return
	}
	moved := 0
	if req.Kind == "initial" {
		for _, m := range members {
			if m.status != "pending" {
				continue
			}
			if _, err := tx.Exec(ctx, `UPDATE orders SET exported_at = COALESCE(exported_at, $2) WHERE id=$1`, m.id, exportedAt); err != nil {
				respondError(w, http.StatusInternalServerError, "failed to lock order")
				return
			}
			if err := applyStatusChange(ctx, tx, m.id, "pending", "processing", &claims.UserID, "system: initial shipping Excel exported"); err != nil {
				respondError(w, http.StatusInternalServerError, "failed to update order status")
				return
			}
			moved++
		}
	}
	shipped := 0
	if req.Kind == "3pl_packing" {
		for _, m := range members {
			if m.status != "ready_to_ship" {
				continue
			}
			if err := applyStatusChange(ctx, tx, m.id, "ready_to_ship", "shipped", &claims.UserID, "system: sent to 3PL (3PL file exported)"); err != nil {
				respondError(w, http.StatusInternalServerError, "failed to update order status")
				return
			}
			shipped++
		}
	}
	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "db commit failed")
		return
	}
	invalidateShippingCache()
	respondJSON(w, http.StatusOK, map[string]any{"exported_at": exportedAt.Format(time.RFC3339Nano), "moved_to_processing": moved, "moved_to_shipped": shipped})
}

func uniqueInts(in []int) []int {
	seen := map[int]bool{}
	out := make([]int, 0, len(in))
	for _, v := range in {
		if !seen[v] {
			seen[v] = true
			out = append(out, v)
		}
	}
	return out
}

// ConfirmFailed handles POST /shipping-workbench/batches/{id}/orders/{orderId}/confirm-failed:
// warehouse staff confirm an order missing from the platform results was NOT created there, which
// makes it eligible for a retry export. Never done automatically.
func (h *ShippingWorkbenchHandler) ConfirmFailed(w http.ResponseWriter, r *http.Request) {
	id, err1 := strconv.Atoi(chi.URLParam(r, "id"))
	orderID, err2 := strconv.Atoi(chi.URLParam(r, "orderId"))
	if err1 != nil || err2 != nil {
		respondError(w, http.StatusBadRequest, "invalid id")
		return
	}
	claims := appmw.GetClaims(r)
	ct, err := h.DB.Exec(r.Context(), `
		UPDATE shipping_batch_orders sbo SET create_result = 'failed', last_error = 'Confirmed by staff: not created on the platform'
		FROM orders o
		WHERE sbo.batch_id = $1 AND sbo.order_id = $2 AND o.id = sbo.order_id
		  AND sbo.create_result IS NULL AND o.status = 'processing'`, id, orderID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to update order")
		return
	}
	if ct.RowsAffected() == 0 {
		respondError(w, http.StatusConflict, "order is not waiting for verification")
		return
	}
	logActivity(r.Context(), h.DB, "order", orderID, "shipping_confirmed_not_created", &claims.UserID, fmt.Sprintf("batch %d", id))
	invalidateShippingCache()
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ResolveIssue handles POST /shipping-workbench/issues/{id}/resolve.
func (h *ShippingWorkbenchHandler) ResolveIssue(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid id")
		return
	}
	if _, err := h.DB.Exec(r.Context(), `UPDATE shipping_import_issues SET resolved_at = now() WHERE id=$1 AND resolved_at IS NULL`, id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to resolve issue")
		return
	}
	invalidateShippingCache()
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ConfirmAllNotCreated handles POST /shipping-workbench/batches/{id}/confirm-all-failed: after a
// partial platform import (FamilyMart stops at the first rejected row) every order that no result
// file mentioned can be confirmed as "not created" in one go, which makes them all retry-eligible.
// Still an explicit staff action, never automatic; only possible once a result file was imported.
func (h *ShippingWorkbenchHandler) ConfirmAllNotCreated(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid batch id")
		return
	}
	claims := appmw.GetClaims(r)
	ct, err := h.DB.Exec(r.Context(), `
		UPDATE shipping_batch_orders sbo SET create_result = 'failed', last_error = 'Confirmed by staff: not created on the platform'
		FROM orders o
		WHERE sbo.batch_id = $1 AND o.id = sbo.order_id AND sbo.create_result IS NULL AND o.status = 'processing'
		  AND EXISTS (SELECT 1 FROM shipping_import_log l WHERE l.batch_id = $1
		              AND l.kind IN ('711_validation','711_export','fm_result','hct_result'))`, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to update orders")
		return
	}
	logActivity(r.Context(), h.DB, "shipping_batch", id, "confirmed_not_created", &claims.UserID, fmt.Sprintf("%d orders", ct.RowsAffected()))
	invalidateShippingCache()
	respondJSON(w, http.StatusOK, map[string]int64{"confirmed": ct.RowsAffected()})
}
