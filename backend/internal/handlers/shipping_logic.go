package handlers

import (
	"regexp"
	"strings"
)

// ---- batch stage ----------------------------------------------------------------------------

// Processing stages of a batch (the earliest unresolved one is shown) and its two statuses.
const (
	stagePendingMatching = "pending_order_matching"
	stageAwaiting3PL     = "awaiting_3pl_shipment"
	stageShippedAwaiting = "shipped_awaiting_completion"
	stageClosed          = "closed"
	batchStatusPending   = "pending"
	batchStatusClosed    = "closed"
	statusNewOrder       = "pending" // DB value of "New" (not yet exported)
)

// batchCounts are the number of a batch's orders in each CURRENT order status. Every order is
// counted exactly once. New = in the batch but its shipping Excel was not exported yet.
type batchCounts struct {
	Total      int `json:"total"`
	New        int `json:"new"`
	Processing int `json:"processing"`
	Ready      int `json:"ready_to_ship"`
	Shipped    int `json:"shipped"`
	Completed  int `json:"completed"`
	Cancelled  int `json:"cancelled"`
	Returned   int `json:"returned"`
}

func (c *batchCounts) add(status string) {
	c.Total++
	switch status {
	case "pending":
		c.New++
	case "processing":
		c.Processing++
	case "ready_to_ship":
		c.Ready++
	case "shipped":
		c.Shipped++
	case "delivered":
		c.Completed++
	case "cancelled":
		c.Cancelled++
	case "return":
		c.Returned++
	}
}

// Unresolved is every order that has not reached a final status (completed / cancelled / returned).
func (c batchCounts) Unresolved() int { return c.New + c.Processing + c.Ready + c.Shipped }

// Stage is the earliest unresolved stage: an order still missing its platform match holds the whole
// batch at Pending Order Matching, then waiting for the 3PL, then waiting for final delivery.
func (c batchCounts) Stage() string {
	switch {
	case c.New+c.Processing > 0:
		return stagePendingMatching
	case c.Ready > 0:
		return stageAwaiting3PL
	case c.Shipped > 0:
		return stageShippedAwaiting
	}
	return stageClosed
}

// BatchStatus is Pending until every original order is completed, cancelled or returned.
func (c batchCounts) BatchStatus() string {
	if c.Unresolved() == 0 {
		return batchStatusClosed
	}
	return batchStatusPending
}

// ---- import parsing -------------------------------------------------------------------------

// importRecord is one normalised row of an uploaded Excel (parsed in the browser).
type importRecord struct {
	Row             int    `json:"row"`
	OrderNo         string `json:"order_no"`          // our ERP order number (7-11 商品備註 / FamilyMart 賣場名稱)
	PlatformOrderNo string `json:"platform_order_no"` // 7-11 CM... / FamilyMart 訂單編號
	ShippingNo      string `json:"shipping_no"`       // 7-11 配送單編號 G... / FamilyMart 寄件編號
	ResultText      string `json:"result_text"`       // 7-11 網頁匯入檢核結果說明
	Status          string `json:"status"`            // delivery files: completed | returned | cancelled
}

var successRe = regexp.MustCompile(`檢核通過`)
var platformNoRe = regexp.MustCompile(`([A-Za-z]{1,3}\d{6,})`)

// parse711Result reads a 網頁匯入檢核結果說明 cell: "檢核通過，訂單編號: CM2610168640520" is a success
// (the CM number may be absent), anything else is the platform's error text, kept verbatim.
func parse711Result(text string) (platformNo string, success bool) {
	text = strings.TrimSpace(text)
	if !successRe.MatchString(text) {
		return "", false
	}
	if i := strings.Index(text, "訂單編號"); i >= 0 {
		if m := platformNoRe.FindStringSubmatch(text[i:]); m != nil {
			return m[1], true
		}
	}
	return "", true
}

// readyAfterImport: whether an order, holding these identifiers, is verified and ready to ship.
// 7-ELEVEN needs the platform (CM) number - a missing shipping (G) number is only a warning.
// FamilyMart needs both numbers (the shipping number is obtained on the platform before the
// results come back). HCT needs the shipping number.
func readyAfterImport(provider, platformNo, shippingNo string) bool {
	switch provider {
	case "cvs_711":
		return platformNo != ""
	case "cvs_familymart":
		return platformNo != "" && shippingNo != ""
	case "courier":
		return shippingNo != ""
	}
	return false
}

