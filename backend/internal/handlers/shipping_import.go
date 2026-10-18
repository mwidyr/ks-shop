package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/jackc/pgx/v5"

	appmw "ordermgmt/internal/middleware"
)

type importRequest struct {
	Provider string         `json:"provider"`
	Kind     string         `json:"kind"`
	FileName string         `json:"file_name"`
	FileHash string         `json:"file_hash"`
	BatchID  *int           `json:"batch_id"`
	Records  []importRecord `json:"records"`
}

type importSummary struct {
	Total             int  `json:"total"`
	Updated           int  `json:"updated"`
	Skipped           int  `json:"skipped"`
	Failed            int  `json:"failed"` // 7-ELEVEN rows the platform rejected
	Unmatched         int  `json:"unmatched"`
	Conflicts         int  `json:"conflicts"`
	Issues            int  `json:"issues"` // new issues opened by this file
	MissingShippingNo int  `json:"missing_shipping_no"`
	Repeat            bool `json:"repeat"` // an identical file (same hash) was imported before
}

// importApplier applies normalised import records inside one transaction. Every rule is
// idempotent: re-applying the same record changes nothing, a value already stored is never
// overwritten by a different one (that is flagged), a confirmed result is never downgraded and a
// status only moves forward. Rows that can't be matched reliably become issues instead.
type importApplier struct {
	ctx      context.Context
	tx       pgx.Tx
	userID   int
	req      importRequest
	importID int
	provider string
	idx      orderIndex
	state    map[int]*candidateOrder
	members  map[string][]int // unit key -> member order ids
	sum      importSummary
}

func (a *importApplier) loadCandidates() error {
	var orderNos, platformNos, shippingNos []string
	for _, r := range a.req.Records {
		if r.OrderNo != "" {
			orderNos = append(orderNos, r.OrderNo)
		}
		if r.PlatformOrderNo != "" {
			platformNos = append(platformNos, r.PlatformOrderNo)
		}
		if r.ShippingNo != "" {
			shippingNos = append(shippingNos, r.ShippingNo)
		}
	}
	const base = `
		SELECT o.id, o.order_no, COALESCE(o.platform_order_no,''), COALESCE(o.tracking_number,''), o.status,
		       COALESCE(gm.group_id,0), COALESCE(sbo.batch_id,0), COALESCE(sbo.create_result,''), pc.chain_type
		FROM orders o
		JOIN pickup_chains pc ON pc.id = o.pickup_chain_id
		LEFT JOIN order_shipment_group_members gm ON gm.order_id = o.id
		LEFT JOIN shipping_batch_orders sbo ON sbo.order_id = o.id
		WHERE ($1 = '' OR pc.chain_type = $1) AND `
	scan := func(rows pgx.Rows) error {
		defer rows.Close()
		for rows.Next() {
			var c candidateOrder
			if err := rows.Scan(&c.ID, &c.OrderNo, &c.PlatformOrderNo, &c.ShippingNo, &c.Status, &c.GroupID, &c.BatchID, &c.CreateResult, &c.Provider); err != nil {
				return err
			}
			if _, ok := a.state[c.ID]; !ok {
				cc := c
				a.state[c.ID] = &cc
			}
		}
		return rows.Err()
	}
	rows, err := a.tx.Query(a.ctx, base+`(o.order_no = ANY($2) OR o.platform_order_no = ANY($3) OR o.tracking_number = ANY($4))
		ORDER BY o.id FOR UPDATE OF o`, a.provider, orderNos, platformNos, shippingNos)
	if err != nil {
		return err
	}
	if err := scan(rows); err != nil {
		return err
	}
	// a merged shipment travels as one parcel: pull in every member of the matched groups
	groupSet := map[int]bool{}
	for _, c := range a.state {
		if c.GroupID != 0 {
			groupSet[c.GroupID] = true
		}
	}
	if len(groupSet) > 0 {
		groups := make([]int, 0, len(groupSet))
		for g := range groupSet {
			groups = append(groups, g)
		}
		rows, err := a.tx.Query(a.ctx, base+`gm.group_id = ANY($2) ORDER BY o.id FOR UPDATE OF o`, a.provider, groups)
		if err != nil {
			return err
		}
		if err := scan(rows); err != nil {
			return err
		}
	}
	cands := make([]candidateOrder, 0, len(a.state))
	for _, c := range a.state {
		cands = append(cands, *c)
		a.members[c.unitKey()] = append(a.members[c.unitKey()], c.ID)
	}
	a.idx = newOrderIndex(cands)
	return nil
}

