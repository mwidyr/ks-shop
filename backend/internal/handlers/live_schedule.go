package handlers

import (
	"encoding/json"
	"fmt"
	"sort"
	"time"
)

// LIVE schedule engine. The website never asks TikTok whether a host is live: a host is LIVE while one
// of its shift's time ranges is running on a working day of its location, unless staff pressed
// "End LIVE" for that window. Everything is calendar maths in Taiwan time (UTC+8, taipeiTZ).

const (
	liveLookaheadDays = 14
	liveShiftMorning  = "morning"
	liveShiftMiddle   = "middle" // shown as "Afternoon" in the UI
	liveShiftEvening  = "evening"
)

var liveShifts = []string{liveShiftMorning, liveShiftMiddle, liveShiftEvening}

// liveRange is a time of day span in minutes since midnight; End <= Start means it ends the next day.
type liveRange struct{ Start, End int }

// liveRule is everything the engine needs for one host.
type liveRule struct {
	Ranges   []liveRange
	WorkDays [7]bool         // index = time.Weekday (0 = Sunday)
	DaysOff  map[string]bool // "2006-01-02", the day a window STARTS on
}

type liveWindow struct{ Start, End time.Time }

func (w liveWindow) contains(t time.Time) bool { return !t.Before(w.Start) && t.Before(w.End) }

func parseClock(s string) (int, error) {
	var h, m int
	if _, err := fmt.Sscanf(s, "%d:%d", &h, &m); err != nil || h < 0 || h > 24 || m < 0 || m > 59 || (h == 24 && m != 0) || len(s) != 5 || s[2] != ':' {
		return 0, fmt.Errorf("invalid time %q (use HH:MM)", s)
	}
	return h*60 + m, nil
}

// parseLiveRanges reads the JSON stored in live_shift_hours.ranges: [["07:00","10:00"], ...].
func parseLiveRanges(raw []byte) ([]liveRange, error) {
	var pairs [][]string
	if len(raw) == 0 {
		return nil, nil
	}
	if err := json.Unmarshal(raw, &pairs); err != nil {
		return nil, err
	}
	return rangesFromPairs(pairs)
}

func rangesFromPairs(pairs [][]string) ([]liveRange, error) {
	out := make([]liveRange, 0, len(pairs))
	for _, p := range pairs {
		if len(p) != 2 {
			return nil, fmt.Errorf("each range needs a start and an end")
		}
		a, err := parseClock(p[0])
		if err != nil {
			return nil, err
		}
		b, err := parseClock(p[1])
		if err != nil {
			return nil, err
		}
		if a == b {
			return nil, fmt.Errorf("a range cannot start and end at the same time (%s)", p[0])
		}
		out = append(out, liveRange{a, b})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Start < out[j].Start })
	return out, nil
}

func clockString(min int) string { return fmt.Sprintf("%02d:%02d", (min/60)%24, min%60) }

// liveRangesToPairs is the inverse of rangesFromPairs, for API responses.
func liveRangesToPairs(rs []liveRange) [][]string {
	out := make([][]string, 0, len(rs))
	for _, r := range rs {
		out = append(out, []string{clockString(r.Start), clockString(r.End)})
	}
	return out
}

// windowsOn lists the windows that START on the Taiwan calendar day `day` (empty on a day off).
func (r liveRule) windowsOn(day time.Time) []liveWindow {
	day = time.Date(day.Year(), day.Month(), day.Day(), 0, 0, 0, 0, taipeiTZ)
	if !r.WorkDays[day.Weekday()] || r.DaysOff[day.Format("2006-01-02")] {
		return nil
	}
	out := make([]liveWindow, 0, len(r.Ranges))
	for _, g := range r.Ranges {
		start := day.Add(time.Duration(g.Start) * time.Minute)
		end := day.Add(time.Duration(g.End) * time.Minute)
		if g.End <= g.Start {
			end = end.Add(24 * time.Hour)
		}
		out = append(out, liveWindow{start, end})
	}
	return out
}

// current returns the window running at `now`, if any (yesterday's windows count: one may cross midnight).
func (r liveRule) current(now time.Time) (liveWindow, bool) {
	now = now.In(taipeiTZ)
	for _, d := range []int{-1, 0} {
		for _, w := range r.windowsOn(now.AddDate(0, 0, d)) {
			if w.contains(now) {
				return w, true
			}
		}
	}
	return liveWindow{}, false
}

// next returns the first window that starts after `now`, looking up to liveLookaheadDays ahead.
func (r liveRule) next(now time.Time) (liveWindow, bool) {
	now = now.In(taipeiTZ)
	for d := 0; d <= liveLookaheadDays; d++ {
		for _, w := range r.windowsOn(now.AddDate(0, 0, d)) {
			if w.Start.After(now) {
				return w, true
			}
		}
	}
	return liveWindow{}, false
}

// manualLiveHours is how long a manual "Start LIVE" lasts when nobody presses "End LIVE".
const manualLiveHours = 12

// liveState is what a host card shows.
type liveState struct {
	Manual bool        // LIVE because staff pressed "Start LIVE" (Window.End is its automatic end)
	Status string      // live | scheduled | offline
	Window *liveWindow // the running window when live
	Next   *liveWindow // the next window to start (also while live: the one after this)
}

// liveStateManual is liveStateAt plus a running manual session (manualUntil = when it ends by itself, nil =
// none). A manual session makes the host LIVE whatever the schedule says - even without any shift and even in a
// window staff ended before - while the schedule's own "next" session is left exactly as it was.
func liveStateManual(now time.Time, r liveRule, ended map[int64]bool, manualUntil *time.Time) liveState {
	st := liveStateAt(now, r, ended)
	if manualUntil == nil || !now.Before(*manualUntil) {
		return st
	}
	start := now
	if st.Window != nil {
		start = st.Window.Start
	}
	st.Status, st.Manual = "live", true
	st.Window = &liveWindow{Start: start, End: *manualUntil}
	return st
}

// liveStateAt decides one host's status. `ended` holds the Start times (unix seconds) of windows staff ended manually.
// A host without any schedule (no shift / no hours) is always offline. "scheduled" = next window starts within 24 h.
func liveStateAt(now time.Time, r liveRule, ended map[int64]bool) liveState {
	if len(r.Ranges) == 0 {
		return liveState{Status: "offline"}
	}
	st := liveState{Status: "offline"}
	if w, ok := r.current(now); ok && !ended[w.Start.Unix()] {
		st.Status, st.Window = "live", &w
	}
	if n, ok := r.next(now); ok {
		st.Next = &n
		if st.Status != "live" && n.Start.Sub(now) <= 24*time.Hour {
			st.Status = "scheduled"
		}
	}
	return st
}
