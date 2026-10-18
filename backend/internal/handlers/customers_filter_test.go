package handlers

import (
	"net/http/httptest"
	"testing"
	"time"
)

func TestFilterSortCustomers(t *testing.T) {
	d := func(day string) *time.Time {
		v, _ := time.ParseInLocation("2006-01-02 15:04", day, businessTZ)
		return &v
	}
	all := []customerStats{ // already in the cached order: newest purchase first, no purchase last
		{ID: 1, Name: "Ayu", Phone: "0911", OrderCount: 5, TotalSpend: 9000, LastOrderAt: d("2026-10-10 10:00"), Tier: "vip", Labels: []string{"blacklist"}},
		{ID: 2, Name: "Budi", Phone: "0922", OrderCount: 2, TotalSpend: 500, LastOrderAt: d("2026-10-01 00:30"), Tier: "regular", Labels: []string{}},
		{ID: 3, Name: "Citra", Phone: "0933", OrderCount: 9, TotalSpend: 100, LastOrderAt: d("2026-09-01 08:00"), Tier: "regular", Labels: []string{}},
		{ID: 4, Name: "Dewi", Phone: "0944", OrderCount: 0, TotalSpend: 0, Tier: "regular", Labels: []string{}},
	}
	ids := func(list []customerStats) []int {
		out := make([]int, len(list))
		for i, c := range list {
			out[i] = c.ID
		}
		return out
	}
	eq := func(a, b []int) bool {
		if len(a) != len(b) {
			return false
		}
		for i := range a {
			if a[i] != b[i] {
				return false
			}
		}
		return true
	}
	query := func(qs string) customerQuery { return parseCustomerQuery(httptest.NewRequest("GET", "/x?"+qs, nil)) }
	cases := []struct {
		name, qs string
		want     []int
	}{
		{"default keeps the cached order", "", []int{1, 2, 3, 4}},
		{"search by name", "q=bu", []int{2}},
		{"search by phone", "q=0933", []int{3}},
		{"orders high to low", "sort=orders_desc", []int{3, 1, 2, 4}},
		{"orders low to high", "sort=orders_asc", []int{4, 2, 1, 3}},
		{"spend high to low", "sort=ltv_desc", []int{1, 2, 3, 4}},
		{"oldest purchase first, none last", "sort=last_asc", []int{3, 2, 1, 4}},
		{"order range", "min_orders=2&max_orders=5", []int{1, 2}},
		{"spend range", "min_spend=400&max_spend=1000", []int{2}},
		{"vip tier", "tier=vip", []int{1}},
		{"blacklist label", "tier=blacklist", []int{1}},
		{"regular tier", "tier=regular", []int{2, 3, 4}},
		{"last purchase from (Jakarta day)", "from=2026-10-01", []int{1, 2}},
		{"last purchase window excludes no-purchase customers", "from=2026-09-01&to=2026-09-30", []int{3}},
		{"unknown sort keeps the order", "sort=name;drop", []int{1, 2, 3, 4}},
	}
	for _, c := range cases {
		if got := ids(filterSortCustomers(all, query(c.qs))); !eq(got, c.want) {
			t.Errorf("%s: got %v, want %v", c.name, got, c.want)
		}
	}
	// the cached list itself is never reordered
	if got := ids(all); !eq(got, []int{1, 2, 3, 4}) {
		t.Errorf("input list was modified: %v", got)
	}
}
