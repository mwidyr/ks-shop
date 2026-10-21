package handlers

import (
	"testing"
	"time"
)

func TestKeepDates(t *testing.T) {
	d := func(s string) time.Time { x, _ := time.Parse("2006-01-02", s); return x }
	cases := []struct{ date, typ, ship, export string }{
		{"2026-10-30", "shipping", "2026-10-30", "2026-10-29"},
		{"2026-10-30", "delivery", "2026-10-27", "2026-10-26"},
		{"2026-11-02", "delivery", "2026-10-30", "2026-10-29"},
		{"2027-01-02", "delivery", "2026-12-30", "2026-12-29"},
		{"2026-10-30", "", "2026-10-30", "2026-10-29"},
	}
	for _, c := range cases {
		ship, exp := keepDates(d(c.date), c.typ)
		if ship != d(c.ship) || exp != d(c.export) {
			t.Errorf("%s/%s: got ship %s export %s, want %s %s", c.date, c.typ, ship.Format("2006-01-02"), exp.Format("2006-01-02"), c.ship, c.export)
		}
	}
}

func TestNormalizeKeep(t *testing.T) {
	bad := "30/10/2026"
	ok := "2026-10-30"
	if typ, e := normalizeKeep(&ok, ""); typ != "shipping" || e != "" {
		t.Errorf("default: %q %q", typ, e)
	}
	if _, e := normalizeKeep(&ok, "weird"); e == "" {
		t.Error("bad type accepted")
	}
	if _, e := normalizeKeep(&bad, "delivery"); e == "" {
		t.Error("bad date accepted")
	}
	if typ, e := normalizeKeep(nil, "delivery"); typ != "delivery" || e != "" {
		t.Errorf("nil date: %q %q", typ, e)
	}
}
