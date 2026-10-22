package handlers

import (
	"testing"
	"time"
)

func tw(s string) time.Time { // "2026-10-23 07:00" in Taiwan time
	t, err := time.ParseInLocation("2006-01-02 15:04", s, taipeiTZ)
	if err != nil {
		panic(err)
	}
	return t
}

func ruleOf(t *testing.T, pairs [][]string, off ...string) liveRule {
	t.Helper()
	rs, err := rangesFromPairs(pairs)
	if err != nil {
		t.Fatal(err)
	}
	r := liveRule{Ranges: rs, DaysOff: map[string]bool{}}
	for _, d := range []int{0, 1, 2, 3, 4, 5} { // Sunday-Friday
		r.WorkDays[d] = true
	}
	for _, o := range off {
		r.DaysOff[o] = true
	}
	return r
}

var morning = [][]string{{"07:00", "10:00"}, {"13:00", "16:00"}}

func TestLiveWindowBoundaries(t *testing.T) {
	r := ruleOf(t, morning)
	// 2026-10-23 is a Friday (working day)
	cases := []struct {
		at   string
		live bool
	}{
		{"2026-10-23 06:59", false}, {"2026-10-23 07:00", true}, {"2026-10-23 09:59", true}, {"2026-10-23 10:00", false},
		{"2026-10-23 12:59", false}, {"2026-10-23 13:00", true}, {"2026-10-23 15:59", true}, {"2026-10-23 16:00", false},
	}
	for _, c := range cases {
		if _, ok := r.current(tw(c.at)); ok != c.live {
			t.Errorf("%s live=%v, want %v", c.at, ok, c.live)
		}
	}
}

func TestLiveSaturdayOffAndNextWindow(t *testing.T) {
	r := ruleOf(t, morning)
	// Saturday 2026-10-24 is off: nothing is live and the next window is Sunday 07:00
	if _, ok := r.current(tw("2026-10-24 08:00")); ok {
		t.Fatal("Saturday must be a day off")
	}
	n, ok := r.next(tw("2026-10-24 08:00"))
	if !ok || !n.Start.Equal(tw("2026-10-25 07:00")) {
		t.Fatalf("next = %v %v, want Sunday 07:00", n, ok)
	}
	// Friday after the last window: next is Sunday too
	n, _ = r.next(tw("2026-10-23 16:30"))
	if !n.Start.Equal(tw("2026-10-25 07:00")) {
		t.Fatalf("next after Friday = %v", n.Start)
	}
	// between the two ranges of one day
	n, _ = r.next(tw("2026-10-23 11:00"))
	if !n.Start.Equal(tw("2026-10-23 13:00")) {
		t.Fatalf("next = %v, want 13:00", n.Start)
	}
}

func TestLiveExtraDayOff(t *testing.T) {
	r := ruleOf(t, morning, "2026-10-25") // Sunday closed
	n, _ := r.next(tw("2026-10-23 17:00"))
	if !n.Start.Equal(tw("2026-10-26 07:00")) {
		t.Fatalf("next = %v, want Monday 07:00", n.Start)
	}
	if _, ok := r.current(tw("2026-10-25 08:00")); ok {
		t.Fatal("extra day off must not be live")
	}
}

func TestLiveEmptyShiftNeverLive(t *testing.T) {
	r := ruleOf(t, [][]string{})
	st := liveStateAt(tw("2026-10-23 08:00"), r, nil)
	if st.Status != "offline" || st.Next != nil {
		t.Fatalf("empty evening shift: %+v", st)
	}
}

func TestLiveCrossesMidnight(t *testing.T) {
	r := ruleOf(t, [][]string{{"22:00", "02:00"}})
	if _, ok := r.current(tw("2026-10-23 23:30")); !ok {
		t.Fatal("23:30 should be live")
	}
	w, ok := r.current(tw("2026-10-24 01:00")) // Saturday 01:00 still belongs to Friday's window
	if !ok || !w.Start.Equal(tw("2026-10-23 22:00")) {
		t.Fatalf("01:00 window = %v %v", w, ok)
	}
	if _, ok := r.current(tw("2026-10-24 02:00")); ok {
		t.Fatal("02:00 is the end")
	}
}

func TestLiveEndLiveOnlySuppressesThatWindow(t *testing.T) {
	r := ruleOf(t, morning)
	now := tw("2026-10-23 08:00")
	w, _ := r.current(now)
	ended := map[int64]bool{w.Start.Unix(): true}
	if st := liveStateAt(now, r, ended); st.Status == "live" {
		t.Fatalf("ended window still live: %+v", st)
	}
	// the afternoon window of the same day starts by itself
	if st := liveStateAt(tw("2026-10-23 13:30"), r, ended); st.Status != "live" {
		t.Fatalf("next window should be live: %+v", st)
	}
}

func TestLiveStatusScheduledWithin24h(t *testing.T) {
	r := ruleOf(t, morning)
	if st := liveStateAt(tw("2026-10-23 17:00"), r, nil); st.Status != "offline" { // next is Sunday 07:00, > 24 h
		t.Fatalf("Friday evening: %+v", st)
	}
	if st := liveStateAt(tw("2026-10-25 05:00"), r, nil); st.Status != "scheduled" {
		t.Fatalf("Sunday 05:00: %+v", st)
	}
}

func TestParseLiveRangesValidation(t *testing.T) {
	if _, err := parseLiveRanges([]byte(`[["07:00","10:00"],["13:00","16:00"]]`)); err != nil {
		t.Fatal(err)
	}
	for _, bad := range []string{`[["7:00","10:00"]]`, `[["07:00","25:00"]]`, `[["07:00","07:00"]]`, `[["07:00"]]`, `[["07:60","08:00"]]`, `nope`} {
		if _, err := parseLiveRanges([]byte(bad)); err == nil {
			t.Errorf("%s should be rejected", bad)
		}
	}
	rs, _ := parseLiveRanges([]byte(`[["13:00","16:00"],["07:00","10:00"]]`))
	if rs[0].Start != 7*60 {
		t.Error("ranges should be sorted")
	}
}
