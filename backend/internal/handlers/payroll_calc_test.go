package handlers

import "testing"

func intp(n int) *int { return &n }

var testQtyTiers = []qtyTier{
	{0, intp(200), 0}, {201, intp(499), 200}, {500, intp(999), 1000}, {1000, intp(1499), 1500}, {3000, nil, 5000},
}

func TestQtyBonusUsesTheAchievedTierForAllItems(t *testing.T) {
	cases := map[int]float64{0: 0, 200: 0, 201: 201 * 200, 499: 499 * 200, 500: 500 * 1000, 1250: 1250 * 1500, 3500: 3500 * 5000}
	for qty, want := range cases {
		if got := qtyBonus(qty, testQtyTiers); got != want {
			t.Errorf("qtyBonus(%d) = %v, want %v", qty, got, want)
		}
	}
}

func TestGMVBonusOnlyHighestTier(t *testing.T) {
	tiers := []gmvTier{{150000, 500000}, {300000, 1000000}, {500000, 2000000}}
	cases := map[float64]float64{100000: 0, 150000: 500000, 299999: 500000, 680000: 2000000}
	for gmv, want := range cases {
		if got := gmvBonus(gmv, tiers); got != want {
			t.Errorf("gmvBonus(%v) = %v, want %v", gmv, got, want)
		}
	}
}

func TestDailyBonus(t *testing.T) {
	days := map[string]int{"2026-11-01": 29, "2026-11-02": 30, "2026-11-03": 120}
	tiers := []dailyTier{{30, 100000}, {100, 1000000}}
	if got := dailyBonus(days, dailyBonusConfig{Accumulate: false, Tiers: tiers}); got != 100000+1000000 {
		t.Errorf("highest tier per day = %v", got)
	}
	if got := dailyBonus(days, dailyBonusConfig{Accumulate: true, Tiers: tiers}); got != 100000+(100000+1000000) {
		t.Errorf("accumulated tiers per day = %v", got)
	}
}

func TestComputePayrollFormula(t *testing.T) {
	s := bonusSettings{AttendanceAmount: 500000, QtyTiers: testQtyTiers, GMVTiers: []gmvTier{{300000, 1000000}}, Daily: dailyBonusConfig{Tiers: []dailyTier{{30, 100000}}}}
	// 3,500,000 base, 3 unpaid days -> 350,000 deducted (base / 30 per day); leave used = no attendance bonus
	b := computePayroll(3500000, attendanceCounts{Work: 25, Off: 4, Unpaid: 3, Leave: 1, DeductBonus: true}, 250, 310000, map[string]int{"2026-11-05": 40}, true, 200000, "Extra shift", s)
	if b.UnpaidDeduction != 350000 || b.AttendanceBonus != 0 {
		t.Fatalf("deduction %v, attendance bonus %v", b.UnpaidDeduction, b.AttendanceBonus)
	}
	if b.QtyBonus != 50000 || b.GMVBonus != 1000000 || b.DailyBonus != 100000 {
		t.Fatalf("qty %v gmv %v daily %v", b.QtyBonus, b.GMVBonus, b.DailyBonus)
	}
	if b.Bonus != 1150000 {
		t.Fatalf("bonus = %v", b.Bonus)
	}
	if want := 3500000.0 - 350000 + 1150000 + 200000; b.FinalSalary != want {
		t.Fatalf("final = %v, want %v", b.FinalSalary, want)
	}
	// Extra stays out of Bonus; an employee without a Host gets only the attendance bonus
	b2 := computePayroll(4000000, attendanceCounts{Work: 26, Off: 4}, 999, 999999, nil, false, -100000, "", s)
	if b2.Bonus != 500000 || b2.FinalSalary != 4000000+500000-100000 {
		t.Fatalf("no-host payroll: bonus %v final %v", b2.Bonus, b2.FinalSalary)
	}
}
