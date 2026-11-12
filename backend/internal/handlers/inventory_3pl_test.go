package handlers

import "testing"

func TestBuildTPLPreview(t *testing.T) {
	sys := []tplSystemVariant{
		{1, "C002-BLACK-FREESIZE", 10},
		{2, "a003-brown", 5},
		{3, "X-1", 1},
		{4, "X1", 1}, // collides with X-1 once hyphens are ignored
		{5, "ONLY-IN-SYS", 7},
	}
	lines := []tplLine{
		{"C002BLACKFREESIZE", 12},
		{" A003BROWN ", 5},
		{"X1", 3},
		{"NOPE", 1},
		{"C002BLACKFREESIZE", 99},
	}
	p := buildTPLPreview(lines, sys)
	if len(p.Rows) != 2 || p.Rows[0].VariantID != 1 || p.Rows[0].Diff != 2 || p.Rows[0].After != 12 {
		t.Fatalf("rows: %+v", p.Rows)
	}
	if p.Rows[1].Diff != 0 {
		t.Fatalf("lowercase/space match should be unchanged: %+v", p.Rows[1])
	}
	if len(p.Ambiguous) != 1 || p.Ambiguous[0] != "X1" {
		t.Fatalf("ambiguous: %v", p.Ambiguous)
	}
	if len(p.UnknownInSys) != 1 || p.UnknownInSys[0] != "NOPE" {
		t.Fatalf("unknown: %v", p.UnknownInSys)
	}
	if len(p.DuplicateSKU) != 1 {
		t.Fatalf("duplicate: %v", p.DuplicateSKU)
	}
	// ambiguous system SKUs are "missing" too (never zeroed), and the real missing one is listed
	found := false
	for _, s := range p.MissingInTPL {
		if s == "ONLY-IN-SYS" {
			found = true
		}
		if s == "X-1" || s == "X1" {
			t.Fatalf("matched-by-key SKU reported missing: %v", p.MissingInTPL)
		}
	}
	if !found {
		t.Fatalf("missing: %v", p.MissingInTPL)
	}
}

func TestValidTPLLines(t *testing.T) {
	if validTPLLines(nil) || validTPLLines([]tplLine{{"A", -1}}) || !validTPLLines([]tplLine{{"A", 0}}) {
		t.Fatal("validation wrong")
	}
}
