package handlers

import (
	"sort"
	"strings"
	"time"
)

// Promotion engine. ONE place decides which promotions apply to a cart, so the website checkout, Create Order and
// Edit Order always agree. evaluatePromotions is a pure function (no database): the callers load the candidate
// promotions and the cart (see promo_db.go) and record the outcome.
//
// Order of application: product promotions (Buy A Get B, Add-on, Combo) -> order discounts (coupons) -> free shipping.
// Promotions that allow stacking all apply together. A promotion that does not allow stacking only applies alone, and
// the engine picks whichever result is best for the customer: "all stackable promotions" or one non-stackable promotion.
// A unit of a product is used by at most one product promotion.

type promoMatcher struct {
	ProductIDs []int    `json:"product_ids"`
	Colors     []string `json:"colors"`
	SKUs       []string `json:"skus"`
}

type promoGiftOpt struct {
	VariantID int `json:"variant_id"`
}

// promoConfig holds the rules of a product promotion; only the fields of its own type are used.
type promoConfig struct {
	// buy_a_get_b: buy TriggerQty of Trigger, get GiftQty of one of Gifts free (the first is the default, CS may swap).
	Trigger    promoMatcher   `json:"trigger"`
	TriggerQty int            `json:"trigger_qty"`
	Gifts      []promoGiftOpt `json:"gifts"`
	GiftQty    int            `json:"gift_qty"`
	MaxSets    int            `json:"max_sets"` // 0 = no limit (buy_a_get_b and combo)
	// addon: Addon units cost AddonPrice while Trigger is bought (TriggerQty of A unlock one B), at most MaxQty of them.
	Addon      promoMatcher `json:"addon"`
	AddonPrice float64      `json:"addon_price"`
	MaxQty     int          `json:"max_qty"` // 0 = no limit
	// combo: RequiredQty units from Pool cost ComboPrice together; Distinct = they must be different variants.
	Pool        promoMatcher `json:"pool"`
	RequiredQty int          `json:"required_qty"`
	ComboPrice  float64      `json:"combo_price"`
	Distinct    bool         `json:"distinct"`
}

type promoDef struct {
	ID          int
	Code        string
	Name        string
	Type        string // fixed_amount | percentage | free_shipping | buy_a_get_b | addon | combo
	Value       float64
	MinOrder    float64
	Combinable  bool
	Audience    string
	AutoApply   bool
	UsageLimit  *int
	PerCustomer *int
	StartDate   *time.Time
	EndDate     *time.Time
	IsActive    bool
	MemberID    *int
	Config      promoConfig
}

func (p promoDef) isProduct() bool {
	return p.Type == "buy_a_get_b" || p.Type == "addon" || p.Type == "combo"
}

func (p promoDef) label() string {
	if strings.TrimSpace(p.Name) != "" {
		return p.Name
	}
	return p.Code
}

type promoLine struct {
	VariantID int
	ProductID int
	SKU       string
	Color     string
	Qty       int
	Price     float64
}

type giftMeta struct {
	Price float64
	Name  string
}

type promoGift struct {
	PromotionID int     `json:"promotion_id"`
	VariantID   int     `json:"variant_id"`
	Qty         int     `json:"qty"`
	Name        string  `json:"name,omitempty"`
	Value       float64 `json:"value"` // what the gift would cost, for display only (the item is saved at price 0)
}

type appliedPromo struct {
	PromotionID  int     `json:"promotion_id"`
	Label        string  `json:"label"`
	Type         string  `json:"type"`
	Discount     float64 `json:"discount"` // cash discount (a gift is not counted here, its item is free)
	GiftValue    float64 `json:"gift_value,omitempty"`
	FreeShipping bool    `json:"free_shipping,omitempty"`
	CSOnly       bool    `json:"cs_only,omitempty"`
}

