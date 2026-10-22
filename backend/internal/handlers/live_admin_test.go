package handlers

import "testing"

func TestValidLiveLink(t *testing.T) {
	for _, v := range []string{"", "https://www.tiktok.com/@ralulu_rara/live", "http://example.com/x"} {
		if !validLiveLink(v) {
			t.Errorf("%q should be accepted", v)
		}
	}
	for _, v := range []string{"javascript:alert(1)", "tiktok.com/@a", "//evil.com", "https://a b.com", "https://x.com/\"onclick=1", "ftp://x.com"} {
		if validLiveLink(v) {
			t.Errorf("%q should be rejected", v)
		}
	}
}

func TestCleanWorkDays(t *testing.T) {
	if d, ok := cleanWorkDays([]int{5, 0, 1, 1}); !ok || len(d) != 3 || d[0] != 0 || d[2] != 5 {
		t.Fatalf("got %v %v", d, ok)
	}
	if _, ok := cleanWorkDays([]int{7}); ok {
		t.Fatal("7 is not a weekday")
	}
	if _, ok := cleanWorkDays([]int{-1}); ok {
		t.Fatal("-1 is not a weekday")
	}
}

func TestCleanDaysOff(t *testing.T) {
	out, ok := cleanDaysOff([]liveDayOffDTO{{"2026-12-25", " Christmas "}, {"2026-12-25", "dup"}, {"2026-11-01", ""}})
	if !ok || len(out) != 2 || out[0].Date != "2026-11-01" || out[1].Note != "Christmas" {
		t.Fatalf("got %v %v", out, ok)
	}
	if _, ok := cleanDaysOff([]liveDayOffDTO{{"25/12/2026", ""}}); ok {
		t.Fatal("bad date accepted")
	}
}
