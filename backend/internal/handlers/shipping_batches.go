package handlers

import (
	"context"
	"fmt"
	"net/http"
	"sort"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	appmw "ordermgmt/internal/middleware"
)

// ShippingWorkbenchHandler serves the Shipping Workbench: batch creation (this file), the batch
// workbench / imports (shipping_workbench.go) and the homepage (shipping_overview.go).
type ShippingWorkbenchHandler struct {
	DB *pgxpool.Pool
}

// providers are the pickup_chains.chain_type values the workbench handles, with the short code
// used in batch numbers.
var providerCodes = map[string]string{
	"cvs_711":        "711",
	"cvs_familymart": "FM",
	"courier":        "HCT",
}

func validProvider(p string) bool { _, ok := providerCodes[p]; return ok }

// Categories of the batch-creation dialog: ready (can be batched), problem (the carrier's
// import rules are broken) and insufficient (Actual stock can't cover the whole order).
const (
	catReady        = "ready"
	catProblem      = "problem"
	catInsufficient = "insufficient"
)

type shortageView struct {
	SKU  string `json:"sku"`
	Need int    `json:"need"`
	Have int    `json:"have"`
}

type eligibleRow struct {
	shippingExportRow
	Category string   `json:"category"`
	Problems []string `json:"problems"`
	// Warnings never block batching or the export (e.g. a store code our cached directory doesn't know:
	// the directory isn't linked to the logistics platform, which validates the row itself).
	Warnings  []string       `json:"warnings"`
	Shortages []shortageView `json:"shortages"`
}

type eligibleResult struct {
	Rows []eligibleRow `json:"rows"`
	// TodayExcluded counts shipments left out only because they were created today (Taiwan time).
	TodayExcluded int `json:"today_excluded"`
}

// computeEligible lists the not-yet-batched shipments of a provider that were created before
// today (Taiwan time) and sorts each into ready / problem / insufficient. Physical stock is
// allocated oldest shipment first, whole shipments only, on top of what existing unshipped batch
// orders already hold - so one unit of stock is never promised to two batches.
func computeEligible(r *http.Request, db queryer, provider string, now time.Time) (eligibleResult, error) {
	res := eligibleResult{Rows: []eligibleRow{}}
	all, err := loadShipmentRows(r, db, `
		WHERE o.status = 'pending' AND pc.chain_type = $1
		  AND NOT EXISTS (SELECT 1 FROM shipping_batch_orders sbo WHERE sbo.order_id = o.id)
		  AND NOT `+keepHeldSQL("o", "$2")+`
		  AND NOT EXISTS (SELECT 1 FROM order_shipment_group_members gm2 JOIN orders o2 ON o2.id = gm2.order_id
		                  WHERE gm2.group_id = gm.group_id AND `+keepHeldSQL("o2", "$2")+`)`,
		provider, taipeiStartOfDay(now).Format("2006-01-02"))
	if err != nil {
		return res, err
	}
	var rows []shippingExportRow
	for _, row := range all {
		if !createdBeforeToday(row.latestCreated, now) {
			res.TodayExcluded++
			continue
		}
		rows = append(rows, row)
	}
	if len(rows) == 0 {
		return res, nil
	}

	var orderIDs []int
	for _, row := range rows {
		orderIDs = append(orderIDs, row.OrderIDs...)
	}
	linesByOrder, variantIDs, err := loadOrderLines(r.Context(), db, orderIDs)
	if err != nil {
		return res, err
	}
	remaining, skus, err := allocatableStock(r.Context(), db, variantIDs)
	if err != nil {
		return res, err
	}

	// A store code our cached directory doesn't know is only a warning: the directory is not connected
	// to the logistics platform (new or changed stores), so the platform gets to judge the row.
	// Only when the cached directory actually has data for the chain (empty = unknown, never flagged).
	knownStores, err := knownStoreCodes(r.Context(), db, provider)
	if err != nil {
		return res, err
	}
	// A merged shipment must go out as one parcel: if a member already sits in a batch, the others can't
	// be batched on their own (they'd ship separately).
	splitOrders, err := splitGroupOrders(r.Context(), db, orderIDs)
	if err != nil {
		return res, err
	}

	var candidates []allocOrder
	problemsByKey := map[int][]string{}
	warningsByKey := map[int][]string{}
	for _, row := range rows {
		probs := exportProblems(row)
		if provider != "courier" && knownStores != nil && isSixDigits(row.PickupStoreCode) && !knownStores[row.PickupStoreCode] {
			warningsByKey[row.OrderID] = append(warningsByKey[row.OrderID], "store_unknown")
		}
		for _, id := range row.OrderIDs {
			if splitOrders[id] {
				probs = append(probs, "merged_split")
				break
			}
		}
		problemsByKey[row.OrderID] = probs
		if len(probs) > 0 {
			continue
		}
		ao := allocOrder{Key: row.OrderID, Created: row.earliestCreated}
		for _, id := range row.OrderIDs {
			ao.Lines = append(ao.Lines, linesByOrder[id]...)
		}
		candidates = append(candidates, ao)
	}
	shortages := allocateOrders(candidates, remaining)

	for _, row := range rows {
		er := eligibleRow{shippingExportRow: row, Problems: problemsByKey[row.OrderID], Warnings: warningsByKey[row.OrderID], Shortages: []shortageView{}}
		switch {
		case len(er.Problems) > 0:
			er.Category = catProblem
		case len(shortages[row.OrderID]) > 0:
			er.Category = catInsufficient
			for _, s := range shortages[row.OrderID] {
				er.Shortages = append(er.Shortages, shortageView{SKU: skus[s.VariantID], Need: s.Need, Have: s.Have})
			}
		default:
			er.Category = catReady
		}
		if er.Problems == nil {
			er.Problems = []string{}
		}
		if er.Warnings == nil {
			er.Warnings = []string{}
		}
		res.Rows = append(res.Rows, er)
	}
	sort.SliceStable(res.Rows, func(i, j int) bool { return res.Rows[i].earliestCreated.Before(res.Rows[j].earliestCreated) })
	return res, nil
}

