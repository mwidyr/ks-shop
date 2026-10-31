package telegram

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"time"
)

// Personal Best works on a host's LIVE windows. Shift hours are Taiwan time (UTC+8), like the website schedule.
var taipeiTZ = time.FixedZone("CST", 8*60*60)

const (
	personalBestDays  = 45               // how far back earlier LIVEs are compared
	personalBestGrace = 30 * time.Minute // a LIVE that just ended still counts for the final orders
	// salesLiveGap: a host's sales closer together than this belong to one LIVE. This is the fallback for a host
	// that is not inside a scheduled / manual window (no shift set, or a LIVE run outside its shift), so that
	// Personal Best still works for what really happened instead of staying silent.
	salesLiveGap = 90 * time.Minute
)

type liveWindow struct{ Start, End time.Time }

type liveHost struct {
	id       int
	name     string
	location string
	chat     string
	windows  []liveWindow // scheduled shift windows + manual sessions, oldest first
}

func clockMinutes(s string) (int, bool) {
	var h, m int
	if _, err := fmt.Sscanf(s, "%d:%d", &h, &m); err != nil || h < 0 || h > 24 || m < 0 || m > 59 {
		return 0, false
	}
	return h*60 + m, true
}

// shiftWindows lists the windows of one shift that START on each Taiwan day in [from, to], skipping days the
// Location does not work and its days off (same rules as the website schedule).
func shiftWindows(ranges [][]string, workDays [7]bool, daysOff map[string]bool, from, to time.Time) []liveWindow {
	var out []liveWindow
	day := time.Date(from.In(taipeiTZ).Year(), from.In(taipeiTZ).Month(), from.In(taipeiTZ).Day(), 0, 0, 0, 0, taipeiTZ)
	for ; !day.After(to); day = day.AddDate(0, 0, 1) {
		if !workDays[day.Weekday()] || daysOff[day.Format("2006-01-02")] {
			continue
		}
		for _, r := range ranges {
			if len(r) != 2 {
				continue
			}
			a, ok1 := clockMinutes(r[0])
			b, ok2 := clockMinutes(r[1])
			if !ok1 || !ok2 {
				continue
			}
			start := day.Add(time.Duration(a) * time.Minute)
			end := day.Add(time.Duration(b) * time.Minute)
			if b <= a {
				end = end.Add(24 * time.Hour)
			}
			out = append(out, liveWindow{start, end})
		}
	}
	return out
}

// currentWindow is the LIVE a host is in at `now` (or left less than personalBestGrace ago); the latest one wins.
func currentWindow(ws []liveWindow, now time.Time) (liveWindow, bool) {
	var best liveWindow
	found := false
	for _, w := range ws {
		if !now.Before(w.Start) && now.Before(w.End.Add(personalBestGrace)) && (!found || w.Start.After(best.Start)) {
			best, found = w, true
		}
	}
	return best, found
}

type sale struct {
	at  time.Time
	qty int
}

func qtyIn(sales []sale, from, to time.Time) int {
	total := 0
	for _, s := range sales {
		if !s.at.Before(from) && s.at.Before(to) {
			total += s.qty
		}
	}
	return total
}

// bestBefore is the highest QTY of any LIVE that started before `cur`.
func bestBefore(sales []sale, ws []liveWindow, cur liveWindow) int {
	best := 0
	for _, w := range ws {
		if !w.Start.Before(cur.Start) {
			continue
		}
		if q := qtyIn(sales, w.Start, w.End); q > best {
			best = q
		}
	}
	return best
}

// salesWindows groups sales into LIVEs: a new LIVE starts whenever the gap since the previous sale exceeds
// salesLiveGap. A window runs from its first sale to just after its last one.
func salesWindows(sales []sale) []liveWindow {
	sorted := append([]sale(nil), sales...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].at.Before(sorted[j].at) })
	var out []liveWindow
	for _, s := range sorted {
		if n := len(out); n > 0 && s.at.Sub(out[n-1].End) <= salesLiveGap {
			out[n-1].End = s.at.Add(time.Second)
			continue
		}
		out = append(out, liveWindow{s.at, s.at.Add(time.Second)})
	}
	return out
}

