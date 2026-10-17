package handlers

import (
	"context"
	"net/http"
	"strconv"
	"time"
)

type providerOverview struct {
	Provider      string `json:"provider"`
	ReadyToExport int    `json:"ready_to_export"`
	Insufficient  int    `json:"insufficient_stock"`
	Processing    int    `json:"processing"`
	ReadyToShip   int    `json:"ready_to_ship"`
	Shipped       int    `json:"shipped"`
}

func countOrders(rows []eligibleRow, category string) int {
	n := 0
	for _, r := range rows {
		if r.Category == category {
			n += len(r.OrderIDs)
		}
	}
	return n
}

// Overview handles GET /shipping-workbench/overview: the five figures per provider card.
func (h *ShippingWorkbenchHandler) Overview(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	out := []providerOverview{}
	for _, p := range []string{"cvs_711", "cvs_familymart", "courier"} {
		ov := providerOverview{Provider: p}
		elig, err := computeEligible(r, h.DB, p, time.Now())
		if err != nil {
			respondError(w, http.StatusInternalServerError, "failed to load overview")
			return
		}
		ov.ReadyToExport = countOrders(elig.Rows, catReady)
		ov.Insufficient = countOrders(elig.Rows, catInsufficient)
		if err := h.DB.QueryRow(ctx, `
			SELECT COUNT(*) FILTER (WHERE o.status = 'processing'),
			       COUNT(*) FILTER (WHERE o.status = 'ready_to_ship'),
			       COUNT(*) FILTER (WHERE o.status = 'shipped')
			FROM shipping_batch_orders sbo
			JOIN shipping_batches b ON b.id = sbo.batch_id
			JOIN orders o ON o.id = sbo.order_id
			WHERE b.provider = $1`, p).Scan(&ov.Processing, &ov.ReadyToShip, &ov.Shipped); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to load overview")
			return
		}
		out = append(out, ov)
	}
	respondJSON(w, http.StatusOK, out)
}

type alertSettings struct {
	ProcessingHours float64 `json:"processing_hours"`
	ReadyHours      float64 `json:"ready_hours"`
}

func loadAlertSettings(ctx context.Context, db queryer) alertSettings {
	s := alertSettings{ProcessingHours: 24, ReadyHours: 48}
	rows, err := db.Query(ctx, `SELECT key, value::float8 FROM app_settings WHERE key IN ('ship_alert_processing_hours','ship_alert_ready_hours')`)
	if err != nil {
		return s
	}
	defer rows.Close()
	for rows.Next() {
		var k string
		var v float64
		if rows.Scan(&k, &v) == nil {
			if k == "ship_alert_processing_hours" {
				s.ProcessingHours = v
			} else {
				s.ReadyHours = v
			}
		}
	}
	return s
}

// GetSettings handles GET /shipping-workbench/settings.
func (h *ShippingWorkbenchHandler) GetSettings(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, loadAlertSettings(r.Context(), h.DB))
}

