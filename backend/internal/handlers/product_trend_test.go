package handlers

import "testing"

func tr(pid int, sku, color string, pq, cq int, pg, cg float64) trendRow {
	return trendRow{ProductID: pid, SKU: sku, Name: "N" + sku, Category: "c" + sku[:1], Color: color,
		trendEntry: trendEntry{Prev: trendPeriod{pq, pg}, Cur: trendPeriod{cq, cg}}}
}

var trendFixture = []trendRow{
	tr(1, "A1", "red", 10, 2, 100, 900), // qty -8, gmv +800
	tr(1, "A1", "blue", 0, 8, 0, 10),    // qty +8
	tr(2, "B1", "red", 5, 0, 50, 0),     // zero now
	tr(3, "C1", "black", 1, 20, 1, 5),   // qty +19
	tr(4, "D1", "red", 3, 3, 30, 30),    // flat
}

func skus(ps []*trendProduct) []string {
	var o []string
	for _, p := range ps {
		o = append(o, p.SKU)
	}
	return o
}

func eq(a, b []string) bool {
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

func TestBuildTrendSorts(t *testing.T) {
	pg := pageParams{Page: 1, Size: 20}
	cases := []struct {
		metric, mode string
		want         []string
	}{
		{"qty", "all", []string{"C1", "A1", "D1", "B1"}},
		{"qty", "increase", []string{"C1", "A1", "D1", "B1"}}, // A1 = 0, D1 = 0 (tie by sku), B1 = -5
		{"qty", "decrease", []string{"B1", "A1", "D1", "C1"}},
		{"qty", "zero", []string{"B1"}},
		{"gmv", "all", []string{"A1", "D1", "C1", "B1"}},
	}
	for _, c := range cases {
		got := skus(buildTrend(trendFixture, c.metric, c.mode, "", nil, pg).Products)
		if !eq(got, c.want) {
			t.Errorf("%s/%s = %v, want %v", c.metric, c.mode, got, c.want)
		}
	}
}

func TestBuildTrendSearchPagingRankings(t *testing.T) {
	names := map[string][]string{"black": {"黑色", "hitam"}}
	if got := skus(buildTrend(trendFixture, "qty", "all", "hitam", names, pageParams{Page: 1, Size: 20}).Products); !eq(got, []string{"C1"}) {
		t.Errorf("master colour search = %v", got)
	}
	if got := skus(buildTrend(trendFixture, "qty", "all", "nb1", nil, pageParams{Page: 1, Size: 20}).Products); !eq(got, []string{"B1"}) {
		t.Errorf("name search = %v", got)
	}
	r := buildTrend(trendFixture, "qty", "all", "", nil, pageParams{Page: 2, Size: 3, Offset: 3})
	if r.Total != 4 || len(r.Products) != 1 {
		t.Errorf("paging total=%d page=%d", r.Total, len(r.Products))
	}
	r = buildTrend(trendFixture, "qty", "zero", "zzz", nil, pageParams{Page: 1, Size: 20})
	if r.Total != 0 || len(r.Growth) == 0 || r.Growth[0].SKU != "C1" || r.Decline[0].Color != "red" {
		t.Errorf("rankings must ignore search/sort: %+v", r)
	}
	full := buildTrend(trendFixture, "qty", "all", "", nil, pageParams{Page: 1, Size: 20})
	if full.Products[1].Colors[0].Color != "blue" { // A1: blue +8 before red -8
		t.Errorf("colours not ordered by change: %+v", full.Products[1].Colors)
	}
}