// personalBestState says which LIVE a host is in at `now` and how it compares with the earlier ones: the
// scheduled / manual windows first, else the cluster of recent sales. ok is false when the host is in no LIVE.
func personalBestState(scheduled []liveWindow, sales []sale, now time.Time) (cur liveWindow, curQty, prev int, ok bool) {
	all := scheduled
	cur, ok = currentWindow(scheduled, now)
	if !ok {
		all = append(append([]liveWindow(nil), scheduled...), salesWindows(sales)...)
		cur, ok = currentWindow(salesWindows(sales), now)
	}
	if !ok {
		return liveWindow{}, 0, 0, false
	}
	return cur, qtyIn(sales, cur.Start, now.Add(time.Minute)), bestBefore(sales, all, cur), true
}

func (n *Notifier) hostSales(ctx context.Context, hostID int, since time.Time) ([]sale, error) {
	rows, err := n.DB.Query(ctx, `
		SELECT o.created_at, oi.qty FROM order_items oi JOIN orders o ON o.id = oi.order_id
		WHERE oi.host_id = $1 AND `+validOrder+` AND o.created_at >= $2`, hostID, since)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []sale
	for rows.Next() {
		var s sale
		if rows.Scan(&s.at, &s.qty) == nil {
			out = append(out, s)
		}
	}
	return out, nil
}

// liveHosts loads every host with its scheduled / manual windows (empty for a host without a shift).
func (n *Notifier) liveHosts(ctx context.Context, now time.Time) ([]liveHost, error) {
	shifts := map[string][][]string{}
	if rows, err := n.DB.Query(ctx, `SELECT shift, ranges::text FROM live_shift_hours`); err == nil {
		for rows.Next() {
			var shift, raw string
			var pairs [][]string
			if rows.Scan(&shift, &raw) == nil && json.Unmarshal([]byte(raw), &pairs) == nil {
				shifts[shift] = pairs
			}
		}
		rows.Close()
	}
	since := now.AddDate(0, 0, -personalBestDays)
	daysOff := map[int]map[string]bool{}
	if rows, err := n.DB.Query(ctx, `SELECT location_id, to_char(off_date,'YYYY-MM-DD') FROM location_days_off WHERE off_date >= $1::date - 1`, since); err == nil {
		for rows.Next() {
			var id int
			var d string
			if rows.Scan(&id, &d) == nil {
				if daysOff[id] == nil {
					daysOff[id] = map[string]bool{}
				}
				daysOff[id][d] = true
			}
		}
		rows.Close()
	}
	manual := map[int][]liveWindow{}
	if rows, err := n.DB.Query(ctx, `SELECT host_id, started_at, LEAST(COALESCE(ended_at, expires_at), expires_at) FROM host_live_manual WHERE started_at >= $1`, since); err == nil {
		for rows.Next() {
			var id int
			var w liveWindow
			if rows.Scan(&id, &w.Start, &w.End) == nil && w.End.After(w.Start) {
				manual[id] = append(manual[id], w)
			}
		}
		rows.Close()
	}
	rows, err := n.DB.Query(ctx, `
		SELECT h.id, h.name, h.location_id, hl.name, COALESCE(hl.telegram_chat_id,''), COALESCE(h.shift,''), hl.work_days
		FROM hosts h JOIN host_locations hl ON hl.id = h.location_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []liveHost
	for rows.Next() {
		var h liveHost
		var locID int
		var shift string
		var wd []int16
		if rows.Scan(&h.id, &h.name, &locID, &h.location, &h.chat, &shift, &wd) != nil {
			continue
		}
		var set [7]bool
		for _, d := range wd {
			if d >= 0 && d <= 6 {
				set[d] = true
			}
		}
		h.windows = append(shiftWindows(shifts[shift], set, daysOff[locID], since, now), manual[h.id]...)
		sort.Slice(h.windows, func(i, j int) bool { return h.windows[i].Start.Before(h.windows[j].Start) })
		out = append(out, h) // a host without a window can still be in a LIVE by its sales (personalBestState)
	}
	return out, nil
}
