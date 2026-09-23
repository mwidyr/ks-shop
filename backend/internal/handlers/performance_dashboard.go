package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// PerformanceDashboardHandler powers Performance Dashboard (item #007, phase 1 of 3): overall
// operational performance across all hosts who had a "valid LIVE Session" - one with LIVE Data
// recorded (live_sessions.live_data_recorded_at) - within the selected Location and Period. This
// "valid session" gate is what distinguishes it from the store-wide Dashboard (dashboard.go),
// which has no such concept and just aggregates every order regardless of LIVE session status.
type PerformanceDashboardHandler struct {
	DB *pgxpool.Pool
}

// validHostsCTE builds the "WITH valid_hosts AS (...)" fragment shared by every endpoint below:
// every host with at least one valid LIVE Session whose started_at falls in [from, to), narrowed
// to one Location Tag when ?location_id= is given. Args always start with [from, to].
func validHostsCTE(r *http.Request) (sql string, args []interface{}) {
	args = []interface{}{}
	where := ""
	if locID := r.URL.Query().Get("location_id"); locID != "" {
		if id, err := strconv.Atoi(locID); err == nil {
			args = append(args, id)
			where = " AND h.location_id = $3"
		}
	}
	sql = `valid_hosts AS (
		SELECT DISTINCT h.id AS host_id, h.name AS host_name, h.location_id, hl.name AS location_name
		FROM hosts h
		JOIN host_locations hl ON hl.id = h.location_id
		JOIN live_sessions ls ON ls.host_id = h.id
		WHERE ls.live_data_recorded_at IS NOT NULL
		  AND ls.started_at >= $1 AND ls.started_at < $2` + where + `
	)`
	return sql, args
}

// resolveRange defaults to the last 30 days when no ?from=/?to= is given, matching the
// convention already used by dashboard.go/reports.go.
func resolveRange(r *http.Request) (time.Time, time.Time) {
	from, to, filtered := dateRange(r)
	if !filtered {
		to = time.Now()
		from = to.AddDate(0, 0, -30)
	}
	return from, to
}

type performanceSummary struct {
	Qty    int      `json:"qty"`
	Ord    int      `json:"ord"`
	GMV    float64  `json:"gmv"`
	AvgQty *float64 `json:"avg_qty"`
	AvgOrd *float64 `json:"avg_ord"`
	AOV    *float64 `json:"aov"`
}

// Summary returns the Main KPI row (QTY/ORD/GMV, AVG QTY/AVG ORD/AOV) for the selected Location
// and Period.
func (h *PerformanceDashboardHandler) Summary(w http.ResponseWriter, r *http.Request) {
	from, to := resolveRange(r)
	cte, extraArgs := validHostsCTE(r)
	args := append([]interface{}{from, to}, extraArgs...)

	query := `WITH ` + cte + `,
		sales AS (
			SELECT COALESCE(SUM(oi.qty),0) AS qty, COUNT(DISTINCT oi.order_id) AS ord,
			       COALESCE(SUM(oi.qty * oi.price_at_order),0) AS gmv
			FROM order_items oi
			JOIN orders o ON o.id = oi.order_id
			WHERE oi.host_id IN (SELECT host_id FROM valid_hosts)
			  AND o.created_at >= $1 AND o.created_at < $2
			  AND o.status NOT IN ('cancelled','return')
		),
		sessions AS (
			SELECT COUNT(*) AS session_count FROM live_sessions ls
			WHERE ls.host_id IN (SELECT host_id FROM valid_hosts)
			  AND ls.live_data_recorded_at IS NOT NULL
			  AND ls.started_at >= $1 AND ls.started_at < $2
		)
		SELECT sales.qty, sales.ord, sales.gmv, sessions.session_count FROM sales, sessions`

	var qty, ord, sessionCount int
	var gmv float64
	if err := h.DB.QueryRow(r.Context(), query, args...).Scan(&qty, &ord, &gmv, &sessionCount); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch summary")
		return
	}

	res := performanceSummary{Qty: qty, Ord: ord, GMV: gmv}
	if sessionCount > 0 {
		avgQty := float64(qty) / float64(sessionCount)
		avgOrd := float64(ord) / float64(sessionCount)
		res.AvgQty = &avgQty
		res.AvgOrd = &avgOrd
	}
	if ord > 0 {
		aov := gmv / float64(ord)
		res.AOV = &aov
	}
	respondJSON(w, http.StatusOK, res)
}

