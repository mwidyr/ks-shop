package handlers

import (
	"strings"
	"testing"
)

func TestLikePattern(t *testing.T) {
	cases := map[string]string{
		"":              "",
		"   ":           "",
		"C":             "%C%",
		" celana ":      "%celana%",
		"pakaian dalam": "%pakaian dalam%",
		"50%":           `%50\%%`,
		"a_b":           `%a\_b%`,
		`x\y`:           `%x\\y%`,
	}
	for in, want := range cases {
		if got := likePattern(in); got != want {
			t.Errorf("likePattern(%q) = %q, want %q", in, got, want)
		}
	}
	if prefixPattern("C_") != `C\_%` || prefixPattern(" ") != "" {
		t.Errorf("prefixPattern wrong")
	}
}

func TestProductSearchSQLUsesOnlyGivenPlaceholder(t *testing.T) {
	s := productSearchSQL("p", "$7")
	if strings.Contains(s, "$1") || !strings.Contains(s, "p.vendor_sku") || !strings.Contains(s, "p.description") ||
		!strings.Contains(s, "sv.color") || !strings.Contains(s, "ssp.name") {
		t.Errorf("unexpected predicate: %s", s)
	}
	if strings.Count(s, "(") != strings.Count(s, ")") {
		t.Errorf("unbalanced parentheses")
	}
}

func TestSearchRankSQL(t *testing.T) {
	s := searchRankSQL("a.sku", "a.name", "$4", "$1")
	i0, i1, i2, i3 := strings.Index(s, "ILIKE $4 THEN 0"), strings.Index(s, "ILIKE $4 THEN 1"), strings.Index(s, "ILIKE $1 THEN 2"), strings.Index(s, "ILIKE $1 THEN 3")
	if i0 < 0 || !(i0 < i1 && i1 < i2 && i2 < i3) || !strings.HasSuffix(s, "ELSE 4 END") {
		t.Errorf("tiers out of order: %s", s)
	}
}
