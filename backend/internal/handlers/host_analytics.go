package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// HostAnalyticsHandler powers Host Performance Analytics (item #007, phase 2 of 3): a detailed
// look at one host (or all hosts within one Location) - lifetime totals, historical bests, and
// a period-bound summary + daily breakdown. Location/Host filters narrow every endpoint the same
// way; Lifetime Performance and Historical Best deliberately ignore the Period filter (per spec,
// they're the complete history), while Summary and PerformanceData use it.
type HostAnalyticsHandler struct {
	DB *pgxpool.Pool
}

// hostFilter builds the "AND h.location_id = $N [AND ls_or_oi.host_id = $N]" fragment shared by
// every endpoint below. hostCol names the host_id column in the query being built (e.g. "ls" for
// live_sessions, "oi" for order_items) since it differs per query.
func hostFilter(r *http.Request, hostCol string, startArg int) (whereSQL string, args []interface{}) {
	n := startArg
	if locID := r.URL.Query().Get("location_id"); locID != "" {
		if id, err := strconv.Atoi(locID); err == nil {
			args = append(args, id)
			whereSQL += " AND h.location_id = $" + strconv.Itoa(n)
			n++
		}
	}
	if hostID := r.URL.Query().Get("host_id"); hostID != "" {
		if id, err := strconv.Atoi(hostID); err == nil {
			args = append(args, id)
			whereSQL += " AND " + hostCol + ".host_id = $" + strconv.Itoa(n)
			n++
		}
	}
	return whereSQL, args
}

type aggregateRow struct {
	Views      *int     `json:"views"`
	UV         *int     `json:"uv"`
	Active     *int     `json:"active"`
	AWTSeconds *float64 `json:"awt_seconds"`
	PCU        *int     `json:"pcu"`
	ACU        *float64 `json:"acu"`
	Follows    *int     `json:"follows"`
	Chats      *int     `json:"chats"`
	Shares     *int     `json:"shares"`
	Likes      *int     `json:"likes"`
	Ord        int      `json:"ord"`
	Qty        int      `json:"qty"`
	GMV        float64  `json:"gmv"`
	Ret        int      `json:"ret"`
	RetAmount  float64  `json:"ret_amount"`
	NGR        float64  `json:"ngr"`
	AOV        *float64 `json:"aov"`
	RetPct     *float64 `json:"ret_pct"`
	GPM        *float64 `json:"gpm"`
}

func fillCalculated(row *aggregateRow) {
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
}

// aggregate runs one combined LIVE+Sales+Return aggregation across every session/order/return
// matching the Location/Host filters within [from, to). Reused by Lifetime (from=epoch) and
// Summary (from=selected period).
func (h *HostAnalyticsHandler) aggregate(r *http.Request, from, to time.Time) (aggregateRow, int, error) {
	// Same filter, three different host_id aliases - each CTE below joins hosts as "h" under a
	// different fact table (ls/oi/ret), so the host_id half of the fragment must name the right
	// one, even though all three produce identical $3/$4 args for this one request.
	liveWhere, locArgs := hostFilter(r, "ls", 3)
	salesWhere, _ := hostFilter(r, "oi", 3)
	retWhere, _ := hostFilter(r, "ret", 3)
	query := `
		WITH live_agg AS (
			SELECT COUNT(*) AS session_count,
			       SUM(ls.views) views, SUM(ls.uv) uv, SUM(ls.active_viewers) active,
			       CASE WHEN SUM(ls.uv) > 0 THEN SUM(ls.awt_seconds::numeric * ls.uv) / SUM(ls.uv) END awt_seconds,
			       MAX(ls.pcu) pcu,
			       CASE WHEN SUM(EXTRACT(EPOCH FROM (ls.ended_at - ls.started_at))) > 0
			            THEN SUM(ls.acu * EXTRACT(EPOCH FROM (ls.ended_at - ls.started_at)))
			                 / SUM(EXTRACT(EPOCH FROM (ls.ended_at - ls.started_at))) END acu,
			       SUM(ls.follows) follows, SUM(ls.chats) chats, SUM(ls.shares) shares, SUM(ls.likes) likes
			FROM live_sessions ls
			JOIN hosts h ON h.id = ls.host_id
			WHERE ls.live_data_recorded_at IS NOT NULL
			  AND ls.started_at >= $1 AND ls.started_at < $2` + liveWhere + `
		),
		sales_agg AS (
			SELECT COALESCE(SUM(oi.qty),0) qty, COUNT(DISTINCT oi.order_id) ord, COALESCE(SUM(oi.qty*oi.price_at_order),0) gmv
			FROM order_items oi
			JOIN orders o ON o.id = oi.order_id
			JOIN hosts h ON h.id = oi.host_id
			WHERE o.status NOT IN ('cancelled','return')
			  AND o.created_at >= $1 AND o.created_at < $2` + salesWhere + `
		),
		return_agg AS (
			SELECT COALESCE(SUM(ret.qty),0) ret_qty, COALESCE(SUM(ret.amount),0) ret_amount
			FROM returns ret
			JOIN hosts h ON h.id = ret.host_id
			WHERE ret.created_at >= $1 AND ret.created_at < $2` + retWhere + `
		)
		SELECT live_agg.session_count, live_agg.views, live_agg.uv, live_agg.active, live_agg.awt_seconds,
		       live_agg.pcu, live_agg.acu, live_agg.follows, live_agg.chats, live_agg.shares, live_agg.likes,
		       sales_agg.qty, sales_agg.ord, sales_agg.gmv, return_agg.ret_qty, return_agg.ret_amount
		FROM live_agg, sales_agg, return_agg`

	args := append([]interface{}{from, to}, locArgs...)
	var row aggregateRow
	var sessionCount int
	err := h.DB.QueryRow(r.Context(), query, args...).Scan(&sessionCount, &row.Views, &row.UV, &row.Active, &row.AWTSeconds,
		&row.PCU, &row.ACU, &row.Follows, &row.Chats, &row.Shares, &row.Likes, &row.Qty, &row.Ord, &row.GMV, &row.Ret, &row.RetAmount)
	if err != nil {
		return row, 0, err
	}
	fillCalculated(&row)
	return row, sessionCount, nil
}

