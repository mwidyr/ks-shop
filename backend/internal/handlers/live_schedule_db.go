package handlers

import (
	"context"
	"sort"
	"time"
)

// hostLive is one host's schedule inputs (what the engine needs plus what the admin table shows).
type hostLive struct {
	HostID     int
	Shift      string
	LocationID int
	URL        string
	Rule       liveRule
	Ended      map[int64]bool
	// ManualUntil: end of the running manual "Start LIVE" session, nil when there is none.
	ManualUntil *time.Time
}

// stateAt is the host's status now: the schedule, an ended window and a manual session combined.
func (x *hostLive) stateAt(now time.Time) liveState {
	return liveStateManual(now, x.Rule, x.Ended, x.ManualUntil)
}

// loadShiftRanges reads the default hours of every shift.
func loadShiftRanges(ctx context.Context, db queryer) map[string][]liveRange {
	out := map[string][]liveRange{}
	rows, err := db.Query(ctx, `SELECT shift, ranges::text FROM live_shift_hours`)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var shift, raw string
		if rows.Scan(&shift, &raw) != nil {
			continue
		}
		if rs, err := parseLiveRanges([]byte(raw)); err == nil {
			out[shift] = rs
		}
	}
	return out
}

// loadHostLive builds the schedule rule of each host (nil/empty ids = none). Hosts without a shift get
// an empty rule, i.e. they are never LIVE and have no next session.
func loadHostLive(ctx context.Context, db queryer, hostIDs []int32) map[int]*hostLive {
	out := map[int]*hostLive{}
	if len(hostIDs) == 0 {
		return out
	}
	shifts := loadShiftRanges(ctx, db)
	var locIDs []int32
	seenLoc := map[int]bool{}
	if rows, err := db.Query(ctx, `SELECT id, COALESCE(shift,''), location_id, COALESCE(live_url,'') FROM hosts WHERE id = ANY($1)`, hostIDs); err == nil {
		for rows.Next() {
			x := &hostLive{Ended: map[int64]bool{}}
			if rows.Scan(&x.HostID, &x.Shift, &x.LocationID, &x.URL) != nil {
				continue
			}
			x.Rule = liveRule{Ranges: shifts[x.Shift], DaysOff: map[string]bool{}}
			out[x.HostID] = x
			if !seenLoc[x.LocationID] {
				seenLoc[x.LocationID] = true
				locIDs = append(locIDs, int32(x.LocationID))
			}
		}
		rows.Close()
	}
	days := map[int][7]bool{}
	if rows, err := db.Query(ctx, `SELECT id, work_days FROM host_locations WHERE id = ANY($1)`, locIDs); err == nil {
		for rows.Next() {
			var id int
			var wd []int16
			if rows.Scan(&id, &wd) != nil {
				continue
			}
			var set [7]bool
			for _, d := range wd {
				if d >= 0 && d <= 6 {
					set[d] = true
				}
			}
			days[id] = set
		}
		rows.Close()
	}
	off := map[int]map[string]bool{}
	if rows, err := db.Query(ctx, `SELECT location_id, to_char(off_date,'YYYY-MM-DD') FROM location_days_off WHERE location_id = ANY($1) AND off_date >= current_date - 2`, locIDs); err == nil {
		for rows.Next() {
			var id int
			var d string
			if rows.Scan(&id, &d) == nil {
				if off[id] == nil {
					off[id] = map[string]bool{}
				}
				off[id][d] = true
			}
		}
		rows.Close()
	}
	for _, x := range out {
		x.Rule.WorkDays = days[x.LocationID]
		if m := off[x.LocationID]; m != nil {
			x.Rule.DaysOff = m
		}
	}
	if rows, err := db.Query(ctx, `SELECT host_id, window_start FROM host_live_ends WHERE host_id = ANY($1) AND window_start >= now() - interval '2 days'`, hostIDs); err == nil {
		for rows.Next() {
			var id int
			var at time.Time
			if rows.Scan(&id, &at) == nil && out[id] != nil {
				out[id].Ended[at.Unix()] = true
			}
		}
		rows.Close()
	}
	if rows, err := db.Query(ctx, `SELECT host_id, MAX(expires_at) FROM host_live_manual WHERE host_id = ANY($1) AND ended_at IS NULL AND expires_at > now() GROUP BY host_id`, hostIDs); err == nil {
		for rows.Next() {
			var id int
			var until time.Time
			if rows.Scan(&id, &until) == nil && out[id] != nil {
				u := until
				out[id].ManualUntil = &u
			}
		}
		rows.Close()
	}
	return out
}

// applyLiveSchedule replaces the hand-typed status of website host cards with the scheduled one:
// status, next session and the watch link (the host's saved LIVE URL, nothing else). Cards keep their
// JSON shape, so every page that shows a host keeps working. Live hosts sort first.
func (h *SiteHandler) applyLiveSchedule(ctx context.Context, cards []siteHostCard, now time.Time) {
	if len(cards) == 0 {
		return
	}
	ids := make([]int32, len(cards))
	for i, c := range cards {
		ids[i] = int32(c.ID)
	}
	info := loadHostLive(ctx, h.DB, ids)
	for i := range cards {
		c := &cards[i]
		x := info[c.ID]
		c.LiveTitle, c.NextLiveTitle, c.ViewerCount, c.HasReplay, c.NextLiveAt = "", "", nil, false, nil
		c.LiveStatus, c.WatchURL = "offline", ""
		if x == nil {
			continue
		}
		c.WatchURL = x.URL
		st := x.stateAt(now)
		c.LiveStatus = st.Status
		if st.Next != nil {
			s := st.Next.Start.Format(time.RFC3339)
			c.NextLiveAt = &s
		}
	}
	sort.SliceStable(cards, func(i, j int) bool { return (cards[i].LiveStatus == "live") && (cards[j].LiveStatus != "live") })
}
