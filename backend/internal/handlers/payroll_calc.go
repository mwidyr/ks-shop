package handlers

import (
	"math"
	"sort"
)

// Payroll rules (all salary / bonus amounts are IDR, GMV targets are TWD):
//   Final Salary = Base Salary - Unpaid Leave Deductions + Attendance Bonus + QTY Bonus + GMV Bonus + Daily Bonus + Extra
// Extra is a manual adjustment and is never part of Daily Bonus or any automatic bonus.

type qtyTier struct {
	Min  int     `json:"min"`
	Max  *int    `json:"max"` // nil = no upper limit
	Rate float64 `json:"rate"`
}

type gmvTier struct {
	Min   float64 `json:"min"`
	Bonus float64 `json:"bonus"`
}

type dailyTier struct {
	Qty   int     `json:"qty"`
	Bonus float64 `json:"bonus"`
}

type dailyBonusConfig struct {
	Accumulate bool        `json:"accumulate"` // several tiers reached on one day: all of them (true) or only the highest (false)
	Tiers      []dailyTier `json:"tiers"`
}

type bonusSettings struct {
	AttendanceAmount float64          `json:"attendance_amount"`
	QtyTiers         []qtyTier        `json:"qty_tiers"`
	GMVTiers         []gmvTier        `json:"gmv_tiers"`
	Daily            dailyBonusConfig `json:"daily"`
}

// attendanceCounts is one employee's month of attendance, already counted from the schedule.
type attendanceCounts struct {
	Work        int  `json:"work"`
	Off         int  `json:"off"`
	Unpaid      int  `json:"unpaid"`
	Leave       int  `json:"leave"`
	DeductBonus bool `json:"deduct_bonus"` // at least one day used a status with "Deduct Attendance Bonus"
}

type payrollBreakdown struct {
	BaseSalary      float64 `json:"base_salary"`
	WorkDays        int     `json:"work_days"`
	OffDays         int     `json:"off_days"`
	UnpaidDays      int     `json:"unpaid_days"`
	LeaveDays       int     `json:"leave_days"`
	UnpaidDeduction float64 `json:"unpaid_deduction"`
	AttendanceBonus float64 `json:"attendance_bonus"`
	Qty             int     `json:"qty"` // the linked Host's monthly sales quantity
	GMV             float64 `json:"gmv"` // ... and sales amount (TWD)
	QtyBonus        float64 `json:"qty_bonus"`
	GMVBonus        float64 `json:"gmv_bonus"`
	DailyBonus      float64 `json:"daily_bonus"`
	Bonus           float64 `json:"bonus"` // Attendance + QTY + GMV + Daily
	Extra           float64 `json:"extra"`
	ExtraNote       string  `json:"extra_note"`
	FinalSalary     float64 `json:"final_salary"`
}

// qtyBonus: once the monthly quantity reaches a tier, ALL items are paid at that tier's rate.
// The tier is the matching one with the highest minimum.
func qtyBonus(qty int, tiers []qtyTier) float64 {
	best := -1
	for i, t := range tiers {
		if qty >= t.Min && (t.Max == nil || qty <= *t.Max) && (best < 0 || t.Min > tiers[best].Min) {
			best = i
		}
	}
	if best < 0 {
		return 0
	}
	return float64(qty) * tiers[best].Rate
}

// gmvBonus: only the highest achieved tier is paid (tiers are not added together).
func gmvBonus(gmv float64, tiers []gmvTier) float64 {
	bonus := 0.0
	bestMin := -1.0
	for _, t := range tiers {
		if gmv >= t.Min && t.Min > bestMin {
			bestMin, bonus = t.Min, t.Bonus
		}
	}
	return bonus
}

// dailyBonus adds up each day's reward. With Accumulate every tier reached that day counts, otherwise only the highest.
func dailyBonus(qtyByDay map[string]int, cfg dailyBonusConfig) float64 {
	tiers := append([]dailyTier(nil), cfg.Tiers...)
	sort.Slice(tiers, func(i, j int) bool { return tiers[i].Qty < tiers[j].Qty })
	total := 0.0
	for _, q := range qtyByDay {
		var reached []dailyTier
		for _, t := range tiers {
			if t.Qty > 0 && q >= t.Qty {
				reached = append(reached, t)
			}
		}
		if len(reached) == 0 {
			continue
		}
		if cfg.Accumulate {
			for _, t := range reached {
				total += t.Bonus
			}
		} else {
			total += reached[len(reached)-1].Bonus
		}
	}
	return total
}

// computePayroll builds the whole breakdown. hasHost is false for employees not linked to a Host: they have no
// sales, so only the attendance bonus applies.
func computePayroll(base float64, att attendanceCounts, qty int, gmv float64, qtyByDay map[string]int, hasHost bool, extra float64, note string, s bonusSettings) payrollBreakdown {
	b := payrollBreakdown{
		BaseSalary: base, WorkDays: att.Work, OffDays: att.Off, UnpaidDays: att.Unpaid, LeaveDays: att.Leave,
		Extra: extra, ExtraNote: note,
	}
	b.UnpaidDeduction = math.Round(base / 30 * float64(att.Unpaid))
	if !att.DeductBonus {
		b.AttendanceBonus = s.AttendanceAmount
	}
	if hasHost {
		b.Qty, b.GMV = qty, gmv
		b.QtyBonus = math.Round(qtyBonus(qty, s.QtyTiers))
		b.GMVBonus = gmvBonus(gmv, s.GMVTiers)
		b.DailyBonus = dailyBonus(qtyByDay, s.Daily)
	}
	b.Bonus = b.AttendanceBonus + b.QtyBonus + b.GMVBonus + b.DailyBonus
	b.FinalSalary = b.BaseSalary - b.UnpaidDeduction + b.Bonus + b.Extra
	return b
}
