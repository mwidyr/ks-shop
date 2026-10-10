package handlers

import (
	"testing"
	"time"
)

func TestSalesBucketIndex(t *testing.T) {
	cases := map[int]int{0: 0, -1: 0, 1: 1, 5: 1, 6: 2, 9: 2, 10: 3, 19: 3, 20: 4, 29: 4, 90: 11, 99: 11, 100: 12, 250: 12}
	for qty, want := range cases {
		if got := salesBucketIndex(qty); got != want {
			t.Errorf("qty %d => bucket %d, want %d", qty, got, want)
		}
	}
	if len(salesBucketLabels) != 13 {
		t.Fatalf("labels %d", len(salesBucketLabels))
	}
}

func TestWebsiteDayKeys(t *testing.T) {
	day := func(s string) time.Time { d, _ := time.ParseInLocation("2006-01-02", s, businessTZ); return d }
	launch := day("2026-10-05")
	now := day("2026-10-10").Add(15 * time.Hour)
	// range 10-01..10-12 (to exclusive 10-13): launch clips the start, today clips the end -> 5..10 = 6 days
	if n := len(websiteDayKeys(&launch, day("2026-10-01"), day("2026-10-13"), now)); n != 6 {
		t.Errorf("clipped range: %d days, want 6", n)
	}
	// range entirely before launch
	if n := len(websiteDayKeys(&launch, day("2026-09-01"), day("2026-09-10"), now)); n != 0 {
		t.Errorf("before launch: %d, want 0", n)
	}
	// no launch date
	if websiteDayKeys(nil, day("2026-10-01"), day("2026-10-13"), now) != nil {
		t.Error("nil launch should give no days")
	}
	// single day (today)
	if n := len(websiteDayKeys(&launch, day("2026-10-10"), day("2026-10-11"), now)); n != 1 {
		t.Errorf("today: %d, want 1", n)
	}
}
