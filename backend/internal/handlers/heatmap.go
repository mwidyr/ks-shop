package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// HeatmapHandler powers Heatmap (item #007, phase 3 of 3): a 30-minute-interval view of when
// each host generates sales. Unlike Performance Dashboard/Host Analytics, this is driven purely
// by real orders (Order Management), not "valid LIVE Session" status - every Active host
// assigned to the selected Location is shown, even with zero sales in the period, per spec.
//
// Slots: 35 fixed 30-minute intervals, 06:00 through 23:00 (each slot's start time; the last
// slot covers 23:00-23:30), matching the client's own operational sheet exactly. They group into
// 6 Time Blocks of 5 consecutive slots each, with one "break" slot skipped between every pair of
// blocks (08:30, 11:30, 14:30, 17:30, 20:30) - those slots still show in the grid, just aren't
// counted in any Time Block Total. Verified against the block boundaries in the spec (06:00-
// 08:30, 09:00-11:30, ...): 6*5 + 5 gaps = 35, matching exactly.
type HeatmapHandler struct {
	DB *pgxpool.Pool
}

const numSlots = 35

// slotBounds returns [startHour, startMinute] for slot i (0-indexed).
func slotBounds(i int) (hour, minute int) {
	return 6 + i/2, (i % 2) * 30
}

// timeBlockSlots maps each of the 6 Time Blocks to its 5 slot indices (see doc comment above).
var timeBlockSlots = [6][5]int{
	{0, 1, 2, 3, 4},      // 06:00-08:30
	{6, 7, 8, 9, 10},     // 09:00-11:30
	{12, 13, 14, 15, 16}, // 12:00-14:30
	{18, 19, 20, 21, 22}, // 15:00-17:30
	{24, 25, 26, 27, 28}, // 18:00-20:30
	{30, 31, 32, 33, 34}, // 21:00-23:30
}

type heatmapSummary struct {
	Qty int     `json:"qty"`
	Ord int     `json:"ord"`
	GMV float64 `json:"gmv"`
}

// activeHostsFilter builds "AND h.is_active = true [AND h.location_id = $N]", the host set every
// Heatmap endpoint uses (active hosts in the location, regardless of LIVE Data status).
func activeHostsFilter(r *http.Request, startArg int) (whereSQL string, args []interface{}) {
	whereSQL = " AND h.is_active = true"
	if locID := r.URL.Query().Get("location_id"); locID != "" {
		if id, err := strconv.Atoi(locID); err == nil {
			args = append(args, id)
			whereSQL += " AND h.location_id = $" + strconv.Itoa(startArg)
		}
	}
	return whereSQL, args
}

// Summary returns Total QTY/ORD/GMV across active hosts in the selected Location and Period.
func (h *HeatmapHandler) Summary(w http.ResponseWriter, r *http.Request) {
	from, to := resolveRange(r)
	hostsWhere, hostArgs := activeHostsFilter(r, 3)
	query := `
		SELECT COALESCE(SUM(oi.qty),0), COUNT(DISTINCT oi.order_id), COALESCE(SUM(oi.qty*oi.price_at_order),0)
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		JOIN hosts h ON h.id = oi.host_id
		WHERE o.status NOT IN ('cancelled','return')
		  AND o.created_at >= $1 AND o.created_at < $2` + hostsWhere

	args := append([]interface{}{from, to}, hostArgs...)
	var res heatmapSummary
	if err := h.DB.QueryRow(r.Context(), query, args...).Scan(&res.Qty, &res.Ord, &res.GMV); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch heatmap summary")
		return
	}
	respondJSON(w, http.StatusOK, res)
}

type heatmapHostRow struct {
	HostID   int           `json:"host_id"`
	HostName string        `json:"host_name"`
	Shift    *string       `json:"shift"`
	TotalQty int           `json:"total_qty"`
	Slots    [numSlots]int `json:"slots"`
}

type heatmapGridResponse struct {
	Hosts      []heatmapHostRow   `json:"hosts"`
	AllRow     [numSlots]int      `json:"all_row"`
	AvgRow     [numSlots]*float64 `json:"avg_row"`
	TimeBlocks [6]int             `json:"time_blocks"`
}

// slotIndexExpr is the shared SQL fragment turning an order's created_at (Asia/Jakarta) into a
// 0-based slot index; NULL for anything outside 06:00-23:30 (the grid's fixed window).
const slotIndexExpr = `
	(EXTRACT(HOUR FROM (o.created_at AT TIME ZONE 'Asia/Jakarta')) - 6) * 2
	+ FLOOR(EXTRACT(MINUTE FROM (o.created_at AT TIME ZONE 'Asia/Jakarta')) / 30)`