type hostRankRow struct {
	HostID       int      `json:"host_id"`
	Host         string   `json:"host"`
	LocationName string   `json:"location_name"`
	GMV          float64  `json:"gmv"`
	Ord          int      `json:"ord"`
	Qty          int      `json:"qty"`
	AOV          *float64 `json:"aov"`
	GMVPct       float64  `json:"gmv_pct"`
}

// HostRanking returns every valid host sorted GMV desc, with GMV% of the ranked total.
func (h *PerformanceDashboardHandler) HostRanking(w http.ResponseWriter, r *http.Request) {
	from, to := resolveRange(r)
	cte, extraArgs := validHostsCTE(r)
	args := append([]interface{}{from, to}, extraArgs...)

	query := `WITH ` + cte + `
		SELECT vh.host_id, vh.host_name, vh.location_name,
		       COALESCE(SUM(oi.qty),0) AS qty,
		       COALESCE(COUNT(DISTINCT oi.order_id),0) AS ord,
		       COALESCE(SUM(oi.qty * oi.price_at_order),0) AS gmv
		FROM valid_hosts vh
		LEFT JOIN order_items oi ON oi.host_id = vh.host_id
		LEFT JOIN orders o ON o.id = oi.order_id AND o.created_at >= $1 AND o.created_at < $2
		     AND o.status NOT IN ('cancelled','return')
		GROUP BY vh.host_id, vh.host_name, vh.location_name
		ORDER BY gmv DESC`

	rows, err := h.DB.Query(r.Context(), query, args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch host ranking")
		return
	}
	defer rows.Close()

	list := []hostRankRow{}
	total := 0.0
	for rows.Next() {
		var row hostRankRow
		if err := rows.Scan(&row.HostID, &row.Host, &row.LocationName, &row.Qty, &row.Ord, &row.GMV); err != nil {
			continue
		}
		if row.Ord > 0 {
			aov := row.GMV / float64(row.Ord)
			row.AOV = &aov
		}
		total += row.GMV
		list = append(list, row)
	}
	if total > 0 {
		for i := range list {
			list[i].GMVPct = list[i].GMV / total * 100
		}
	}
	respondJSON(w, http.StatusOK, list)
}

type performanceDataRow struct {
	HostID       int      `json:"host_id"`
	Host         string   `json:"host"`
	LocationName string   `json:"location_name"`
	Views        *int     `json:"views"`
	UV           *int     `json:"uv"`
	Active       *int     `json:"active"`
	AWTSeconds   *float64 `json:"awt_seconds"`
	PCU          *int     `json:"pcu"`
	ACU          *float64 `json:"acu"`
	Follows      *int     `json:"follows"`
	Chats        *int     `json:"chats"`
	Shares       *int     `json:"shares"`
	Likes        *int     `json:"likes"`
	Ord          int      `json:"ord"`
	Qty          int      `json:"qty"`
	GMV          float64  `json:"gmv"`
	Ret          int      `json:"ret"`
	RetAmount    float64  `json:"ret_amount"`
	NGR          float64  `json:"ngr"`
	AOV          *float64 `json:"aov"`
	RetPct       *float64 `json:"ret_pct"`
	GPM          *float64 `json:"gpm"`
}

var performanceDataSortColumns = map[string]string{
	"gmv": "gmv", "ord": "ord", "qty": "qty", "views": "views", "ret": "ret", "ret_amount": "ret_amount",
}

