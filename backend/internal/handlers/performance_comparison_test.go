package handlers

import "testing"

func TestBuildCustomGroup(t *testing.T) {
	views, chats := 1000, 40
	awt, acu := 95.0, 12.5
	gpm := 3000.0
	total := aggregateRow{Views: &views, AWTSeconds: &awt, ACU: &acu, Chats: &chats, Ord: 10, Qty: 30, GMV: 3_000_000, GPM: &gpm}
	days := operatingDays{Live: 2, Website: 5, All: 6}

	live := buildCustomGroup("live", total, days)
	if live.Views == nil || live.GPM == nil || live.AvgQty == nil || *live.AvgQty != 15 || live.OperatingDays != 2 {
		t.Errorf("live group wrong: %+v", live)
	}

	all := buildCustomGroup("all", total, days)
	if all.Views == nil || all.Chats == nil {
		t.Error("ALL keeps broadcast metrics from LIVE sessions")
	}
	if all.GPM != nil {
		t.Error("ALL must not show GPM")
	}
	if all.AvgGMV == nil || *all.AvgGMV != 500_000 || all.OperatingDays != 6 {
		t.Errorf("ALL AVG should divide by All days: %+v", all)
	}

	web := buildCustomGroup("website", total, days)
	if web.Views != nil || web.AWTSeconds != nil || web.ACU != nil || web.Chats != nil || web.GPM != nil {
		t.Errorf("website has no LIVE metrics: %+v", web)
	}
	if web.AvgOrd == nil || *web.AvgOrd != 2 {
		t.Errorf("website AVG should divide by website days: %+v", web)
	}

	none := buildCustomGroup("website", total, operatingDays{})
	if none.AvgQty != nil || none.AvgGMV != nil {
		t.Error("no operating days => AVG unavailable, not 0")
	}
}