type lifetimeResponse struct {
	Total        aggregateRow `json:"total"`
	AvgLive      aggregateRow `json:"avg_live"`
	SessionCount int          `json:"session_count"`
}

// Lifetime returns the complete historical performance for the selected Location/Host - not
// affected by the Period filter.
func (h *HostAnalyticsHandler) Lifetime(w http.ResponseWriter, r *http.Request) {
	total, sessionCount, err := h.aggregate(r, time.Unix(0, 0), time.Now().Add(24*time.Hour))
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch lifetime performance")
		return
	}
	avg := total
	if sessionCount > 0 {
		avg.Ord = 0
		divInt := func(v *int) *int {
			if v == nil {
				return nil
			}
			d := *v / sessionCount
			return &d
		}
		avgViews, avgUV, avgActive := divInt(total.Views), divInt(total.UV), divInt(total.Active)
		avgFollows, avgChats, avgShares, avgLikes := divInt(total.Follows), divInt(total.Chats), divInt(total.Shares), divInt(total.Likes)
		avg.Views, avg.UV, avg.Active = avgViews, avgUV, avgActive
		avg.Follows, avg.Chats, avg.Shares, avg.Likes = avgFollows, avgChats, avgShares, avgLikes
		avgQty := total.Qty / sessionCount
		avgGMV := total.GMV / float64(sessionCount)
		avg.Qty, avg.GMV = avgQty, avgGMV
		avgOrdF := float64(total.Ord) / float64(sessionCount)
		avg.Ord = int(avgOrdF)
		// AWT/ACU/PCU stay as-is (already an average / a max, not summed) - only Sum-method
		// metrics get divided by session count for the AVG/LIVE row.
		avg.AOV, avg.RetPct, avg.GPM, avg.NGR = nil, nil, nil, 0
		avg.Ret, avg.RetAmount = 0, 0
	}
	respondJSON(w, http.StatusOK, lifetimeResponse{Total: total, AvgLive: avg, SessionCount: sessionCount})
}

type summaryResponse struct {
	aggregateRow
	AvgQty      *float64 `json:"avg_qty"`
	AvgOrd      *float64 `json:"avg_ord"`
	AvgGMV      *float64 `json:"avg_gmv"`
	AvgChats    *float64 `json:"avg_chats"`
	OrdCVR      *float64 `json:"ord_cvr"`
	ItemsPerOrd *float64 `json:"items_per_order"`
	GMVPerUV    *float64 `json:"gmv_per_uv"`
}

