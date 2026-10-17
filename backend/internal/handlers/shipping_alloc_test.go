package handlers

import (
	"testing"
	"time"
)

func TestAllocateOrders(t *testing.T) {
	base := time.Date(2026, 10, 10, 9, 0, 0, 0, taipeiTZ)
	at := func(h int) time.Time { return base.Add(time.Duration(h) * time.Hour) }

	t.Run("two 7-unit orders never both fit into 10 units: oldest wins", func(t *testing.T) {
		remaining := map[int]int{1: 10}
		res := allocateOrders([]allocOrder{
			{Key: 20, Created: at(2), Lines: []allocLine{{1, 7}}},
			{Key: 10, Created: at(1), Lines: []allocLine{{1, 7}}},
		}, remaining)
		if len(res[10]) != 0 {
			t.Errorf("oldest order should be allocated, got %v", res[10])
		}
		if len(res[20]) != 1 || res[20][0].Need != 7 || res[20][0].Have != 3 {
			t.Errorf("newer order should be short by stock (need 7, have 3), got %v", res[20])
		}
		if remaining[1] != 3 {
			t.Errorf("remaining = %d, want 3", remaining[1])
		}
	})

	t.Run("no partial allocation: a short order consumes nothing", func(t *testing.T) {
		remaining := map[int]int{1: 5, 2: 0}
		res := allocateOrders([]allocOrder{
			{Key: 1, Created: at(1), Lines: []allocLine{{1, 3}, {2, 1}}},
			{Key: 2, Created: at(2), Lines: []allocLine{{1, 5}}},
		}, remaining)
		if len(res[1]) != 1 || res[1][0].VariantID != 2 {
			t.Errorf("order 1 should be short on variant 2, got %v", res[1])
		}
		if len(res[2]) != 0 {
			t.Errorf("order 2 should get all 5 units of variant 1, got %v", res[2])
		}
		if remaining[1] != 0 {
			t.Errorf("remaining[1] = %d, want 0", remaining[1])
		}
	})

	t.Run("same variant on several lines is summed", func(t *testing.T) {
		remaining := map[int]int{1: 4}
		res := allocateOrders([]allocOrder{{Key: 1, Created: at(1), Lines: []allocLine{{1, 3}, {1, 2}}}}, remaining)
		if len(res[1]) != 1 || res[1][0].Need != 5 {
			t.Errorf("want shortage of need 5, got %v", res[1])
		}
	})

	t.Run("negative allocatable stock reports have 0", func(t *testing.T) {
		res := allocateOrders([]allocOrder{{Key: 1, Created: at(1), Lines: []allocLine{{1, 1}}}}, map[int]int{1: -2})
		if len(res[1]) != 1 || res[1][0].Have != 0 {
			t.Errorf("got %v", res[1])
		}
	})
}

func TestCreatedBeforeToday(t *testing.T) {
	// "Now" is 17 Oct 2026 00:30 Taiwan time = 16 Oct 16:30 UTC.
	now := time.Date(2026, 10, 16, 16, 30, 0, 0, time.UTC)
	cases := []struct {
		name    string
		created time.Time
		want    bool
	}{
		{"16 Oct 23:59 Taiwan", time.Date(2026, 10, 16, 23, 59, 0, 0, taipeiTZ), true},
		{"17 Oct 00:00 Taiwan (today)", time.Date(2026, 10, 17, 0, 0, 0, 0, taipeiTZ), false},
		{"17 Oct 00:10 Taiwan (today)", time.Date(2026, 10, 17, 0, 10, 0, 0, taipeiTZ), false},
		// 16 Oct 17:00 UTC is already 17 Oct 01:00 in Taiwan - an order from "Jakarta's yesterday evening"
		{"16 Oct 17:00 UTC = 17 Oct 01:00 Taiwan", time.Date(2026, 10, 16, 17, 0, 0, 0, time.UTC), false},
		{"16 Oct 15:00 UTC = 16 Oct 23:00 Taiwan", time.Date(2026, 10, 16, 15, 0, 0, 0, time.UTC), true},
	}
	for _, c := range cases {
		if got := createdBeforeToday(c.created, now); got != c.want {
			t.Errorf("%s: got %v, want %v", c.name, got, c.want)
		}
	}
}

func TestExportProblems(t *testing.T) {
	good := shippingExportRow{
		OrderNo: "ORD-1", CustomerName: "Ayu", CustomerPhone: "0900-100-100", ChainType: "cvs_711",
		PickupStoreCode: "113506", ItemValue: 1000, ShippingFee: 60,
	}
	if p := exportProblems(good); len(p) != 0 {
		t.Errorf("valid row has problems: %v", p)
	}
	bad := good
	bad.CustomerName = "王小明明明" // 5 Chinese = 10 units, fine
	if p := exportProblems(bad); len(p) != 0 {
		t.Errorf("5 Chinese characters should pass: %v", p)
	}
	bad.CustomerName = "王小明明明明" // 6 Chinese = 12 units
	bad.PickupStoreCode = "11111"
	bad.ItemValue = 20000
	got := exportProblems(bad)
	want := map[string]bool{"name_long": true, "store": true, "total": true}
	if len(got) != len(want) {
		t.Fatalf("got %v", got)
	}
	for _, g := range got {
		if !want[g] {
			t.Errorf("unexpected problem %q in %v", g, got)
		}
	}
	hct := shippingExportRow{OrderNo: "ORD-訂單", CustomerName: "Ayu", CustomerPhone: "0912", ChainType: "courier", ShippingAddress: "台北市"}
	if p := exportProblems(hct); len(p) != 1 || p[0] != "order_no" {
		t.Errorf("HCT order no with Chinese should be the only problem, got %v", p)
	}
}