type promoInput struct {
	Lines       []promoLine
	Subtotal    float64     // cart subtotal before any promotion
	ShippingFee float64     // the fee a free-shipping promotion would waive (value only)
	GiftChoice  map[int]int // promotion id -> chosen gift variant
	CodePromoID int         // the promotion typed as a code, to explain when it is not used
}

type promoOutcome struct {
	Applied      []appliedPromo `json:"applied"`
	Gifts        []promoGift    `json:"gifts"`
	Discount     float64        `json:"discount"` // total cash discount
	FreeShipping bool           `json:"free_shipping"`
	Notes        []string       `json:"notes,omitempty"`
}

func (o promoOutcome) giftValue() float64 {
	v := 0.0
	for _, g := range o.Gifts {
		v += g.Value
	}
	return v
}

// ---- matching ----

func (m promoMatcher) matches(l promoLine) bool {
	for _, s := range m.SKUs {
		if tplKey(s) != "" && tplKey(s) == tplKey(l.SKU) {
			return true
		}
	}
	if len(m.ProductIDs) == 0 && len(m.Colors) == 0 {
		return false
	}
	if len(m.ProductIDs) > 0 {
		ok := false
		for _, id := range m.ProductIDs {
			ok = ok || id == l.ProductID
		}
		if !ok {
			return false
		}
	}
	if len(m.Colors) > 0 {
		ok := false
		for _, c := range m.Colors {
			ok = ok || strings.EqualFold(strings.TrimSpace(c), strings.TrimSpace(l.Color))
		}
		if !ok {
			return false
		}
	}
	return true
}

// unit is one piece of a cart line.
type promoUnit struct {
	variantID int
	price     float64
	other     bool // also matches the other side of the same promotion (add-on)
}

func roundMoney(v float64) float64 { return float64(int64(v*100+0.5*sign(v))) / 100 }
func sign(v float64) float64 {
	if v < 0 {
		return -1
	}
	return 1
}

type promoEffect struct {
	discount  float64
	giftValue float64
	gifts     []promoGift
	free      bool
	consumed  map[int]int // variant -> units used
}

func (e promoEffect) value(shippingFee float64) float64 {
	v := e.discount + e.giftValue
	if e.free {
		v += shippingFee
	}
	return v
}

func unitsOf(lines []promoLine, avail map[int]int, m promoMatcher, exclude promoMatcher, haveExclude bool) []promoUnit {
	var out []promoUnit
	for _, l := range lines {
		if !m.matches(l) {
			continue
		}
		other := haveExclude && exclude.matches(l)
		for i := 0; i < avail[l.VariantID]; i++ {
			out = append(out, promoUnit{l.VariantID, l.Price, other})
		}
	}
	return out
}

func sortPriceDesc(u []promoUnit) {
	sort.SliceStable(u, func(i, j int) bool { return u[i].price > u[j].price })
}

func takeCount(u []promoUnit, n int) map[int]int {
	c := map[int]int{}
	for i := 0; i < n && i < len(u); i++ {
		c[u[i].variantID]++
	}
	return c
}

func mergeConsumed(a map[int]int, b map[int]int) map[int]int {
	if a == nil {
		a = map[int]int{}
	}
	for k, v := range b {
		a[k] += v
	}
	return a
}

// effectOf is what one promotion would do to the cart given the units still free (avail) and the running order
// subtotal (for coupons). It never changes its inputs.
func effectOf(p promoDef, in promoInput, avail map[int]int, runSubtotal float64, gifts map[int]giftMeta) promoEffect {
	switch p.Type {
	case "fixed_amount":
		d := p.Value
		if d > runSubtotal {
			d = runSubtotal
		}
		return promoEffect{discount: roundMoney(d)}
	case "percentage":
		return promoEffect{discount: roundMoney(runSubtotal * p.Value / 100)}
	case "free_shipping":
		return promoEffect{free: true}
	case "buy_a_get_b":
		return buyAGetBEffect(p, in, avail, gifts)
	case "addon":
		return addonEffect(p, in, avail)
	case "combo":
		return comboEffect(p, in, avail)
	}
	return promoEffect{}
}