// issue opens a review item (once per issue+ref while it stays open).
func (a *importApplier) issue(rec importRecord, kind string, orderID int, detail map[string]any) {
	if detail == nil {
		detail = map[string]any{}
	}
	detail["order_no"], detail["platform_order_no"], detail["shipping_no"] = rec.OrderNo, rec.PlatformOrderNo, rec.ShippingNo
	if rec.ResultText != "" {
		detail["result_text"] = rec.ResultText
	}
	raw, _ := json.Marshal(detail)
	var oid *int
	if orderID != 0 {
		oid = &orderID
	}
	ct, err := a.tx.Exec(a.ctx, `
		INSERT INTO shipping_import_issues (import_id, provider, row_no, issue, ref, detail, order_id)
		VALUES ($1,NULLIF($2,''),$3,$4,$5,$6,$7)
		ON CONFLICT (issue, ref) WHERE resolved_at IS NULL DO NOTHING`,
		a.importID, a.provider, rec.Row, kind, recordRef(rec), raw, oid)
	if err == nil && ct.RowsAffected() == 1 {
		a.sum.Issues++
	}
}

func (a *importApplier) resolveIssues(rec importRecord) {
	refs := []string{}
	for _, v := range []string{rec.OrderNo, rec.PlatformOrderNo, rec.ShippingNo} {
		if v != "" {
			refs = append(refs, v)
		}
	}
	if len(refs) > 0 {
		a.tx.Exec(a.ctx, `UPDATE shipping_import_issues SET resolved_at = now() WHERE resolved_at IS NULL AND ref = ANY($1)`, refs)
	}
}

func (a *importApplier) setIdentifiers(ids []int, platformNo, shippingNo string) (changed, conflict bool, err error) {
	for _, id := range ids {
		c := a.state[id]
		np, chP, cfP := mergeIdentifier(c.PlatformOrderNo, platformNo)
		ns, chS, cfS := mergeIdentifier(c.ShippingNo, shippingNo)
		if cfP || cfS {
			conflict = true
			continue
		}
		if chP || chS {
			if _, err = a.tx.Exec(a.ctx, `UPDATE orders SET platform_order_no = NULLIF($1,''), tracking_number = NULLIF($2,''), updated_at = now() WHERE id=$3`, np, ns, id); err != nil {
				return
			}
			c.PlatformOrderNo, c.ShippingNo = np, ns
			changed = true
		}
	}
	return
}

func (a *importApplier) setCreateResult(ids []int, result, errText string) (changed bool, err error) {
	for _, id := range ids {
		c := a.state[id]
		if c.CreateResult == result && (result == "created" || errText == "") {
			continue
		}
		var ct int64
		tag, e := a.tx.Exec(a.ctx, `
			UPDATE shipping_batch_orders SET create_result = $1, last_error = NULLIF($2,'')
			WHERE order_id = $3 AND (create_result IS DISTINCT FROM $1 OR last_error IS DISTINCT FROM NULLIF($2,''))`,
			result, errText, id)
		if e != nil {
			return changed, e
		}
		ct = tag.RowsAffected()
		c.CreateResult = result
		if ct > 0 {
			changed = true
		}
	}
	return
}

// advance moves every member of the unit forward to `to` when it currently sits at `from`.
func (a *importApplier) advance(ids []int, from, to, reason string) (moved bool, err error) {
	for _, id := range ids {
		c := a.state[id]
		if c.Status != from {
			continue
		}
		if err = applyStatusChange(a.ctx, a.tx, id, from, to, &a.userID, reason); err != nil {
			return
		}
		c.Status = to
		moved = true
	}
	return
}

