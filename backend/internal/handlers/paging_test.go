package handlers

import (
	"net/http/httptest"
	"testing"
)

func TestParsePage(t *testing.T) {
	cases := []struct {
		name, query                    string
		defSize, maxSize               int
		wantPage, wantSize, wantOffset int
	}{
		{"defaults", "", 20, 100, 1, 20, 0},
		{"page two", "page=2&page_size=20", 20, 100, 2, 20, 20},
		{"size capped", "page_size=100000", 20, 100, 1, 100, 0},
		{"custom cap", "page_size=500", 20, 200, 1, 200, 0},
		{"junk falls back", "page=abc&page_size=-5", 20, 100, 1, 20, 0},
		{"zero page falls back", "page=0", 50, 100, 1, 50, 0},
		{"offset follows size", "page=3&page_size=25", 20, 100, 3, 25, 50},
	}
	for _, c := range cases {
		r := httptest.NewRequest("GET", "/x?"+c.query, nil)
		p := parsePage(r, c.defSize, c.maxSize)
		if p.Page != c.wantPage || p.Size != c.wantSize || p.Offset != c.wantOffset {
			t.Errorf("%s: got %+v, want page %d size %d offset %d", c.name, p, c.wantPage, c.wantSize, c.wantOffset)
		}
	}
}

func TestPickSortWhitelist(t *testing.T) {
	allowed := map[string]string{"oldest": "o.created_at ASC", "total_desc": "total_amount DESC"}
	if got := pickSort("oldest", allowed, "o.created_at DESC"); got != "o.created_at ASC" {
		t.Errorf("known sort: %q", got)
	}
	for _, bad := range []string{"", "nope", "o.created_at; DROP TABLE orders", "total_desc, (select 1)"} {
		if got := pickSort(bad, allowed, "o.created_at DESC"); got != "o.created_at DESC" {
			t.Errorf("%q must fall back to the default, got %q", bad, got)
		}
	}
}