func buyAGetBEffect(p promoDef, in promoInput, avail map[int]int, gifts map[int]giftMeta) promoEffect {
	c := p.Config
	tq := c.TriggerQty
	if tq < 1 {
		tq = 1
	}
	gq := c.GiftQty
	if gq < 1 {
		gq = 1
	}
	if len(c.Gifts) == 0 {
		return promoEffect{}
	}
	a := unitsOf(in.Lines, avail, c.Trigger, promoMatcher{}, false)
	sets := len(a) / tq
	if c.MaxSets > 0 && sets > c.MaxSets {
		sets = c.MaxSets
	}
	if sets < 1 {
		return promoEffect{}
	}
	gv := c.Gifts[0].VariantID
	if pick, ok := in.GiftChoice[p.ID]; ok {
		for _, g := range c.Gifts {
			if g.VariantID == pick {
				gv = pick
			}
		}
	}
	meta, ok := gifts[gv]
	if !ok {
		return promoEffect{}
	}
	sortPriceDesc(a)
	// the cheapest units are the ones "spent" on the trigger, the customer keeps their best-value pieces for other promos
	sort.SliceStable(a, func(i, j int) bool { return a[i].price < a[j].price })
	qty := sets * gq
	return promoEffect{
		gifts:     []promoGift{{PromotionID: p.ID, VariantID: gv, Qty: qty, Name: meta.Name, Value: roundMoney(meta.Price * float64(qty))}},
		giftValue: roundMoney(meta.Price * float64(qty)),
		consumed:  takeCount(a, sets*tq),
	}
}

func addonEffect(p promoDef, in promoInput, avail map[int]int) promoEffect {
	c := p.Config
	tq := c.TriggerQty
	if tq < 1 {
		tq = 1
	}
	aUnits := unitsOf(in.Lines, avail, c.Trigger, c.Addon, true)
	bUnits := unitsOf(in.Lines, avail, c.Addon, c.Trigger, true)
	// A units that are not also add-on candidates are spent first, so a shared product never counts twice
	sort.SliceStable(aUnits, func(i, j int) bool {
		if aUnits[i].other != aUnits[j].other {
			return !aUnits[i].other
		}
		return aUnits[i].price < aUnits[j].price
	})
	sortPriceDesc(bUnits)
	for k := min(len(aUnits)/tq, len(bUnits)); k >= 1; k-- {
		if c.MaxQty > 0 && k > c.MaxQty {
			continue
		}
		aTaken := takeCount(aUnits, k*tq)
		// B units still free after A took its share
		left := map[int]int{}
		for _, u := range bUnits {
			left[u.variantID]++
		}
		for v, n := range aTaken {
			left[v] -= n
		}
		var b []promoUnit
		for _, u := range bUnits {
			if left[u.variantID] > 0 {
				b = append(b, u)
				left[u.variantID]--
			}
		}
		if len(b) < k {
			continue
		}
		d := 0.0
		for _, u := range b[:k] {
			if u.price > c.AddonPrice {
				d += u.price - c.AddonPrice
			}
		}
		if d <= 0 {
			return promoEffect{}
		}
		return promoEffect{discount: roundMoney(d), consumed: mergeConsumed(aTaken, takeCount(b, k))}
	}
	return promoEffect{}
}

