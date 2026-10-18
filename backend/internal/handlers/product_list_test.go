package handlers

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestProductQueryWhere(t *testing.T) {
	q := func(qs string) productQuery {
		return parseProductQuery(httptest.NewRequest("GET", "/products?"+qs, nil))
	}

	if w, args := q("").where(); w != "" || len(args) != 0 {
		t.Errorf("no filters: %q %v", w, args)
	}
	w, args := q("tab=active&q=silk&category=上衣&stock=low_stock").where()
	for _, want := range []string{"a.is_active", "p.name ILIKE $1", "p.vendor_sku", "p.description", "COALESCE(sv.color,'') ILIKE $1", "a.category = $2", "a.stock > 0 AND a.stock <= 5"} {
		if !strings.Contains(w, want) {
			t.Errorf("where %q misses %q", w, want)
		}
	}
	if len(args) != 2 || args[0] != "%silk%" || args[1] != "上衣" {
		t.Errorf("args %v", args)
	}
	// the search text is only ever a bound argument, never part of the SQL
	w, args = q("q=x%27%3B%20DROP%20TABLE%20products%3B--").where()
	if strings.Contains(w, "DROP") || len(args) != 1 {
		t.Errorf("search must be bound: %q %v", w, args)
	}
	w, args = q("color=白色&color_alt=Putih").where()
	if !strings.Contains(w, "cv.color = ANY($1)") || len(args) != 1 {
		t.Errorf("color filter: %q %v", w, args)
	}
	if w, _ := q("tab=inactive&stock=out_of_stock").where(); !strings.Contains(w, "NOT a.is_active") || !strings.Contains(w, "a.stock = 0") {
		t.Errorf("inactive/out of stock: %q", w)
	}
	if w, _ := q("stock=oversell").where(); !strings.Contains(w, "a.oversell") {
		t.Errorf("oversell: %q", w)
	}
	if w, _ := q("stock=bogus&tab=bogus").where(); w != "" {
		t.Errorf("unknown values add no filter: %q", w)
	}
}

func TestProductSortWhitelist(t *testing.T) {
	for _, bad := range []string{"", "a.id; DROP TABLE x", "stock_desc,(select 1)"} {
		if got := pickSort(bad, productSorts, productSorts["newest"]); got != productSorts["newest"] {
			t.Errorf("%q must fall back to newest, got %q", bad, got)
		}
	}
	if got := pickSort("price_asc", productSorts, productSorts["newest"]); got != productSorts["price_asc"] {
		t.Errorf("price_asc: %q", got)
	}
}

func TestInIDOrderAndParseIDList(t *testing.T) {
	loaded := []Product{{ID: 1}, {ID: 2}, {ID: 3}}
	got := inIDOrder(loaded, []int{3, 1, 9})
	if len(got) != 2 || got[0].ID != 3 || got[1].ID != 1 {
		t.Errorf("order: %+v", got)
	}
	if ids := parseIDList("5, 2,x,-1,0,7"); len(ids) != 3 || ids[0] != 5 || ids[1] != 2 || ids[2] != 7 {
		t.Errorf("ids: %v", ids)
	}
}