// PerformanceData returns one aggregated row per valid host with the full LIVE + Sales + Return
// column set, per the KPI Aggregation Rules (Sum for counters, Max for PCU, weighted avg for
// AWT/ACU, calculated-from-totals for AOV/NGR/RET%/GPM - never averaged per session).
func (h *PerformanceDashboardHandler) PerformanceData(w http.ResponseWriter, r *http.Request) {
	from, to := resolveRange(r)
	cte, extraArgs := validHostsCTE(r)
	args := append([]interface{}{from, to}, extraArgs...)

	orderBy := "gmv DESC"
	if sort := performanceDataSortColumns[r.URL.Query().Get("sort")]; sort != "" {
		dir := "DESC"
		if r.URL.Query().Get("dir") == "asc" {
			dir = "ASC"
		}
		orderBy = sort + " " + dir
	}

	query := `WITH ` + cte + `,
		live_agg AS (
			SELECT ls.host_id,
			       SUM(ls.views) AS views, SUM(ls.uv) AS uv, SUM(ls.active_viewers) AS active,
			       CASE WHEN SUM(ls.uv) > 0 THEN SUM(ls.awt_seconds::numeric * ls.uv) / SUM(ls.uv) END AS awt_seconds,
			       MAX(ls.pcu) AS pcu,
			       CASE WHEN SUM(EXTRACT(EPOCH FROM (ls.ended_at - ls.started_at))) > 0
			            THEN SUM(ls.acu * EXTRACT(EPOCH FROM (ls.ended_at - ls.started_at)))
			                 / SUM(EXTRACT(EPOCH FROM (ls.ended_at - ls.started_at))) END AS acu,
			       SUM(ls.follows) AS follows, SUM(ls.chats) AS chats, SUM(ls.shares) AS shares, SUM(ls.likes) AS likes
			FROM live_sessions ls
			WHERE ls.host_id IN (SELECT host_id FROM valid_hosts)
			  AND ls.live_data_recorded_at IS NOT NULL
			  AND ls.started_at >= $1 AND ls.started_at < $2
			GROUP BY ls.host_id
		),
		sales_agg AS (
			SELECT oi.host_id, COALESCE(SUM(oi.qty),0) AS qty, COUNT(DISTINCT oi.order_id) AS ord,
			       COALESCE(SUM(oi.qty * oi.price_at_order),0) AS gmv
			FROM order_items oi
			JOIN orders o ON o.id = oi.order_id
			WHERE oi.host_id IN (SELECT host_id FROM valid_hosts)
			  AND o.created_at >= $1 AND o.created_at < $2
			  AND o.status NOT IN ('cancelled','return')
			GROUP BY oi.host_id
		),
		return_agg AS (
			SELECT ret.host_id, COALESCE(SUM(ret.qty),0) AS ret_qty, COALESCE(SUM(ret.amount),0) AS ret_amount
			FROM returns ret
			WHERE ret.host_id IN (SELECT host_id FROM valid_hosts)
			  AND ret.created_at >= $1 AND ret.created_at < $2
			GROUP BY ret.host_id
		)
		SELECT vh.host_id, vh.host_name, vh.location_name,
		       la.views, la.uv, la.active, la.awt_seconds, la.pcu, la.acu, la.follows, la.chats, la.shares, la.likes,
		       COALESCE(sa.ord,0), COALESCE(sa.qty,0), COALESCE(sa.gmv,0),
		       COALESCE(ra.ret_qty,0), COALESCE(ra.ret_amount,0)
		FROM valid_hosts vh
		LEFT JOIN live_agg la ON la.host_id = vh.host_id
		LEFT JOIN sales_agg sa ON sa.host_id = vh.host_id
		LEFT JOIN return_agg ra ON ra.host_id = vh.host_id
		ORDER BY ` + orderBy

	rows, err := h.DB.Query(r.Context(), query, args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch performance data")
		return
	}
	defer rows.Close()

	list := []performanceDataRow{}
	for rows.Next() {
		var row performanceDataRow
		if err := rows.Scan(&row.HostID, &row.Host, &row.LocationName,
			&row.Views, &row.UV, &row.Active, &row.AWTSeconds, &row.PCU, &row.ACU, &row.Follows, &row.Chats, &row.Shares, &row.Likes,
			&row.Ord, &row.Qty, &row.GMV, &row.Ret, &row.RetAmount); err != nil {
			continue
		}
		row.NGR = row.GMV - row.RetAmount
		if row.Ord > 0 {
			aov := row.GMV / float64(row.Ord)
			row.AOV = &aov
		}
		if row.Qty > 0 {
			retPct := float64(row.Ret) / float64(row.Qty) * 100
			row.RetPct = &retPct
		}
		if row.Views != nil && *row.Views > 0 {
			gpm := row.GMV / float64(*row.Views) * 1000
			row.GPM = &gpm
		}
		list = append(list, row)
	}
	respondJSON(w, http.StatusOK, list)
}
