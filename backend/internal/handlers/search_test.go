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
