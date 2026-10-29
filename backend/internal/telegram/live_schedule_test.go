package telegram

import (
	"testing"
	"time"
)

func tp(t *testing.T, s string) time.Time {
	t.Helper()
	v, err := time.ParseInLocation("2006-01-02 15:04", s, taipeiTZ)
	if err != nil {
		t.Fatal(err)
	}
	return v
}

func TestShiftWindowsRespectWorkDaysAndDaysOff(t *testing.T) {
	// 2026-10-26 is a Monday; Sunday (0) is not a working day, 10-28 is a day off.
	work := [7]bool{false, true, true, true, true, true, true}
	ws := shiftWindows([][]string{{"07:00", "10:00"}, {"22:00", "02:00"}}, work, map[string]bool{"2026-10-28": true}, tp(t, "2026-10-25 00:00"), tp(t, "2026-10-29 00:00"))
	// 10-25 Sun skipped, 10-26 + 10-27 + 10-29 (2 windows each); 10-28 off
	if len(ws) != 6 {
		t.Fatalf("windows = %d: %v", len(ws), ws)
	}
	if !ws[1].End.Equal(tp(t, "2026-10-27 02:00")) {
		t.Errorf("overnight window must end next day: %v", ws[1])
	}
}

func TestPersonalBestWindowMath(t *testing.T) {
	m1 := liveWindow{tp(t, "2026-10-26 07:00"), tp(t, "2026-10-26 10:00")}
	m2 := liveWindow{tp(t, "2026-10-27 07:00"), tp(t, "2026-10-27 10:00")}
	sales := []sale{{tp(t, "2026-10-26 08:00"), 20}, {tp(t, "2026-10-26 09:00"), 15}, {tp(t, "2026-10-27 08:00"), 40}, {tp(t, "2026-10-27 12:00"), 99}}
	now := tp(t, "2026-10-27 09:00")
	cur, ok := currentWindow([]liveWindow{m1, m2}, now)
	if !ok || !cur.Start.Equal(m2.Start) {
		t.Fatalf("current window = %v %v", cur, ok)
	}
	if got := bestBefore(sales, []liveWindow{m1, m2}, cur); got != 35 {
		t.Errorf("previous best = %d, want 35", got)
	}
	if got := qtyIn(sales, cur.Start, now.Add(time.Minute)); got != 40 {
		t.Errorf("current qty = %d, want 40 (sales after the window are not counted yet)", got)
	}
	if _, ok := currentWindow([]liveWindow{m1, m2}, tp(t, "2026-10-27 11:00")); ok {
		t.Error("a LIVE that ended more than the grace ago is not current")
	}
	if _, ok := currentWindow([]liveWindow{m1, m2}, tp(t, "2026-10-27 10:20")); !ok {
		t.Error("a LIVE that just ended still counts for the final orders")
	}
}
