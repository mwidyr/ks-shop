package handlers

import (
	"sort"
	"time"
)

// Taiwan business time: customers and the warehouse are in Taiwan (UTC+8) even though the rest of
// the ERP runs on Jakarta time. Shipping batch eligibility is decided on the Taiwan calendar day.
var taipeiTZ = time.FixedZone("CST", 8*60*60)

// taipeiStartOfDay is 00:00 Taiwan time of the day containing t.
func taipeiStartOfDay(t time.Time) time.Time {
	t = t.In(taipeiTZ)
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, taipeiTZ)
}

// createdBeforeToday: only orders created before 00:00 Taiwan time today may be batched.
func createdBeforeToday(created, now time.Time) bool {
	return created.Before(taipeiStartOfDay(now))
}

type allocLine struct {
	VariantID int
	Qty       int
}

type allocOrder struct {
	Key     int       // the shipment row's primary order id
	Created time.Time // oldest first
	Lines   []allocLine
}

type allocShortage struct {
	VariantID int `json:"variant_id"`
	Need      int `json:"need"`
	Have      int `json:"have"`
}

// allocateOrders hands out the allocatable physical stock oldest order first. An order is
// allocated whole or not at all (no partial allocation); stock given to an order is no longer
// available to the next one, so two 7-unit orders never both fit into 10 units. `remaining` is
// consumed in place. The result maps every order Key to its shortages (empty = fully allocated).
func allocateOrders(orders []allocOrder, remaining map[int]int) map[int][]allocShortage {
	sorted := make([]allocOrder, len(orders))
	copy(sorted, orders)
	sort.SliceStable(sorted, func(i, j int) bool {
		if !sorted[i].Created.Equal(sorted[j].Created) {
			return sorted[i].Created.Before(sorted[j].Created)
		}
		return sorted[i].Key < sorted[j].Key
	})
	result := make(map[int][]allocShortage, len(orders))
	for _, o := range sorted {
		need := map[int]int{}
		for _, l := range o.Lines {
			need[l.VariantID] += l.Qty
		}
		var short []allocShortage
		for v, n := range need {
			if have := remaining[v]; have < n {
				short = append(short, allocShortage{VariantID: v, Need: n, Have: max(have, 0)})
			}
		}
		sort.Slice(short, func(i, j int) bool { return short[i].VariantID < short[j].VariantID })
		if len(short) == 0 {
			for v, n := range need {
				remaining[v] -= n
			}
		}
		result[o.Key] = short
	}
	return result
}

// exportProblems lists why a shipment row can't go into a batch (the carrier's import rules).
// It mirrors exportErrors in frontend/src/utils/exportRules.js - keep both in sync.
func exportProblems(row shippingExportRow) []string {
	var errs []string
	if trim(row.CustomerName) == "" {
		errs = append(errs, "name_missing")
	} else if exportNameUnits(row.CustomerName) > exportNameMaxUnits {
		errs = append(errs, "name_long")
	}
	if trim(row.OrderNo) == "" {
		errs = append(errs, "order_no")
	}
	if row.ChainType == "courier" {
		if !hctOrderNoValid(row.OrderNo) {
			errs = append(errs, "order_no")
		}
		if trim(row.ShippingAddress) == "" {
			errs = append(errs, "address_missing")
		} else if len([]rune(row.ShippingAddress)) > exportAddressMaxChar {
			errs = append(errs, "address_long")
		}
		if trim(row.CustomerPhone) == "" {
			errs = append(errs, "phone")
		}
	} else {
		if !cvsPhoneOK(row.CustomerPhone) {
			errs = append(errs, "phone")
		}
		if !isSixDigits(row.PickupStoreCode) {
			errs = append(errs, "store")
		}
	}
	if row.ItemValue+row.ShippingFee > exportTotalMax {
		errs = append(errs, "total")
	}
	return dedupeStrings(errs)
}