// Grid returns every active host in the Location (even with zero sales), grouped by Shift
// (Morning -> Middle -> Evening -> unassigned), each with its 35 half-hour QTY buckets, plus the
// ALL row (total across hosts per slot), the AVG row (monthly per-slot benchmark), and the 6
// Time Block totals.
func (h *HeatmapHandler) Grid(w http.ResponseWriter, r *http.Request) {
	from, to := resolveRange(r)
	hostsWhere, hostArgs := activeHostsFilter(r, 3)

	hostRows, err := h.DB.Query(r.Context(), `
		SELECT h.id, h.name, h.shift
		FROM hosts h
		WHERE 1=1`+hostsWhere+`
		ORDER BY CASE h.shift WHEN 'morning' THEN 0 WHEN 'middle' THEN 1 WHEN 'evening' THEN 2 ELSE 3 END, h.name`,
		hostArgs...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch hosts")
		return
	}
	hosts := []heatmapHostRow{}
	hostIndex := map[int]int{}
	for hostRows.Next() {
		var hr heatmapHostRow
		if err := hostRows.Scan(&hr.HostID, &hr.HostName, &hr.Shift); err != nil {
			continue
		}
		hostIndex[hr.HostID] = len(hosts)
		hosts = append(hosts, hr)
	}
	hostRows.Close()

	slotQuery := `
		SELECT oi.host_id, ` + slotIndexExpr + ` AS slot, SUM(oi.qty)
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		JOIN hosts h ON h.id = oi.host_id
		WHERE o.status NOT IN ('cancelled','return')
		  AND o.created_at >= $1 AND o.created_at < $2` + hostsWhere + `
		GROUP BY oi.host_id, slot
		HAVING ` + slotIndexExpr + ` BETWEEN 0 AND ` + strconv.Itoa(numSlots-1)

	args := append([]interface{}{from, to}, hostArgs...)
	slotRows, err := h.DB.Query(r.Context(), slotQuery, args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch heatmap grid")
		return
	}
	var allRow [numSlots]int
	for slotRows.Next() {
		var hostID, slot, qty int
		if err := slotRows.Scan(&hostID, &slot, &qty); err != nil {
			continue
		}
		if idx, ok := hostIndex[hostID]; ok && slot >= 0 && slot < numSlots {
			hosts[idx].Slots[slot] = qty
			hosts[idx].TotalQty += qty
			allRow[slot] += qty
		}
	}
	slotRows.Close()

	// AVG row: this calendar month's per-slot QTY (across the same active-host set) divided by
	// its count of "valid operating days" (days with at least one order for these hosts) -
	// spec's "monthly benchmark", independent of the selected Period.
	now := time.Now()
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	monthEnd := to
	if monthEnd.Before(monthStart) {
		monthEnd = monthStart
	}
	avgQuery := `
		SELECT ` + slotIndexExpr + ` AS slot, SUM(oi.qty), COUNT(DISTINCT DATE(o.created_at AT TIME ZONE 'Asia/Jakarta'))
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		JOIN hosts h ON h.id = oi.host_id
		WHERE o.status NOT IN ('cancelled','return')
		  AND o.created_at >= $1 AND o.created_at < $2` + hostsWhere + `
		GROUP BY slot
		HAVING ` + slotIndexExpr + ` BETWEEN 0 AND ` + strconv.Itoa(numSlots-1)
	avgArgs := append([]interface{}{monthStart, monthEnd}, hostArgs...)

	var avgRow [numSlots]*float64
	daysQuery := `
		SELECT COUNT(DISTINCT DATE(o.created_at AT TIME ZONE 'Asia/Jakarta'))
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		JOIN hosts h ON h.id = oi.host_id
		WHERE o.status NOT IN ('cancelled','return')
		  AND o.created_at >= $1 AND o.created_at < $2` + hostsWhere
	var validDays int
	h.DB.QueryRow(r.Context(), daysQuery, avgArgs...).Scan(&validDays)

	if validDays > 0 {
		avgRows, err := h.DB.Query(r.Context(), avgQuery, avgArgs...)
		if err == nil {
			for avgRows.Next() {
				var slot, qty, _days int
				if err := avgRows.Scan(&slot, &qty, &_days); err != nil {
					continue
				}
				if slot >= 0 && slot < numSlots {
					v := float64(qty) / float64(validDays)
					avgRow[slot] = &v
				}
			}
			avgRows.Close()
		}
	}

	var blocks [6]int
	for b, slots := range timeBlockSlots {
		for _, s := range slots {
			blocks[b] += allRow[s]
		}
	}

	respondJSON(w, http.StatusOK, heatmapGridResponse{Hosts: hosts, AllRow: allRow, AvgRow: avgRow, TimeBlocks: blocks})
}