func (a *importApplier) record(rec importRecord) error {
	a.sum.Total++
	m := a.idx.match(rec)
	if m.Conflict {
		a.sum.Conflicts++
		a.issue(rec, "conflict", 0, map[string]any{"message": "identifiers point at different orders"})
		return nil
	}
	if len(m.Unit) == 0 {
		a.sum.Unmatched++
		a.issue(rec, "unmatched", 0, nil)
		return nil
	}
	ids := a.members[m.Unit[0].unitKey()]
	first := a.state[ids[0]]
	for _, id := range ids {
		c := a.state[id]
		if c.BatchID == 0 {
			a.sum.Unmatched++
			a.issue(rec, "not_in_batch", id, nil)
			return nil
		}
		if a.req.BatchID != nil && c.BatchID != *a.req.BatchID {
			a.sum.Unmatched++
			a.issue(rec, "other_batch", id, map[string]any{"batch_id": c.BatchID})
			return nil
		}
	}

	var changed bool
	var err error
	switch a.req.Kind {
	case "711_validation":
		changed, err = a.apply711Validation(rec, ids, first)
	case "711_export", "fm_result", "hct_result":
		changed, err = a.applyIdentifiers(rec, ids, first)
	case "3pl_shipment":
		changed, err = a.applyShipment(rec, ids, first)
	case "delivery":
		changed, err = a.applyDelivery(rec, ids, first)
	}
	if err != nil {
		return err
	}
	if changed {
		a.sum.Updated++
	} else {
		a.sum.Skipped++
	}
	return nil
}

func (a *importApplier) apply711Validation(rec importRecord, ids []int, first *candidateOrder) (bool, error) {
	platformNo, ok := parse711Result(rec.ResultText)
	if !ok {
		a.sum.Failed++
		for _, id := range ids {
			if a.state[id].CreateResult == "created" {
				return false, nil // a confirmed result is never downgraded by a later failed row
			}
		}
		return a.setCreateResult(ids, "failed", rec.ResultText)
	}
	changed, conflict, err := a.setIdentifiers(ids, platformNo, "")
	if err != nil {
		return false, err
	}
	if conflict {
		a.sum.Conflicts++
		a.issue(rec, "identifier_conflict", first.ID, map[string]any{"stored": first.PlatformOrderNo})
		return changed, nil
	}
	c2, err := a.setCreateResult(ids, "created", "")
	if err != nil {
		return false, err
	}
	moved, err := a.promote(ids, rec)
	if err != nil {
		return false, err
	}
	a.resolveIssues(rec)
	return changed || c2 || moved, nil
}

func (a *importApplier) applyIdentifiers(rec importRecord, ids []int, first *candidateOrder) (bool, error) {
	changed, conflict, err := a.setIdentifiers(ids, rec.PlatformOrderNo, rec.ShippingNo)
	if err != nil {
		return false, err
	}
	if conflict {
		a.sum.Conflicts++
		a.issue(rec, "identifier_conflict", first.ID, map[string]any{"stored_platform": first.PlatformOrderNo, "stored_shipping": first.ShippingNo})
		return changed, nil
	}
	if first.PlatformOrderNo != "" || (a.provider == "courier" && first.ShippingNo != "") {
		c2, err := a.setCreateResult(ids, "created", "")
		if err != nil {
			return false, err
		}
		changed = changed || c2
	}
	moved, err := a.promote(ids, rec)
	if err != nil {
		return false, err
	}
	if a.provider == "cvs_711" && first.ShippingNo == "" {
		a.sum.MissingShippingNo++
	}
	a.resolveIssues(rec)
	return changed || moved, nil
}

// promote moves a unit from Processing to Ready to Ship once its identifiers are complete enough.
func (a *importApplier) promote(ids []int, rec importRecord) (bool, error) {
	first := a.state[ids[0]]
	if !readyAfterImport(first.Provider, first.PlatformOrderNo, first.ShippingNo) {
		return false, nil
	}
	if first.Status == "pending" {
		a.issue(rec, "not_exported", first.ID, nil)
		return false, nil
	}
	return a.advance(ids, "processing", "ready_to_ship", "system: platform result imported ("+a.req.Kind+")")
}

