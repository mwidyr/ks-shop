package handlers

import "time"

// Keep-order date modes. The stored keep_date is whatever the customer picked; keep_date_type says
// what that date means:
//   - shipping: ship on that date, exportable in the Shipping Workbench 1 day before it.
//   - delivery: expected delivery date; ship 3 days earlier, exportable 4 days before it.
const (
	keepTypeShipping = "shipping"
	keepTypeDelivery = "delivery"

	keepShippingExportLead = 1
	keepDeliveryTransit    = 3
	keepDeliveryExportLead = keepDeliveryTransit + 1
)

func validKeepType(t string) bool { return t == keepTypeShipping || t == keepTypeDelivery }

// keepDates returns the day the parcel ships and the first day it may be exported.
func keepDates(date time.Time, keepType string) (ship, exportFrom time.Time) {
	if keepType == keepTypeDelivery {
		return date.AddDate(0, 0, -keepDeliveryTransit), date.AddDate(0, 0, -keepDeliveryExportLead)
	}
	return date, date.AddDate(0, 0, -keepShippingExportLead)
}

// keepHeldSQL is the SQL twin of keepDates for table alias `a`: true while the order is still held
// back, given today's date (Taiwan calendar) as the parameter `today` (a $n placeholder, a date).
// Keep the offsets in sync with the constants above.
func keepHeldSQL(a, today string) string {
	return `(` + a + `.keep_date IS NOT NULL AND ` + a + `.keep_date - (CASE ` + a + `.keep_date_type WHEN 'delivery' THEN 4 ELSE 1 END) > ` + today + `::date)`
}