// UpdateSettings handles PUT /shipping-workbench/settings (super_user only).
func (h *ShippingWorkbenchHandler) UpdateSettings(w http.ResponseWriter, r *http.Request) {
	var req alertSettings
	if err := decodeJSON(r, &req); err != nil || req.ProcessingHours <= 0 || req.ReadyHours <= 0 {
		respondError(w, http.StatusBadRequest, "hours must be positive numbers")
		return
	}
	for k, v := range map[string]float64{"ship_alert_processing_hours": req.ProcessingHours, "ship_alert_ready_hours": req.ReadyHours} {
		if _, err := h.DB.Exec(r.Context(), `
			INSERT INTO app_settings (key, value) VALUES ($1,$2)
			ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, k, v); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to save settings")
			return
		}
	}
	respondJSON(w, http.StatusOK, req)
}

type pendingIssue struct {
	Type          string `json:"type"`
	Provider      string `json:"provider"`
	OrderID       *int   `json:"order_id"`
	OrderNo       string `json:"order_no"`
	BatchID       *int   `json:"batch_id"`
	BatchNo       string `json:"batch_no"`
	Message       string `json:"message"`
	Since         string `json:"since"`
	ImportIssueID *int   `json:"import_issue_id"`
}

// Issues handles GET /shipping-workbench/issues?limit=&offset=: a live, centralised list of what
// needs attention across all providers. Derived from the orders' current state (so an issue
// disappears the moment its cause is fixed), plus the open import issues (unmatched / conflicting
// rows). Oldest first.
func (h *ShippingWorkbenchHandler) Issues(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 || limit > 500 {
		limit = 5
	}
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	if offset < 0 {
		offset = 0
	}
	set := loadAlertSettings(r.Context(), h.DB)
	const base = `
		WITH bo AS (
			SELECT o.id AS order_id, o.order_no, o.status, b.id AS batch_id, b.batch_no, b.provider,
			       sbo.create_result, COALESCE(sbo.last_error,'') AS last_error,
			       COALESCE(o.tracking_number,'') AS tracking, COALESCE(o.platform_order_no,'') AS platform,
			       COALESCE((SELECT MAX(l.created_at) FROM order_status_log l WHERE l.order_id = o.id AND l.status_to = o.status), o.created_at) AS since,
			       EXISTS (SELECT 1 FROM shipping_import_log il WHERE il.batch_id = b.id
			               AND il.kind IN ('711_validation','711_export','fm_result','hct_result')) AS results_imported
			FROM shipping_batch_orders sbo
			JOIN orders o ON o.id = sbo.order_id
			JOIN shipping_batches b ON b.id = sbo.batch_id
			WHERE o.status IN ('processing','ready_to_ship')
		), iss AS (
			SELECT 'create_failed' AS type, provider, order_id, order_no, batch_id, batch_no, last_error AS message, since, NULL::int AS import_issue_id FROM bo
			  WHERE status = 'processing' AND create_result = 'failed'
			UNION ALL
			SELECT 'pending_verification', provider, order_id, order_no, batch_id, batch_no, 'Not in the platform results - verify before retrying', since, NULL FROM bo
			  WHERE status = 'processing' AND create_result IS NULL AND results_imported
			UNION ALL
			SELECT 'missing_shipping_no', provider, order_id, order_no, batch_id, batch_no, 'Missing shipping number', since, NULL FROM bo
			  WHERE create_result = 'created' AND tracking = '' AND status IN ('processing','ready_to_ship')
			UNION ALL
			SELECT 'processing_too_long', provider, order_id, order_no, batch_id, batch_no, 'Processing for too long', since, NULL FROM bo
			  WHERE status = 'processing' AND since < now() - make_interval(secs => $1::float8 * 3600)
			UNION ALL
			SELECT 'ready_too_long', provider, order_id, order_no, batch_id, batch_no, 'Ready to Ship for too long', since, NULL FROM bo
			  WHERE status = 'ready_to_ship' AND since < now() - make_interval(secs => $2::float8 * 3600)
			UNION ALL
			SELECT 'import_' || i.issue, COALESCE(i.provider,''), i.order_id, COALESCE(o.order_no, i.ref), l.batch_id, COALESCE(b.batch_no,''),
			       i.issue || ': ' || i.ref, i.created_at, i.id
			FROM shipping_import_issues i
			JOIN shipping_import_log l ON l.id = i.import_id
			LEFT JOIN shipping_batches b ON b.id = l.batch_id
			LEFT JOIN orders o ON o.id = i.order_id
			WHERE i.resolved_at IS NULL
		)`
	var total int
	if err := h.DB.QueryRow(r.Context(), base+` SELECT COUNT(*) FROM iss`, set.ProcessingHours, set.ReadyHours).Scan(&total); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load issues")
		return
	}
	rows, err := h.DB.Query(r.Context(), base+`
		SELECT type, provider, order_id, order_no, batch_id, batch_no, message, since, import_issue_id
		FROM iss ORDER BY since ASC, order_id LIMIT $3 OFFSET $4`, set.ProcessingHours, set.ReadyHours, limit, offset)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load issues")
		return
	}
	defer rows.Close()
	items := []pendingIssue{}
	for rows.Next() {
		var it pendingIssue
		var since time.Time
		if err := rows.Scan(&it.Type, &it.Provider, &it.OrderID, &it.OrderNo, &it.BatchID, &it.BatchNo, &it.Message, &since, &it.ImportIssueID); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to read issues")
			return
		}
		it.Since = since.Format(time.RFC3339)
		items = append(items, it)
	}
	respondJSON(w, http.StatusOK, map[string]any{"total": total, "items": items})
}