func comboEffect(p promoDef, in promoInput, avail map[int]int) promoEffect {
	c := p.Config
	n := c.RequiredQty
	if n < 2 {
		return promoEffect{}
	}
	pool := unitsOf(in.Lines, avail, c.Pool, promoMatcher{}, false)
	sortPriceDesc(pool)
	discount := 0.0
	var used []promoUnit
	sets := 0
	for {
		if c.MaxSets > 0 && sets >= c.MaxSets {
			break
		}
		var set []promoUnit
		if c.Distinct {
			seen := map[int]bool{}
			var rest []promoUnit
			for _, u := range pool {
				if len(set) < n && !seen[u.variantID] {
					seen[u.variantID] = true
					set = append(set, u)
				} else {
					rest = append(rest, u)
				}
			}
			if len(set) < n {
				break
			}
			pool = rest
		} else {
			if len(pool) < n {
				break
			}
			set, pool = pool[:n], pool[n:]
		}
		sum := 0.0
		for _, u := range set {
			sum += u.price
		}
		if sum-c.ComboPrice <= 0 {
			break
		}
		discount += sum - c.ComboPrice
		used = append(used, set...)
		sets++
	}
	if sets == 0 {
		return promoEffect{}
	}
	return promoEffect{discount: roundMoney(discount), consumed: takeCount(used, len(used))}
}

// ---- stacking ----

func (p promoDef) stage() int {
	switch {
	case p.isProduct():
		return 1
	case p.Type == "free_shipping":
		return 3
	}
	return 2
}

func freshAvail(lines []promoLine) map[int]int {
	a := map[int]int{}
	for _, l := range lines {
		a[l.VariantID] += l.Qty
	}
	return a
}

// applyPromos applies the given promotions in stage order and returns the combined result.
func applyPromos(in promoInput, list []promoDef, gifts map[int]giftMeta) promoOutcome {
	var out promoOutcome
	avail := freshAvail(in.Lines)
	// product promotions: the biggest saving first, so a unit goes where it is worth most
	sorted := append([]promoDef(nil), list...)
	sort.SliceStable(sorted, func(i, j int) bool {
		if sorted[i].stage() != sorted[j].stage() {
			return sorted[i].stage() < sorted[j].stage()
		}
		if sorted[i].stage() == 1 {
			vi := effectOf(sorted[i], in, freshAvail(in.Lines), in.Subtotal, gifts).value(in.ShippingFee)
			vj := effectOf(sorted[j], in, freshAvail(in.Lines), in.Subtotal, gifts).value(in.ShippingFee)
			return vi > vj
		}
		return false
	})
	run := in.Subtotal
	for _, p := range sorted {
		if p.stage() != 1 && in.Subtotal < p.MinOrder {
			continue
		}
		e := effectOf(p, in, avail, run, gifts)
		if e.value(in.ShippingFee) <= 0 && !e.free {
			continue
		}
		for v, n := range e.consumed {
			avail[v] -= n
		}
		run -= e.discount
		if run < 0 {
			run = 0
		}
		out.Discount += e.discount
		out.Gifts = append(out.Gifts, e.gifts...)
		if e.free {
			out.FreeShipping = true
		}
		out.Applied = append(out.Applied, appliedPromo{PromotionID: p.ID, Label: p.label(), Type: p.Type, Discount: e.discount, GiftValue: e.giftValue, FreeShipping: e.free})
	}
	out.Discount = roundMoney(out.Discount)
	return out
}

func (o promoOutcome) benefit(shippingFee float64) float64 {
	v := o.Discount + o.giftValue()
	if o.FreeShipping {
		v += shippingFee
	}
	return v
}

// evaluatePromotions picks the promotions that apply. cands must already have passed the eligibility checks
// (active, dates, usage limits, audience).
func evaluatePromotions(in promoInput, cands []promoDef, gifts map[int]giftMeta) promoOutcome {
	var stack, alone []promoDef
	for _, p := range cands {
		if p.Combinable {
			stack = append(stack, p)
		} else {
			alone = append(alone, p)
		}
	}
	best := applyPromos(in, stack, gifts)
	for _, p := range alone {
		if o := applyPromos(in, []promoDef{p}, gifts); o.benefit(in.ShippingFee) > best.benefit(in.ShippingFee) {
			best = o
		}
	}
	if in.CodePromoID > 0 {
		used := false
		for _, a := range best.Applied {
			used = used || a.PromotionID == in.CodePromoID
		}
		if !used {
			best.Notes = append(best.Notes, "code_not_used")
		}
	}
	return best
}