type heatmapCellDetail struct {
	Qty    int                `json:"qty"`
	Ord    int                `json:"ord"`
	GMV    float64            `json:"gmv"`
	AOV    *float64           `json:"aov"`
	Dates  []heatmapCellDate  `json:"dates"`
	Orders []heatmapCellOrder `json:"orders"`
}

type heatmapCellDate struct {
	Date string  `json:"date"`
	Qty  int     `json:"qty"`
	Ord  int     `json:"ord"`
	GMV  float64 `json:"gmv"`
}

type heatmapCellOrder struct {
	ID        int       `json:"id"`
	OrderNo   string    `json:"order_no"`
	CreatedAt time.Time `json:"created_at"`
	Qty       int       `json:"qty"`
	GMV       float64   `json:"gmv"`
}

// CellDetail returns QTY/ORD/GMV/AOV for one host x slot within the selected Period, plus a
// per-date breakdown when the period spans more than one day (the frontend skips rendering the
// date table for a single-day period, per spec).
func (h *HeatmapHandler) CellDetail(w http.ResponseWriter, r *http.Request) {
	hostID, err := strconv.Atoi(r.URL.Query().Get("host_id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "host_id is required")
		return
	}
	slot, err := strconv.Atoi(r.URL.Query().Get("slot"))
	if err != nil || slot < 0 || slot >= numSlots {
		respondError(w, http.StatusBadRequest, "invalid slot")
		return
	}
	from, to := resolveRange(r)

	summaryQuery := `
		SELECT COALESCE(SUM(oi.qty),0), COUNT(DISTINCT oi.order_id), COALESCE(SUM(oi.qty*oi.price_at_order),0)
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		WHERE oi.host_id = $1 AND o.status NOT IN ('cancelled','return')
		  AND o.created_at >= $2 AND o.created_at < $3
		  AND ` + slotIndexExpr + ` = $4`

	var res heatmapCellDetail
	if err := h.DB.QueryRow(r.Context(), summaryQuery, hostID, from, to, slot).Scan(&res.Qty, &res.Ord, &res.GMV); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch cell detail")
		return
	}
	if res.Ord > 0 {
		aov := res.GMV / float64(res.Ord)
		res.AOV = &aov
	}

	dateQuery := `
		SELECT DATE(o.created_at AT TIME ZONE 'Asia/Jakarta'), COALESCE(SUM(oi.qty),0), COUNT(DISTINCT oi.order_id), COALESCE(SUM(oi.qty*oi.price_at_order),0)
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		WHERE oi.host_id = $1 AND o.status NOT IN ('cancelled','return')
		  AND o.created_at >= $2 AND o.created_at < $3
		  AND ` + slotIndexExpr + ` = $4
		GROUP BY 1 ORDER BY 1 DESC`
	rows, err := h.DB.Query(r.Context(), dateQuery, hostID, from, to, slot)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var d time.Time
			var dr heatmapCellDate
			if err := rows.Scan(&d, &dr.Qty, &dr.Ord, &dr.GMV); err != nil {
				continue
			}
			dr.Date = d.Format("2006-01-02")
			res.Dates = append(res.Dates, dr)
		}
	}

	orderQuery := `
		SELECT o.id, o.order_no, o.created_at, COALESCE(SUM(oi.qty),0), COALESCE(SUM(oi.qty*oi.price_at_order),0)
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		WHERE oi.host_id = $1 AND o.status NOT IN ('cancelled','return')
		  AND o.created_at >= $2 AND o.created_at < $3
		  AND ` + slotIndexExpr + ` = $4
		GROUP BY o.id, o.order_no, o.created_at
		ORDER BY o.created_at DESC`
	orderRows, err := h.DB.Query(r.Context(), orderQuery, hostID, from, to, slot)
	if err == nil {
		defer orderRows.Close()
		for orderRows.Next() {
			var or heatmapCellOrder
			if err := orderRows.Scan(&or.ID, &or.OrderNo, &or.CreatedAt, &or.Qty, &or.GMV); err != nil {
				continue
			}
			res.Orders = append(res.Orders, or)
		}
	}

	respondJSON(w, http.StatusOK, res)
}
