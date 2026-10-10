package handlers

import (
	"net/http"
	"sort"
	"strconv"
	"time"
)

// Sales Distribution Heatmap (Performance History): for every host AT every location, how many of
// their LIVE days fell into each daily-QTY range. Only LIVE days count (a day with a recorded
// LIVE session at that location; zero-sales live days land in the "0" bucket, days without LIVE
// are ignored).

// salesBucketLabels are the daily QTY ranges, in column order.
var salesBucketLabels = []string{"0", "1-5", "6-9", "10-19", "20-29", "30-39", "40-49", "50-59", "60-69", "70-79", "80-89", "90-99", "100+"}

func salesBucketIndex(qty int) int {
	switch {
	case qty <= 0:
		return 0
	case qty <= 5:
		return 1
	case qty <= 9:
		return 2
	case qty >= 100:
		return 12
	}
	return qty/10 + 2 // 10-19 -> 3 ... 90-99 -> 11
}

type salesDistributionRow struct {
	HostID       int     `json:"host_id"`
	HostName     string  `json:"host_name"`
	LocationID   *int    `json:"location_id"`
	LocationName string  `json:"location_name"`
	LiveDays     int     `json:"live_days"`
	TotalQty     int     `json:"total_qty"`
	TotalGMV     float64 `json:"total_gmv"`
	AvgQty       float64 `json:"avg_qty"`
	AvgGMV       float64 `json:"avg_gmv"`
	SharePct     float64 `json:"share_pct"`
	Rank         int     `json:"rank"`
	Buckets      []int   `json:"buckets"`
}

// SalesDistribution serves GET /host-analytics/sales-distribution?from&to[&location_id][&host_id].
func (h *HostAnalyticsHandler) SalesDistribution(w http.ResponseWriter, r *http.Request) {
	from, to, filtered := dateRange(r)
	if !filtered {
		to = time.Now()
		from = to.AddDate(0, 0, -30)
	}
	args := []interface{}{from, to}
	filter := ""
	if locID, err := strconv.Atoi(r.URL.Query().Get("location_id")); err == nil {
		args = append(args, locID)
		filter += " AND COALESCE(ls.location_id, h.location_id) = $" + strconv.Itoa(len(args))
	}
	if hostID, err := strconv.Atoi(r.URL.Query().Get("host_id")); err == nil {
		args = append(args, hostID)
		filter += " AND ls.host_id = $" + strconv.Itoa(len(args))
	}

	// live_days: one row per (host, location, Jakarta day) with a recorded LIVE session.
	// day_sales: that host's sales on that day attributed to the location of the LIVE session the
	// order item was sold in (falling back to the host's own location).
	rows, err := h.DB.Query(r.Context(), `
		WITH live_days AS (
			SELECT DISTINCT ls.host_id, COALESCE(ls.location_id, h.location_id) AS location_id,
			       (ls.started_at AT TIME ZONE 'Asia/Jakarta')::date AS d
			FROM live_sessions ls
			JOIN hosts h ON h.id = ls.host_id
			WHERE ls.live_data_recorded_at IS NOT NULL
			  AND ls.started_at >= $1 AND ls.started_at < $2`+filter+`
		),
		day_sales AS (
			SELECT oi.host_id, COALESCE(ls.location_id, h.location_id) AS location_id,
			       (o.created_at AT TIME ZONE 'Asia/Jakarta')::date AS d,
			       SUM(oi.qty) AS qty, SUM(oi.qty * oi.price_at_order) AS gmv
			FROM order_items oi
			JOIN orders o ON o.id = oi.order_id
			JOIN hosts h ON h.id = oi.host_id
			LEFT JOIN live_sessions ls ON ls.id = oi.live_session_id
			WHERE o.sales_channel = 'live' AND o.status NOT IN ('cancelled','return')
			  AND o.created_at >= $1 AND o.created_at < $2
			GROUP BY 1, 2, 3
		)
		SELECT ld.host_id, h.name, ld.location_id, COALESCE(hl.name, ''), ld.d::text,
		       COALESCE(ds.qty, 0), COALESCE(ds.gmv, 0)
		FROM live_days ld
		JOIN hosts h ON h.id = ld.host_id
		LEFT JOIN host_locations hl ON hl.id = ld.location_id
		LEFT JOIN day_sales ds ON ds.host_id = ld.host_id
		     AND ds.location_id IS NOT DISTINCT FROM ld.location_id AND ds.d = ld.d`, args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch sales distribution")
		return
	}
	defer rows.Close()

	type key struct {
		host int
		loc  int // 0 = no location
	}
	byKey := map[key]*salesDistributionRow{}
	var order []key
	for rows.Next() {
		var hostID int
		var hostName, locName, day string
		var locID *int
		var qty int
		var gmv float64
		if rows.Scan(&hostID, &hostName, &locID, &locName, &day, &qty, &gmv) != nil {
			continue
		}
		k := key{host: hostID}
		if locID != nil {
			k.loc = *locID
		}
		row := byKey[k]
		if row == nil {
			row = &salesDistributionRow{HostID: hostID, HostName: hostName, LocationID: locID, LocationName: locName, Buckets: make([]int, len(salesBucketLabels))}
			byKey[k] = row
			order = append(order, k)
		}
		row.LiveDays++
		row.TotalQty += qty
		row.TotalGMV += gmv
		row.Buckets[salesBucketIndex(qty)]++
	}

	list := make([]salesDistributionRow, 0, len(order))
	totalGMV := 0.0
	for _, k := range order {
		row := *byKey[k]
		if row.LiveDays > 0 {
			row.AvgQty = float64(row.TotalQty) / float64(row.LiveDays)
			row.AvgGMV = row.TotalGMV / float64(row.LiveDays)
		}
		totalGMV += row.TotalGMV
		list = append(list, row)
	}
	sort.SliceStable(list, func(i, j int) bool {
		if list[i].TotalGMV != list[j].TotalGMV {
			return list[i].TotalGMV > list[j].TotalGMV
		}
		return list[i].HostName < list[j].HostName
	})
	for i := range list {
		if totalGMV > 0 {
			list[i].SharePct = list[i].TotalGMV / totalGMV * 100
		}
		list[i].Rank = i + 1
		if i > 0 && list[i].TotalGMV == list[i-1].TotalGMV {
			list[i].Rank = list[i-1].Rank // equal GMV shares the rank
		}
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"rows": list, "bucket_labels": salesBucketLabels})
}
