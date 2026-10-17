package handlers

import "testing"

func TestBatchCountsStage(t *testing.T) {
	// The spec's example: 100 orders - 10 Processing, 20 Ready, 30 Shipped, 40 Completed.
	var c batchCounts
	add := func(status string, n int) {
		for i := 0; i < n; i++ {
			c.add(status)
		}
	}
	add("processing", 10)
	add("ready_to_ship", 20)
	add("shipped", 30)
	add("delivered", 40)
	if c.Total != 100 || c.Unresolved() != 60 {
		t.Fatalf("total %d unresolved %d", c.Total, c.Unresolved())
	}
	if c.Stage() != stagePendingMatching || c.BatchStatus() != batchStatusPending {
		t.Errorf("stage %s status %s", c.Stage(), c.BatchStatus())
	}

	cases := []struct {
		name  string
		build func() batchCounts
		stage string
		state string
	}{
		{"all matched, some waiting for 3PL", func() batchCounts {
			var x batchCounts
			x.add("ready_to_ship")
			x.add("shipped")
			x.add("delivered")
			return x
		}, stageAwaiting3PL, batchStatusPending},
		{"all shipped, one not delivered yet", func() batchCounts {
			var x batchCounts
			x.add("shipped")
			x.add("delivered")
			x.add("cancelled")
			return x
		}, stageShippedAwaiting, batchStatusPending},
		{"closed with a cancellation and a return", func() batchCounts {
			var x batchCounts
			x.add("delivered")
			x.add("cancelled")
			x.add("return")
			return x
		}, stageClosed, batchStatusClosed},
		{"orders not exported yet hold the batch at matching", func() batchCounts {
			var x batchCounts
			x.add("pending")
			x.add("delivered")
			return x
		}, stagePendingMatching, batchStatusPending},
		{"a cancelled order does not block the next stage", func() batchCounts {
			var x batchCounts
			x.add("cancelled")
			x.add("ready_to_ship")
			return x
		}, stageAwaiting3PL, batchStatusPending},
	}
	for _, tc := range cases {
		got := tc.build()
		if got.Stage() != tc.stage || got.BatchStatus() != tc.state {
			t.Errorf("%s: stage %s status %s", tc.name, got.Stage(), got.BatchStatus())
		}
	}
}

func TestParse711Result(t *testing.T) {
	cases := []struct {
		in      string
		wantNo  string
		success bool
	}{
		{"檢核通過，訂單編號: CM2610168640520", "CM2610168640520", true},
		{"檢核通過，訂單編號：CM2610168640520", "CM2610168640520", true},
		{"檢核通過", "", true},
		{"[取件門市]：(常溫)無此店號", "", false},
		{"", "", false},
	}
	for _, c := range cases {
		no, ok := parse711Result(c.in)
		if no != c.wantNo || ok != c.success {
			t.Errorf("%q: got (%q,%v), want (%q,%v)", c.in, no, ok, c.wantNo, c.success)
		}
	}
}

func TestReadyAfterImport(t *testing.T) {
	if !readyAfterImport("cvs_711", "CM1", "") {
		t.Error("7-11 with CM only should be ready (missing G is a warning)")
	}
	if readyAfterImport("cvs_711", "", "G1") {
		t.Error("7-11 without CM must not be ready")
	}
	if readyAfterImport("cvs_familymart", "L1", "") {
		t.Error("FamilyMart needs both numbers")
	}
	if !readyAfterImport("cvs_familymart", "L1", "163") {
		t.Error("FamilyMart with both numbers is ready")
	}
}

func TestMatching(t *testing.T) {
	cands := []candidateOrder{
		{ID: 1, OrderNo: "ORD-1", PlatformOrderNo: "CM1", ShippingNo: "G1"},
		{ID: 2, OrderNo: "ORD-2", PlatformOrderNo: "CM2"},
		{ID: 3, OrderNo: "ORD-3", GroupID: 9},
		{ID: 4, OrderNo: "ORD-4", GroupID: 9, PlatformOrderNo: "CM9"},
	}
	idx := newOrderIndex(cands)

	if m := idx.match(importRecord{OrderNo: "ORD-1"}); len(m.Unit) != 1 || m.Conflict {
		t.Errorf("by order no: %+v", m)
	}
	if m := idx.match(importRecord{PlatformOrderNo: "CM2"}); len(m.Unit) != 1 || m.Unit[0].ID != 2 {
		t.Errorf("by platform no: %+v", m)
	}
	if m := idx.match(importRecord{ShippingNo: "G1"}); len(m.Unit) != 1 || m.Unit[0].ID != 1 {
		t.Errorf("by shipping no: %+v", m)
	}
	if m := idx.match(importRecord{OrderNo: "ORD-1", PlatformOrderNo: "CM1", ShippingNo: "G1"}); len(m.Unit) != 1 || m.Conflict {
		t.Errorf("consistent identifiers: %+v", m)
	}
	if m := idx.match(importRecord{OrderNo: "ORD-1", PlatformOrderNo: "CM2"}); !m.Conflict {
		t.Errorf("identifiers of two different orders must conflict: %+v", m)
	}
	if m := idx.match(importRecord{OrderNo: "ORD-404"}); len(m.Unit) != 0 || m.Conflict {
		t.Errorf("unknown order: %+v", m)
	}
	// both members of a merged group belong to one shipment, so they never conflict with each other
	if m := idx.match(importRecord{OrderNo: "ORD-3", PlatformOrderNo: "CM9"}); m.Conflict || len(m.Unit) != 2 {
		t.Errorf("merge group: %+v", m)
	}
}

func TestMergeIdentifier(t *testing.T) {
	if v, ch, cf := mergeIdentifier("", "CM1"); v != "CM1" || !ch || cf {
		t.Errorf("empty->set: %v %v %v", v, ch, cf)
	}
	if v, ch, cf := mergeIdentifier("CM1", "CM1"); v != "CM1" || ch || cf {
		t.Errorf("same: %v %v %v", v, ch, cf)
	}
	if v, ch, cf := mergeIdentifier("CM1", "CM2"); v != "CM1" || ch || !cf {
		t.Errorf("different must conflict and keep: %v %v %v", v, ch, cf)
	}
	if v, ch, cf := mergeIdentifier("CM1", ""); v != "CM1" || ch || cf {
		t.Errorf("blank incoming keeps value: %v %v %v", v, ch, cf)
	}
}
