package handlers

import (
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// PerformanceComparisonHandler powers the Performance Comparison page. Section 1, "Location &
// Shift Performance": one row per Location (children Morning / Middle / Evening) and one for the
// Website (children Self-Service / Created by CS / each Master Affiliate), with LIVE counts, AVG
// and TOTAL QTY / ORD / GMV, AOV and share of GMV. Every order falls in exactly one row, so
// nothing is double counted.
type PerformanceComparisonHandler struct {
	DB *pgxpool.Pool
}

type comparisonRow struct {
	Key      string          `json:"key"`
	Label    string          `json:"label"`
	Kind     string          `json:"kind"`    // location | shift | website | website_source | affiliate
	Live     *int            `json:"live"`    // recorded LIVE sessions; null for Website rows
	AvgQty   *float64        `json:"avg_qty"` // total / divisor (LIVE count, or website operating days)
	AvgOrd   *float64        `json:"avg_ord"`
	AvgGMV   *float64        `json:"avg_gmv"`
	TotalQty int             `json:"total_qty"`
	TotalOrd int             `json:"total_ord"`
	TotalGMV float64         `json:"total_gmv"`
	AOV      *float64        `json:"aov"`
	Share    float64         `json:"share_pct"` // parent: GMV / company GMV; child: GMV / parent GMV
	Children []comparisonRow `json:"children,omitempty"`
}

type compTotals struct {
	qty int
	ord int
	gmv float64
}

func newComparisonRow(key, label, kind string, t compTotals, live *int, divisor int) comparisonRow {
	row := comparisonRow{Key: key, Label: label, Kind: kind, Live: live, TotalQty: t.qty, TotalOrd: t.ord, TotalGMV: t.gmv}
	if t.ord > 0 {
		aov := t.gmv / float64(t.ord)
		row.AOV = &aov
	}
	if divisor > 0 {
		d := float64(divisor)
		aq, ao, ag := float64(t.qty)/d, float64(t.ord)/d, t.gmv/d
		row.AvgQty, row.AvgOrd, row.AvgGMV = &aq, &ao, &ag
	}
	return row
}

func pct(part, whole float64) float64 {
	if whole <= 0 {
		return 0
	}
	return part / whole * 100
}

// LocationShift serves GET /performance-comparison/location-shift?from&to.
func (h *PerformanceComparisonHandler) LocationShift(w http.ResponseWriter, r *http.Request) {
	from, to, filtered := dateRange(r)
	if !filtered {
		to = time.Now()
		from = to.AddDate(0, 0, -6)
	}
	ctx := r.Context()
	shifts := []string{"morning", "middle", "evening"}

	type locShift struct {
		loc   int
		shift string
	}
	// ---- LIVE sales / sessions per location and per location+shift ---------------------------
	locTotals := map[int]compTotals{}
	shiftTotals := map[locShift]compTotals{}
	locLive := map[int]int{}
	shiftLive := map[locShift]int{}

	// A sale belongs to the Location of the LIVE session it was sold in (falling back to the
	// host's own Location), and to the host's Shift.
	const saleLoc = `COALESCE(ls.location_id, h.location_id)`
	salesFrom := `
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		JOIN hosts h ON h.id = oi.host_id
		LEFT JOIN live_sessions ls ON ls.id = oi.live_session_id
		WHERE o.sales_channel = 'live' AND o.status NOT IN ('cancelled','return')
		  AND o.created_at >= $1 AND o.created_at < $2`
	if rows, err := h.DB.Query(ctx, `SELECT COALESCE(`+saleLoc+`,0), COALESCE(SUM(oi.qty),0), COUNT(DISTINCT oi.order_id), COALESCE(SUM(oi.qty*oi.price_at_order),0)`+salesFrom+` GROUP BY 1`, from, to); err == nil {
		for rows.Next() {
			var loc int
			var t compTotals
			if rows.Scan(&loc, &t.qty, &t.ord, &t.gmv) == nil {
				locTotals[loc] = t
			}
		}
		rows.Close()
	} else {
		respondError(w, http.StatusInternalServerError, "failed to fetch location sales")
		return
	}
	if rows, err := h.DB.Query(ctx, `SELECT COALESCE(`+saleLoc+`,0), COALESCE(h.shift,''), COALESCE(SUM(oi.qty),0), COUNT(DISTINCT oi.order_id), COALESCE(SUM(oi.qty*oi.price_at_order),0)`+salesFrom+` GROUP BY 1, 2`, from, to); err == nil {
		for rows.Next() {
			var loc int
			var shift string
			var t compTotals
			if rows.Scan(&loc, &shift, &t.qty, &t.ord, &t.gmv) == nil {
				shiftTotals[locShift{loc, shift}] = t
			}
		}
		rows.Close()
	}
	if rows, err := h.DB.Query(ctx, `
		SELECT COALESCE(COALESCE(ls.location_id, h.location_id),0), COALESCE(h.shift,''), COUNT(*)
		FROM live_sessions ls JOIN hosts h ON h.id = ls.host_id
		WHERE ls.live_data_recorded_at IS NOT NULL AND ls.started_at >= $1 AND ls.started_at < $2
		GROUP BY 1, 2`, from, to); err == nil {
		for rows.Next() {
			var loc, n int
			var shift string
			if rows.Scan(&loc, &shift, &n) == nil {
				shiftLive[locShift{loc, shift}] = n
				locLive[loc] += n
			}
		}
		rows.Close()
	}

	type location struct {
		id   int
		name string
	}
	var locations []location
	if rows, err := h.DB.Query(ctx, `SELECT id, name FROM host_locations ORDER BY name`); err == nil {
		for rows.Next() {
			var l location
			if rows.Scan(&l.id, &l.name) == nil {
				locations = append(locations, l)
			}
		}
		rows.Close()
	}
	if _, ok := locTotals[0]; ok { // sales whose host has no Location at all
		locations = append(locations, location{id: 0, name: "-"})
	}

	// ---- Website: Self-Service / Created by CS / each Master Affiliate ------------------------
	type webKey struct {
		kind string // website_source | affiliate
		key  string
	}
	webTotals := map[webKey]compTotals{}
	var webAll compTotals
	if rows, err := h.DB.Query(ctx, `
		SELECT CASE WHEN o.affiliate_id IS NOT NULL THEN 'affiliate' ELSE 'website_source' END,
		       CASE WHEN o.affiliate_id IS NOT NULL THEN COALESCE(a.parent_affiliate_id, a.id)::text
		            ELSE COALESCE(o.website_source, 'cs') END,
		       COALESCE(SUM(oi.qty),0), COUNT(DISTINCT oi.order_id), COALESCE(SUM(oi.qty*oi.price_at_order),0)
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		LEFT JOIN affiliates a ON a.id = o.affiliate_id
		WHERE o.sales_channel = 'website' AND o.status NOT IN ('cancelled','return')
		  AND o.created_at >= $1 AND o.created_at < $2
		GROUP BY 1, 2`, from, to); err == nil {
		for rows.Next() {
			var kind, key string
			var t compTotals
			if rows.Scan(&kind, &key, &t.qty, &t.ord, &t.gmv) == nil {
				webTotals[webKey{kind, key}] = t
				webAll.qty += t.qty
				webAll.gmv += t.gmv
			}
		}
		rows.Close()
	}
	if err := h.DB.QueryRow(ctx, `
		SELECT COUNT(*) FROM orders o WHERE o.sales_channel = 'website' AND o.status NOT IN ('cancelled','return')
		  AND o.created_at >= $1 AND o.created_at < $2
		  AND EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id)`, from, to).Scan(&webAll.ord); err != nil {
		webAll.ord = 0
	}
	webDays := len(websiteDayKeys(websiteLaunchDate(ctx, h.DB), from, to, time.Now()))

	type affRow struct {
		id   int
		name string
	}
	var masters []affRow
	if rows, err := h.DB.Query(ctx, `SELECT id, name FROM affiliates WHERE parent_affiliate_id IS NULL ORDER BY name`); err == nil {
		for rows.Next() {
			var a affRow
			if rows.Scan(&a.id, &a.name) == nil {
				masters = append(masters, a)
			}
		}
		rows.Close()
	}

	// ---- assemble ---------------------------------------------------------------------------
	companyGMV := webAll.gmv
	for _, t := range locTotals {
		companyGMV += t.gmv
	}
	var out []comparisonRow
	for _, l := range locations {
		live := locLive[l.id]
		row := newComparisonRow("loc-"+strconv.Itoa(l.id), l.name, "location", locTotals[l.id], &live, live)
		row.Share = pct(row.TotalGMV, companyGMV)
		for _, s := range shifts {
			sl := shiftLive[locShift{l.id, s}]
			child := newComparisonRow("loc-"+strconv.Itoa(l.id)+"-"+s, s, "shift", shiftTotals[locShift{l.id, s}], &sl, sl)
			child.Share = pct(child.TotalGMV, row.TotalGMV)
			row.Children = append(row.Children, child)
		}
		out = append(out, row)
	}

	web := newComparisonRow("website", "Website", "website", webAll, nil, webDays)
	web.Share = pct(web.TotalGMV, companyGMV)
	for _, src := range []struct{ key, label string }{{"self_service", "self_service"}, {"cs", "cs"}} {
		child := newComparisonRow("website-"+src.key, src.label, "website_source", webTotals[webKey{"website_source", src.key}], nil, webDays)
		child.Share = pct(child.TotalGMV, web.TotalGMV)
		web.Children = append(web.Children, child)
	}
	for _, a := range masters {
		child := newComparisonRow("website-aff-"+strconv.Itoa(a.id), a.name, "affiliate", webTotals[webKey{"affiliate", strconv.Itoa(a.id)}], nil, webDays)
		child.Share = pct(child.TotalGMV, web.TotalGMV)
		web.Children = append(web.Children, child)
	}
	out = append(out, web)

	sort.SliceStable(out[:len(out)-1], func(i, j int) bool { return out[i].TotalGMV > out[j].TotalGMV })
	respondJSON(w, http.StatusOK, map[string]interface{}{"company_gmv": companyGMV, "website_days": webDays, "rows": out})
}

// customGroupResult is one Custom Performance Comparison group: every metric the results table
// shows. A null means "not available for this group" (the UI prints "—", never 0).
type customGroupResult struct {
	Views         *int     `json:"views"`
	AWTSeconds    *float64 `json:"awt_seconds"`
	ACU           *float64 `json:"acu"`
	Chats         *int     `json:"chats"`
	Ord           int      `json:"ord"`
	Qty           int      `json:"qty"`
	GMV           float64  `json:"gmv"`
	AOV           *float64 `json:"aov"`
	GPM           *float64 `json:"gpm"`
	AvgQty        *float64 `json:"avg_qty"`
	AvgOrd        *float64 `json:"avg_ord"`
	AvgGMV        *float64 `json:"avg_gmv"`
	OperatingDays int      `json:"operating_days"`
}

// buildCustomGroup maps one aggregate + the group's Active Operating Days onto the table metrics:
//   - Website has no broadcast, so Views / AWT / ACU / Chats / GPM are unavailable.
//   - ALL keeps the broadcast metrics of its LIVE sessions, but GPM (GMV / Views) is unavailable
//     because ALL's GMV also contains Website sales that no view could have produced.
//   - LIVE keeps everything.
//
// AVG QTY / ORD / GMV divide by the group's own operating days, like the Performance Dashboard.
func buildCustomGroup(channel string, total aggregateRow, days operatingDays) customGroupResult {
	res := customGroupResult{Ord: total.Ord, Qty: total.Qty, GMV: total.GMV, AOV: total.AOV}
	if channel != "website" {
		res.Views, res.AWTSeconds, res.ACU, res.Chats = total.Views, total.AWTSeconds, total.ACU, total.Chats
	}
	if channel == "live" {
		res.GPM = total.GPM
	}
	n := days.ForChannel(channel)
	res.OperatingDays = n
	if n > 0 {
		d := float64(n)
		aq, ao, ag := float64(total.Qty)/d, float64(total.Ord)/d, total.GMV/d
		res.AvgQty, res.AvgOrd, res.AvgGMV = &aq, &ao, &ag
	}
	return res
}

// Custom serves GET /performance-comparison/custom for ONE comparison group (the page calls it
// once per group). Filters: channel=all|live|website, location_id/host_id (LIVE only),
// affiliate_id (Website only), from/to or all_time=1.
func (h *PerformanceComparisonHandler) Custom(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	channel := q.Get("channel")
	if channel != "live" && channel != "website" {
		channel = "all"
	}
	// Re-build the query so each channel only carries the filters that belong to it; the shared
	// aggregate/operating-day helpers read everything straight from the request.
	clean := url.Values{"channel": {channel}}
	if channel == "live" {
		for _, k := range []string{"location_id", "host_id"} {
			if v := q.Get(k); v != "" {
				clean.Set(k, v)
			}
		}
	}
	if channel == "website" {
		if v := q.Get("affiliate_id"); v != "" {
			clean.Set("affiliate_id", v)
		}
	}
	var from, to time.Time
	switch {
	case q.Get("all_time") == "1":
		from, to = time.Unix(0, 0), time.Now().Add(24*time.Hour)
	default:
		clean.Set("from", q.Get("from"))
		clean.Set("to", q.Get("to"))
	}
	r2 := r.Clone(r.Context())
	r2.URL.RawQuery = clean.Encode()
	if q.Get("all_time") != "1" {
		var filtered bool
		from, to, filtered = dateRange(r2)
		if !filtered {
			to = time.Now()
			from = to.AddDate(0, 0, -6)
		}
	}

	agg := &HostAnalyticsHandler{DB: h.DB}
	total, _, err := agg.aggregate(r2, from, to)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch comparison group")
		return
	}
	days, err := computeOperatingDays(r.Context(), h.DB, r2, from, to)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch operating days")
		return
	}
	respondJSON(w, http.StatusOK, buildCustomGroup(channel, total, days))
}