// splitGroupOrders returns the given orders whose merged shipment group already has a member in a batch.
func splitGroupOrders(ctx context.Context, db queryer, orderIDs []int) (map[int]bool, error) {
	out := map[int]bool{}
	if len(orderIDs) == 0 {
		return out, nil
	}
	rows, err := db.Query(ctx, `
		SELECT gm.order_id FROM order_shipment_group_members gm
		WHERE gm.order_id = ANY($1)
		  AND EXISTS (SELECT 1 FROM order_shipment_group_members g2 JOIN shipping_batch_orders sbo ON sbo.order_id = g2.order_id
		              WHERE g2.group_id = gm.group_id)`, orderIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out[id] = true
	}
	return out, rows.Err()
}

// loadOrderLines returns the (variant, qty) lines of the given orders and the distinct variants.
func loadOrderLines(ctx context.Context, db queryer, orderIDs []int) (map[int][]allocLine, []int, error) {
	rows, err := db.Query(ctx, `SELECT order_id, variant_id, qty FROM order_items WHERE order_id = ANY($1)`, orderIDs)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	lines := map[int][]allocLine{}
	seen := map[int]bool{}
	var variants []int
	for rows.Next() {
		var orderID int
		var l allocLine
		if err := rows.Scan(&orderID, &l.VariantID, &l.Qty); err != nil {
			return nil, nil, err
		}
		lines[orderID] = append(lines[orderID], l)
		if !seen[l.VariantID] {
			seen[l.VariantID] = true
			variants = append(variants, l.VariantID)
		}
	}
	return lines, variants, rows.Err()
}

// allocatableStock is, per variant, Actual stock minus what unshipped batch orders already hold,
// plus each variant's SKU for messages.
func allocatableStock(ctx context.Context, db queryer, variantIDs []int) (map[int]int, map[int]string, error) {
	remaining := map[int]int{}
	skus := map[int]string{}
	rows, err := db.Query(ctx, `
		SELECT pv.id, pv.sku, sb.available_stock - COALESCE((
			SELECT SUM(oi.qty) FROM order_items oi
			JOIN orders o ON o.id = oi.order_id
			JOIN shipping_batch_orders sbo ON sbo.order_id = o.id
			WHERE oi.variant_id = pv.id AND o.status IN `+orderedStatusesSQL+`), 0)
		FROM product_variants pv JOIN stock_buckets sb ON sb.variant_id = pv.id
		WHERE pv.id = ANY($1)`, variantIDs)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id, rem int
		var sku string
		if err := rows.Scan(&id, &sku, &rem); err != nil {
			return nil, nil, err
		}
		remaining[id], skus[id] = rem, sku
	}
	return remaining, skus, rows.Err()
}

// Eligible handles GET /shipping-workbench/eligible?provider=...
func (h *ShippingWorkbenchHandler) Eligible(w http.ResponseWriter, r *http.Request) {
	provider := r.URL.Query().Get("provider")
	if !validProvider(provider) {
		respondError(w, http.StatusBadRequest, "invalid provider")
		return
	}
	res, err := computeEligible(r, h.DB, provider, time.Now())
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load orders")
		return
	}
	respondJSON(w, http.StatusOK, res)
}