// Summary returns Row 1 (Key Performance) + Row 2 (Efficiency) for the selected Location/Host
// and Period.
func (h *HostAnalyticsHandler) Summary(w http.ResponseWriter, r *http.Request) {
	from, to, filtered := dateRange(r)
	if !filtered {
		to = time.Now()
		from = to.AddDate(0, 0, -30)
	}
	row, sessionCount, err := h.aggregate(r, from, to)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch summary")
		return
	}
	res := summaryResponse{aggregateRow: row}
	if sessionCount > 0 {
		avgQty := float64(row.Qty) / float64(sessionCount)
		avgOrd := float64(row.Ord) / float64(sessionCount)
		avgGMV := row.GMV / float64(sessionCount)
		res.AvgQty, res.AvgOrd, res.AvgGMV = &avgQty, &avgOrd, &avgGMV
		if row.Chats != nil {
			avgChats := float64(*row.Chats) / float64(sessionCount)
			res.AvgChats = &avgChats
		}
	}
	if row.UV != nil && *row.UV > 0 {
		cvr := float64(row.Ord) / float64(*row.UV) * 100
		gmvPerUV := row.GMV / float64(*row.UV)
		res.OrdCVR, res.GMVPerUV = &cvr, &gmvPerUV
	}
	if row.Ord > 0 {
		ipo := float64(row.Qty) / float64(row.Ord)
		res.ItemsPerOrd = &ipo
	}
	respondJSON(w, http.StatusOK, res)
}

type historicalBestMetric struct {
	Value *float64 `json:"value"`
	Date  string   `json:"date"`
	Shift *string  `json:"shift"`
}

type historicalBestResponse struct {
	HighestQty   historicalBestMetric `json:"highest_qty"`
	HighestOrd   historicalBestMetric `json:"highest_ord"`
	HighestGMV   historicalBestMetric `json:"highest_gmv"`
	HighestViews historicalBestMetric `json:"highest_views"`
	HighestPCU   historicalBestMetric `json:"highest_pcu"`
	HighestAWT   historicalBestMetric `json:"highest_awt"`
	HighestGPM   historicalBestMetric `json:"highest_gpm"`
}

// HistoricalBest returns the highest value ever achieved in a single LIVE Session, for the
// selected Location/Host - not affected by the Period filter.
func (h *HostAnalyticsHandler) HistoricalBest(w http.ResponseWriter, r *http.Request) {
	locWhere, locArgs := hostFilter(r, "ls", 1)
	query := `
		SELECT ls.started_at, h.shift, ls.views, ls.pcu, ls.awt_seconds,
		       COALESCE((SELECT SUM(oi.qty) FROM order_items oi WHERE oi.live_session_id = ls.id), 0),
		       COALESCE((SELECT COUNT(DISTINCT oi.order_id) FROM order_items oi JOIN orders o ON o.id = oi.order_id
		                 WHERE oi.live_session_id = ls.id AND o.status NOT IN ('cancelled','return')), 0),
		       COALESCE((SELECT SUM(oi.qty * oi.price_at_order) FROM order_items oi JOIN orders o ON o.id = oi.order_id
		                 WHERE oi.live_session_id = ls.id AND o.status NOT IN ('cancelled','return')), 0)
		FROM live_sessions ls
		JOIN hosts h ON h.id = ls.host_id
		WHERE ls.live_data_recorded_at IS NOT NULL` + locWhere

	rows, err := h.DB.Query(r.Context(), query, locArgs...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch historical best")
		return
	}
	defer rows.Close()

	var res historicalBestResponse
	track := func(best *historicalBestMetric, value float64, date time.Time, shift *string) {
		if best.Value == nil || value > *best.Value {
			v := value
			best.Value = &v
			best.Date = date.Format("2006-01-02")
			best.Shift = shift
		}
	}

	for rows.Next() {
		var startedAt time.Time
		var shift *string
		var views, pcu, awtSeconds, qty, ord int
		var gmv float64
		if err := rows.Scan(&startedAt, &shift, &views, &pcu, &awtSeconds, &qty, &ord, &gmv); err != nil {
			continue
		}
		track(&res.HighestQty, float64(qty), startedAt, shift)
		track(&res.HighestOrd, float64(ord), startedAt, shift)
		track(&res.HighestGMV, gmv, startedAt, shift)
		track(&res.HighestViews, float64(views), startedAt, shift)
		track(&res.HighestPCU, float64(pcu), startedAt, shift)
		track(&res.HighestAWT, float64(awtSeconds), startedAt, shift)
		if views > 0 {
			track(&res.HighestGPM, gmv/float64(views)*1000, startedAt, shift)
		}
	}
	respondJSON(w, http.StatusOK, res)
}

type dailyRow struct {
	Date string `json:"date"`
	aggregateRow
}

