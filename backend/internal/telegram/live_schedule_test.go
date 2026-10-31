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

func TestSalesWindowsSplitOnLongGaps(t *testing.T) {
	sales := []sale{
		{tp(t, "2026-10-27 20:40"), 5}, {tp(t, "2026-10-27 20:00"), 10}, {tp(t, "2026-10-27 20:20"), 7}, // unsorted on purpose
		{tp(t, "2026-10-27 23:30"), 3},
	}
	ws := salesWindows(sales)
	if len(ws) != 2 {
		t.Fatalf("windows = %v, want 2 LIVEs", ws)
	}
	if got := qtyIn(sales, ws[0].Start, ws[0].End); !ws[0].Start.Equal(tp(t, "2026-10-27 20:00")) || got != 22 {
		t.Errorf("first LIVE = %v qty %d, want start 20:00 and 22 PCS (its last sale is inside the window)", ws[0], got)
	}
}

// Personal Best used to need a scheduled / manual window, so a host without a shift (or LIVE-ing outside it)
// never got a message however much it sold. Its sales now form the LIVE.
func TestPersonalBestWithoutAnyWindowUsesSales(t *testing.T) {
	sales := []sale{
		{tp(t, "2026-10-26 20:00"), 20}, {tp(t, "2026-10-26 20:30"), 12}, // earlier LIVE: 32 PCS
		{tp(t, "2026-10-27 20:00"), 25}, {tp(t, "2026-10-27 20:30"), 10}, // today's LIVE so far: 35 PCS
	}
	now := tp(t, "2026-10-27 20:35")
	cur, qty, prev, ok := personalBestState(nil, sales, now)
	if !ok || qty != 35 || prev != 32 || !cur.Start.Equal(tp(t, "2026-10-27 20:00")) {
		t.Fatalf("state = %v qty %d prev %d ok %v, want today's LIVE 35 vs 32", cur, qty, prev, ok)
	}
	// not selling any more: after the grace the host is not in a LIVE and nothing fires
	if _, _, _, ok := personalBestState(nil, sales, tp(t, "2026-10-27 21:30")); ok {
		t.Error("a host that stopped selling more than the grace ago is not in a LIVE")
	}
}

func TestPersonalBestPrefersScheduledWindow(t *testing.T) {
	w := liveWindow{tp(t, "2026-10-27 19:00"), tp(t, "2026-10-27 22:00")}
	sales := []sale{{tp(t, "2026-10-27 19:30"), 40}, {tp(t, "2026-10-27 21:00"), 5}}
	cur, qty, prev, ok := personalBestState([]liveWindow{w}, sales, tp(t, "2026-10-27 21:10"))
	if !ok || !cur.Start.Equal(w.Start) || qty != 45 || prev != 0 {
		t.Fatalf("state = %v qty %d prev %d ok %v", cur, qty, prev, ok)
	}
}
