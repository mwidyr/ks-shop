package handlers

import "testing"

func TestColorSharesSumToProductQty(t *testing.T) {
	got := colorShares(map[string]int{"red": 6, "blue": 3, "black": 1}, 10)
	if len(got) != 3 || got[0].Color != "red" {
		t.Fatalf("unexpected order: %+v", got)
	}
	total := 0.0
	for _, c := range got {
		total += c.Pct
	}
	if total < 99.99 || total > 100.01 {
		t.Fatalf("pct sum = %v", total)
	}
}