// PerformanceData returns one row per calendar date (Asia/Jakarta) with valid LIVE Data, newest
// first, paginated at 50 rows/page. Host=ALL (no ?host_id=) aggregates every host in the
// selected Location into one row per date.
func (h *HostAnalyticsHandler) PerformanceData(w http.ResponseWriter, r *http.Request) {
	from, to, filtered := dateRange(r)
	if !filtered {
		from, to = time.Unix(0, 0), time.Now().Add(24*time.Hour)
	}
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}
	const pageSize = 50

	liveWhere, liveArgs := hostFilter(r, "ls", 3)
	salesWhere, _ := hostFilter(r, "oi", 3)
	retWhere, _ := hostFilter(r, "ret", 3)

	query := `
		WITH live_daily AS (
			SELECT DATE(ls.started_at AT TIME ZONE 'Asia/Jakarta') d,
			       SUM(ls.views) views, SUM(ls.uv) uv, SUM(ls.active_viewers) active,
			       CASE WHEN SUM(ls.uv) > 0 THEN SUM(ls.awt_seconds::numeric * ls.uv) / SUM(ls.uv) END awt_seconds,
			       MAX(ls.pcu) pcu,
			       CASE WHEN SUM(EXTRACT(EPOCH FROM (ls.ended_at - ls.started_at))) > 0
			            THEN SUM(ls.acu * EXTRACT(EPOCH FROM (ls.ended_at - ls.started_at)))
			                 / SUM(EXTRACT(EPOCH FROM (ls.ended_at - ls.started_at))) END acu,
			       SUM(ls.follows) follows, SUM(ls.chats) chats, SUM(ls.shares) shares, SUM(ls.likes) likes
			FROM live_sessions ls
			JOIN hosts h ON h.id = ls.host_id
			WHERE ls.live_data_recorded_at IS NOT NULL
			  AND ls.started_at >= $1 AND ls.started_at < $2` + liveWhere + `
			GROUP BY d
		),
		sales_daily AS (
			SELECT DATE(o.created_at AT TIME ZONE 'Asia/Jakarta') d,
			       COALESCE(SUM(oi.qty),0) qty, COUNT(DISTINCT oi.order_id) ord, COALESCE(SUM(oi.qty*oi.price_at_order),0) gmv
			FROM order_items oi
			JOIN orders o ON o.id = oi.order_id
			JOIN hosts h ON h.id = oi.host_id
			WHERE o.status NOT IN ('cancelled','return')
			  AND o.created_at >= $1 AND o.created_at < $2` + salesWhere + `
			GROUP BY d
		),
		return_daily AS (
			SELECT DATE(ret.created_at AT TIME ZONE 'Asia/Jakarta') d,
			       COALESCE(SUM(ret.qty),0) ret_qty, COALESCE(SUM(ret.amount),0) ret_amount
			FROM returns ret
			JOIN hosts h ON h.id = ret.host_id
			WHERE ret.created_at >= $1 AND ret.created_at < $2` + retWhere + `
			GROUP BY d
		)
		SELECT ld.d, ld.views, ld.uv, ld.active, ld.awt_seconds, ld.pcu, ld.acu, ld.follows, ld.chats, ld.shares, ld.likes,
		       COALESCE(sd.ord,0), COALESCE(sd.qty,0), COALESCE(sd.gmv,0),
		       COALESCE(rd.ret_qty,0), COALESCE(rd.ret_amount,0)
		FROM live_daily ld
		LEFT JOIN sales_daily sd ON sd.d = ld.d
		LEFT JOIN return_daily rd ON rd.d = ld.d
		ORDER BY ld.d DESC
		LIMIT $` + strconv.Itoa(len(liveArgs)+3) + ` OFFSET $` + strconv.Itoa(len(liveArgs)+4)

	args := append([]interface{}{from, to}, liveArgs...)
	args = append(args, pageSize, (page-1)*pageSize)

	rows, err := h.DB.Query(r.Context(), query, args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch performance data")
		return
	}
	defer rows.Close()

	list := []dailyRow{}
	for rows.Next() {
		var d time.Time
		var row aggregateRow
		if err := rows.Scan(&d, &row.Views, &row.UV, &row.Active, &row.AWTSeconds, &row.PCU, &row.ACU,
			&row.Follows, &row.Chats, &row.Shares, &row.Likes, &row.Ord, &row.Qty, &row.GMV, &row.Ret, &row.RetAmount); err != nil {
			continue
		}
		fillCalculated(&row)
		list = append(list, dailyRow{Date: d.Format("2006-01-02"), aggregateRow: row})
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"rows": list, "page": page, "page_size": pageSize})
}
