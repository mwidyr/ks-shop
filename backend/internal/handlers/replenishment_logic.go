package handlers

import "sort"

// Replenishment Planning alert rules (Replenishment Planning PDF). Everything here is pure so
// the classification can be unit tested without a database.

const (
	alertStockout = "stockout"
	alertRestock  = "restock"
	alertStagnant = "stagnant"
	alertOverdue  = "overdue"
)

// alertSeverity orders alert types for "Risk Priority" (lower = more severe).
var alertSeverity = map[string]int{alertStockout: 0, alertRestock: 1, alertStagnant: 2, alertOverdue: 3}

type replenishmentSettings struct {
	StockoutDays int `json:"stockout_days"`
	RestockDays  int `json:"restock_days"`
	StagnantDays int `json:"stagnant_days"`
}

var defaultReplenishmentSettings = replenishmentSettings{StockoutDays: 7, RestockDays: 28, StagnantDays: 14}

// valid reports whether the thresholds make sense: every window positive and Restock above Stockout.
func (s replenishmentSettings) valid() bool {
	return s.StockoutDays >= 1 && s.StagnantDays >= 1 && s.RestockDays > s.StockoutDays
}

// stockCoverage = available ÷ (sales30 ÷ 30), one decimal is applied by the caller for display.
// nil when there were no sales in 30 days; 0 when available <= 0 with recorded sales.
func stockCoverage(available, sales30 int) *float64 {
	if sales30 <= 0 {
		return nil
	}
	if available <= 0 {
		z := 0.0
		return &z
	}
	c := float64(available) / (float64(sales30) / 30.0)
	return &c
}

// classifyVariant returns the alerts of one colour/size. daysWithoutSales is nil when unknown;
// overdueDays > 0 means an open PO line is past its expected arrival date.
func classifyVariant(s replenishmentSettings, available, sales30 int, daysWithoutSales *int, overdueDays int) []string {
	alerts := []string{}
	if cov := stockCoverage(available, sales30); cov != nil {
		switch {
		case *cov <= float64(s.StockoutDays):
			alerts = append(alerts, alertStockout)
		case *cov <= float64(s.RestockDays):
			alerts = append(alerts, alertRestock)
		}
	}
	if available > 0 && daysWithoutSales != nil && *daysWithoutSales >= s.StagnantDays {
		alerts = append(alerts, alertStagnant)
	}
	if overdueDays > 0 {
		alerts = append(alerts, alertOverdue)
	}
	return alerts
}

func hasAlert(alerts []string, a string) bool {
	for _, x := range alerts {
		if x == a {
			return true
		}
	}
	return false
}

// sortAlerts puts alerts in severity order.
func sortAlerts(alerts []string) {
	sort.SliceStable(alerts, func(i, j int) bool { return alertSeverity[alerts[i]] < alertSeverity[alerts[j]] })
}

// covLess orders coverage ascending with "no coverage" (nil) last.
func covLess(a, b *float64) bool {
	if a == nil {
		return false
	}
	if b == nil {
		return true
	}
	return *a < *b
}