func (a *importApplier) applyShipment(rec importRecord, ids []int, first *candidateOrder) (bool, error) {
	switch first.Status {
	case "ready_to_ship":
		moved, err := a.advance(ids, "ready_to_ship", "shipped", "system: 3PL shipment confirmed")
		a.resolveIssues(rec)
		return moved, err
	case "shipped", "delivered":
		return false, nil // already processed
	}
	a.issue(rec, "not_ready", first.ID, map[string]any{"status": first.Status})
	return false, nil
}

func (a *importApplier) applyDelivery(rec importRecord, ids []int, first *candidateOrder) (bool, error) {
	switch rec.Status {
	case "completed":
		switch first.Status {
		case "shipped":
			moved, err := a.advance(ids, "shipped", "delivered", "system: delivery completed (imported)")
			a.resolveIssues(rec)
			return moved, err
		case "delivered":
			return false, nil
		}
		a.issue(rec, "not_shipped_yet", first.ID, map[string]any{"status": first.Status})
	case "returned", "cancelled":
		if first.Status == "return" || first.Status == "cancelled" {
			return false, nil
		}
		// the platform reports a return/cancellation: never applied automatically (stock and the
		// return process need a person) - raised for staff instead
		a.issue(rec, "platform_reports_"+rec.Status, first.ID, map[string]any{"status": first.Status})
	}
	return false, nil
}

// Import handles POST /shipping-workbench/imports.
func (h *ShippingWorkbenchHandler) Import(w http.ResponseWriter, r *http.Request) {
	var req importRequest
	if err := decodeJSON(r, &req); err != nil || len(req.Records) == 0 {
		respondError(w, http.StatusBadRequest, "kind and records are required")
		return
	}
	want, known := importKindProvider[req.Kind]
	if !known {
		respondError(w, http.StatusBadRequest, "unknown import kind")
		return
	}
	provider := req.Provider
	if want != "" {
		if provider != "" && provider != want {
			respondError(w, http.StatusBadRequest, "this file belongs to another shipping provider")
			return
		}
		provider = want
	}
	if provider != "" && !validProvider(provider) {
		respondError(w, http.StatusBadRequest, "invalid provider")
		return
	}
	if provider == "" && req.Kind != "3pl_shipment" {
		respondError(w, http.StatusBadRequest, "provider is required")
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

	if req.BatchID != nil {
		var bp string
		if err := tx.QueryRow(ctx, `SELECT provider FROM shipping_batches WHERE id=$1`, *req.BatchID).Scan(&bp); err != nil {
			respondError(w, http.StatusNotFound, "batch not found")
			return
		}
		if provider != "" && bp != provider {
			respondError(w, http.StatusBadRequest, "this file does not belong to the batch's shipping provider")
			return
		}
		provider = bp
	}

	var repeat bool
	if req.FileHash != "" {
		tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM shipping_import_log WHERE file_hash=$1 AND kind=$2)`, req.FileHash, req.Kind).Scan(&repeat)
	}
	var importID int
	if err := tx.QueryRow(ctx, `
		INSERT INTO shipping_import_log (batch_id, provider, kind, file_name, file_hash, user_id)
		VALUES ($1,NULLIF($2,''),$3,$4,$5,$6) RETURNING id`,
		req.BatchID, provider, req.Kind, req.FileName, req.FileHash, claims.UserID).Scan(&importID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to log import")
		return
	}

	a := &importApplier{ctx: ctx, tx: tx, userID: claims.UserID, req: req, importID: importID, provider: provider,
		state: map[int]*candidateOrder{}, members: map[string][]int{}}
	a.sum.Repeat = repeat
	if err := a.loadCandidates(); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load orders")
		return
	}
	for _, rec := range req.Records {
		if err := a.record(rec); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to apply row "+fmt.Sprint(rec.Row)+": "+err.Error())
			return
		}
	}
	raw, _ := json.Marshal(a.sum)
	if _, err := tx.Exec(ctx, `UPDATE shipping_import_log SET summary=$1 WHERE id=$2`, raw, importID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save import summary")
		return
	}
	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "db commit failed")
		return
	}
	invalidateShippingCache()
	respondJSON(w, http.StatusOK, map[string]any{"import_id": importID, "summary": a.sum})
}