// importKindProvider is the provider a file kind belongs to ("" = any).
var importKindProvider = map[string]string{
	"711_validation": "cvs_711",
	"711_export":     "cvs_711",
	"fm_result":      "cvs_familymart",
	"hct_result":     "courier",
	"3pl_shipment":   "",
	"delivery":       "",
}

// ---- order matching -------------------------------------------------------------------------

// candidateOrder is an ERP order that an import row's identifiers may refer to.
type candidateOrder struct {
	ID              int
	OrderNo         string
	PlatformOrderNo string
	ShippingNo      string
	Status          string
	GroupID         int // 0 = not in a merge group
	BatchID         int // 0 = not in a batch
	CreateResult    string
	Provider        string
}

// unitKey identifies the physical shipment an order belongs to: a merged group ships as one parcel
// and shares one identifier set, so its members are one unit.
func (c candidateOrder) unitKey() string {
	if c.GroupID != 0 {
		return "g" + itoa(c.GroupID)
	}
	return "o" + itoa(c.ID)
}

type orderIndex struct {
	byOrderNo, byPlatform, byShipping map[string][]candidateOrder
}

func newOrderIndex(cands []candidateOrder) orderIndex {
	idx := orderIndex{map[string][]candidateOrder{}, map[string][]candidateOrder{}, map[string][]candidateOrder{}}
	for _, c := range cands {
		idx.byOrderNo[c.OrderNo] = append(idx.byOrderNo[c.OrderNo], c)
		if c.PlatformOrderNo != "" {
			idx.byPlatform[c.PlatformOrderNo] = append(idx.byPlatform[c.PlatformOrderNo], c)
		}
		if c.ShippingNo != "" {
			idx.byShipping[c.ShippingNo] = append(idx.byShipping[c.ShippingNo], c)
		}
	}
	return idx
}

// matchResult: Unit holds the orders of the single matched shipment; Conflict is set when the row's
// identifiers point at different shipments (never guessed - flagged for manual review).
type matchResult struct {
	Unit     []candidateOrder
	Conflict bool
}

// match finds the single shipment a record refers to using every identifier it carries.
func (idx orderIndex) match(rec importRecord) matchResult {
	units := map[string][]candidateOrder{}
	var order []string
	collect := func(list []candidateOrder) {
		for _, c := range list {
			k := c.unitKey()
			if _, ok := units[k]; !ok {
				order = append(order, k)
			}
			units[k] = appendUnique(units[k], c)
		}
	}
	if rec.OrderNo != "" {
		collect(idx.byOrderNo[rec.OrderNo])
	}
	if rec.PlatformOrderNo != "" {
		collect(idx.byPlatform[rec.PlatformOrderNo])
	}
	if rec.ShippingNo != "" {
		collect(idx.byShipping[rec.ShippingNo])
	}
	switch len(order) {
	case 0:
		return matchResult{}
	case 1:
		return matchResult{Unit: units[order[0]]}
	}
	return matchResult{Conflict: true}
}

func appendUnique(list []candidateOrder, c candidateOrder) []candidateOrder {
	for _, x := range list {
		if x.ID == c.ID {
			return list
		}
	}
	return append(list, c)
}

// recordRef is the row's best identifier, used to de-duplicate and resolve import issues.
func recordRef(rec importRecord) string {
	for _, v := range []string{rec.OrderNo, rec.PlatformOrderNo, rec.ShippingNo} {
		if v != "" {
			return v
		}
	}
	return "row-" + itoa(rec.Row)
}

// mergeIdentifier decides how a stored identifier changes when an import supplies one:
// empty -> set, same -> unchanged, different -> conflict (never overwritten).
func mergeIdentifier(current, incoming string) (result string, changed, conflict bool) {
	switch {
	case incoming == "" || incoming == current:
		return current, false, false
	case current == "":
		return incoming, true, false
	}
	return current, false, true
}

// statusRank orders the forward path; imports may only move an order forward.
var statusRank = map[string]int{"pending": 0, "processing": 1, "ready_to_ship": 2, "shipped": 3, "delivered": 4}