type createBatchRequest struct {
	Provider string `json:"provider"`
	OrderIDs []int  `json:"order_ids"`
}

// advisory lock key serialising batch creation, so two simultaneous requests can't both be given
// the same physical stock.
const batchCreateLockKey = 770101

// CreateBatch handles POST /shipping-workbench/batches. It revalidates everything inside one
// transaction (date, status, batch membership, carrier rules, stock) and either creates the batch
// with all selected shipments or nothing. Creating a batch only ALLOCATES stock (derived from the
// membership rows); orders stay New until the batch's shipping Excel is exported.
func (h *ShippingWorkbenchHandler) CreateBatch(w http.ResponseWriter, r *http.Request) {
	var req createBatchRequest
	if err := decodeJSON(r, &req); err != nil || !validProvider(req.Provider) || len(req.OrderIDs) == 0 {
		respondError(w, http.StatusBadRequest, "provider and order_ids are required")
		return
	}
	claims := appmw.GetClaims(r)
	ctx := r.Context()
	now := time.Now()

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, batchCreateLockKey); err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}

	res, err := computeEligible(r, tx, req.Provider, now)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to validate orders")
		return
	}
	requested := map[int]bool{}
	for _, id := range req.OrderIDs {
		requested[id] = true
	}
	var chosen []eligibleRow
	covered := map[int]bool{}
	for _, row := range res.Rows {
		hit := 0
		for _, id := range row.OrderIDs {
			if requested[id] {
				hit++
			}
		}
		if hit == 0 {
			continue
		}
		if hit != len(row.OrderIDs) {
			respondError(w, http.StatusBadRequest, "a merged shipment must be batched as a whole: "+row.OrderNo)
			return
		}
		if row.Category != catReady {
			respondError(w, http.StatusConflict, fmt.Sprintf("order %s is no longer eligible (%s)", row.OrderNo, row.Category))
			return
		}
		chosen = append(chosen, row)
		for _, id := range row.OrderIDs {
			covered[id] = true
		}
	}
	for id := range requested {
		if !covered[id] {
			respondError(w, http.StatusConflict, fmt.Sprintf("order %d is not eligible for a new batch", id))
			return
		}
	}

	var todayCount int
	if err := tx.QueryRow(ctx, `SELECT COUNT(*) FROM shipping_batches WHERE provider=$1 AND created_at >= $2`,
		req.Provider, taipeiStartOfDay(now)).Scan(&todayCount); err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	batchNo := fmt.Sprintf("B%s-%s-%03d", providerCodes[req.Provider], now.In(taipeiTZ).Format("20060102"), todayCount+1)

	var batchID int
	if err := tx.QueryRow(ctx, `
		INSERT INTO shipping_batches (batch_no, provider, created_by) VALUES ($1,$2,$3) RETURNING id`,
		batchNo, req.Provider, claims.UserID).Scan(&batchID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create batch")
		return
	}
	seq := 0
	for _, row := range chosen {
		for _, id := range row.OrderIDs {
			seq++
			if _, err := tx.Exec(ctx, `INSERT INTO shipping_batch_orders (batch_id, order_id, seq) VALUES ($1,$2,$3)`, batchID, id, seq); err != nil {
				respondError(w, http.StatusConflict, "an order already belongs to another batch")
				return
			}
		}
	}
	logActivity(ctx, tx, "shipping_batch", batchID, "created", &claims.UserID,
		fmt.Sprintf("%s: %d shipments, %d orders", batchNo, len(chosen), seq))
	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "db commit failed")
		return
	}
	invalidateShippingCache()
	respondJSON(w, http.StatusCreated, map[string]interface{}{"id": batchID, "batch_no": batchNo, "orders": seq})
}

// knownStoreCodes returns the cached ECPay store codes of a chain, or nil when the directory has no
// data for it (so nothing can be judged unknown).
func knownStoreCodes(ctx context.Context, db queryer, provider string) (map[string]bool, error) {
	rows, err := db.Query(ctx, `SELECT store_code FROM cvs_stores WHERE chain_type = $1`, provider)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var set map[string]bool
	for rows.Next() {
		var code string
		if err := rows.Scan(&code); err != nil {
			return nil, err
		}
		if set == nil {
			set = map[string]bool{}
		}
		set[code] = true
	}
	return set, rows.Err()
}
