package handlers

import (
	"math"
	"reflect"
	"testing"
)

func TestPlanFIFOTakesOldestLayersFirst(t *testing.T) {
	layers := []fifoLayer{{ID: 1, Remaining: 3, UnitCostTWD: 100}, {ID: 2, Remaining: 5, UnitCostTWD: 120}, {ID: 3, Remaining: 4, UnitCostTWD: 90}}
	takes, short := planFIFO(layers, 6)
	want := []layerTake{{LayerID: 1, Qty: 3, UnitCostTWD: 100}, {LayerID: 2, Qty: 3, UnitCostTWD: 120}}
	if !reflect.DeepEqual(takes, want) || short != 0 {
		t.Fatalf("got %+v short %d", takes, short)
	}
}

func TestPlanFIFOReportsShortage(t *testing.T) {
	takes, short := planFIFO([]fifoLayer{{ID: 1, Remaining: 2, UnitCostTWD: 50}, {ID: 2, Remaining: 0, UnitCostTWD: 60}}, 5)
	if len(takes) != 1 || takes[0].Qty != 2 || short != 3 {
		t.Fatalf("got %+v short %d", takes, short)
	}
	if takes, short := planFIFO(nil, 4); takes != nil || short != 4 {
		t.Fatalf("no layers: got %+v short %d", takes, short)
	}
	if takes, short := planFIFO([]fifoLayer{{ID: 1, Remaining: 2}}, 0); takes != nil || short != 0 {
		t.Fatalf("zero qty: got %+v short %d", takes, short)
	}
}

func TestPlanReversalSplitsTheLastRow(t *testing.T) {
	allocs := []finalAlloc{{ID: 9, LayerID: 3, Qty: 2, UnitCostTWD: 90}, {ID: 8, LayerID: 1, Qty: 4, UnitCostTWD: 100}}
	steps := planReversal(allocs, 3)
	if len(steps) != 2 || steps[0].Qty != 2 || steps[0].Alloc.ID != 9 || steps[1].Qty != 1 || steps[1].Alloc.ID != 8 {
		t.Fatalf("got %+v", steps)
	}
	if steps := planReversal(allocs, 10); len(steps) != 2 || steps[1].Qty != 4 {
		t.Fatalf("over-return is capped at what was costed: %+v", steps)
	}
}

func TestLandedUnitCostMatchesInvoiceTotal(t *testing.T) {
	// lines: 10 x 20 and 5 x 60 = 500; shipping 60 + extra 10 - discount 20 = +50 -> invoice 550
	total := 10*landedUnitCost(20, 500, 15, 50) + 5*landedUnitCost(60, 500, 15, 50)
	if math.Abs(total-550) > 1e-9 {
		t.Fatalf("landed total %v, want 550", total)
	}
	if got := landedUnitCost(20, 500, 15, 0); got != 20 {
		t.Fatalf("no adjustment changes nothing, got %v", got)
	}
	if got := landedUnitCost(0, 0, 4, 20); got != 5 {
		t.Fatalf("zero-value lines share the adjustment per unit, got %v", got)
	}
}

func TestValidateVariantSupplierLinks(t *testing.T) {
	variants := map[int]bool{1: true, 2: true}
	price := 12.5
	neg := -1.0
	ok := []variantSupplierLink{
		{VariantID: 1, SupplierID: 10, IsActive: true, IsPreferred: true, RefPrice: &price},
		{VariantID: 1, SupplierID: 11, IsActive: true},
		{VariantID: 2, SupplierID: 10, IsActive: false, Currency: "rmb"},
	}
	if msg := validateVariantSupplierLinks(ok, variants); msg != "" {
		t.Fatalf("valid links rejected: %s", msg)
	}
	bad := map[string][]variantSupplierLink{
		"foreign variant":    {{VariantID: 3, SupplierID: 10}},
		"no supplier":        {{VariantID: 1}},
		"duplicate supplier": {{VariantID: 1, SupplierID: 10}, {VariantID: 1, SupplierID: 10}},
		"two preferred":      {{VariantID: 1, SupplierID: 10, IsActive: true, IsPreferred: true}, {VariantID: 1, SupplierID: 11, IsActive: true, IsPreferred: true}},
		"inactive preferred": {{VariantID: 1, SupplierID: 10, IsPreferred: true}},
		"negative price":     {{VariantID: 1, SupplierID: 10, RefPrice: &neg}},
		"bad currency":       {{VariantID: 1, SupplierID: 10, Currency: "USD"}},
	}
	for name, links := range bad {
		if validateVariantSupplierLinks(links, variants) == "" {
			t.Errorf("%s: accepted", name)
		}
	}
}

func TestValidateOpeningLine(t *testing.T) {
	if msg := validateOpeningLine(openingLineInput{SKU: "A-1", Qty: 0, UnitCostRMB: 0, ExchangeRate: 4.4}); msg != "" {
		t.Fatalf("valid line rejected: %s", msg)
	}
	for _, l := range []openingLineInput{
		{SKU: " ", Qty: 1, ExchangeRate: 4},
		{SKU: "A", Qty: -1, ExchangeRate: 4},
		{SKU: "A", Qty: 1, UnitCostRMB: -2, ExchangeRate: 4},
		{SKU: "A", Qty: 1, ExchangeRate: 0},
	} {
		if validateOpeningLine(l) == "" {
			t.Errorf("accepted %+v", l)
		}
	}
}
