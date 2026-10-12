package handlers

import "testing"

func ip(i int) *int { return &i }

func TestStockCoverage(t *testing.T) {
	if stockCoverage(50, 0) != nil {
		t.Fatal("no sales -> nil")
	}
	if c := stockCoverage(0, 30); c == nil || *c != 0 {
		t.Fatal("zero stock with sales -> 0")
	}
	if c := stockCoverage(-5, 30); c == nil || *c != 0 {
		t.Fatal("negative stock with sales -> 0")
	}
	if c := stockCoverage(60, 30); c == nil || *c != 60 {
		t.Fatalf("60 / (30/30) = 60, got %v", c)
	}
}

func TestClassifyVariant(t *testing.T) {
	s := defaultReplenishmentSettings
	cases := []struct {
		name       string
		avail, s30 int
		noSales    *int
		overdue    int
		want       []string
	}{
		{"stockout boundary 7d", 7, 30, ip(0), 0, []string{alertStockout}},
		{"restock just above 7d", 8, 30, ip(0), 0, []string{alertRestock}},
		{"restock boundary 28d", 28, 30, ip(0), 0, []string{alertRestock}},
		{"normal above 28d", 29, 30, ip(0), 0, []string{}},
		{"zero stock with sales is stockout", 0, 30, ip(1), 0, []string{alertStockout}},
		{"stagnant needs stock>0", 0, 0, ip(20), 0, []string{}},
		{"stagnant at 14 days", 10, 0, ip(14), 0, []string{alertStagnant}},
		{"not stagnant at 13 days", 10, 0, ip(13), 0, []string{}},
		{"unknown days not stagnant", 10, 0, nil, 0, []string{}},
		{"overdue", 100, 30, ip(0), 3, []string{alertOverdue}},
		{"multiple", 3, 30, ip(0), 2, []string{alertStockout, alertOverdue}},
		{"stagnant and overdue", 10, 0, ip(30), 5, []string{alertStagnant, alertOverdue}},
	}
	for _, c := range cases {
		got := classifyVariant(s, c.avail, c.s30, c.noSales, c.overdue)
		if len(got) != len(c.want) {
			t.Errorf("%s: got %v want %v", c.name, got, c.want)
			continue
		}
		for i := range got {
			if got[i] != c.want[i] {
				t.Errorf("%s: got %v want %v", c.name, got, c.want)
			}
		}
	}
}

func TestSettingsValid(t *testing.T) {
	if !defaultReplenishmentSettings.valid() {
		t.Fatal("defaults must be valid")
	}
	if (replenishmentSettings{StockoutDays: 7, RestockDays: 7, StagnantDays: 14}).valid() {
		t.Fatal("restock must be above stockout")
	}
	if (replenishmentSettings{StockoutDays: 0, RestockDays: 28, StagnantDays: 14}).valid() {
		t.Fatal("zero not allowed")
	}
}
