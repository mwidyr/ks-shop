package handlers

import (
	"encoding/json"
	"testing"
)

func line(v, prod int, sku, color string, qty int, price float64) promoLine {
	return promoLine{VariantID: v, ProductID: prod, SKU: sku, Color: color, Qty: qty, Price: price}
}

func subtotalOf(ls []promoLine) float64 {
	s := 0.0
	for _, l := range ls {
		s += l.Price * float64(l.Qty)
	}
	return s
}

func input(ls ...promoLine) promoInput {
	return promoInput{Lines: ls, Subtotal: subtotalOf(ls), ShippingFee: 60}
}

func TestMatcher(t *testing.T) {
	l := line(1, 10, "C002-BLACK-FREE", "Black", 1, 100)
	if (promoMatcher{SKUs: []string{"c002black free"}}).matches(l) {
		t.Fatal("a space is not a hyphen")
	}
	if !(promoMatcher{SKUs: []string{"C002BLACKFREE"}}).matches(l) {
		t.Fatal("SKU match ignores hyphens and case")
	}
	if !(promoMatcher{ProductIDs: []int{10}}).matches(l) || (promoMatcher{ProductIDs: []int{11}}).matches(l) {
		t.Fatal("product match")
	}
	if !(promoMatcher{ProductIDs: []int{10}, Colors: []string{"black"}}).matches(l) || (promoMatcher{ProductIDs: []int{10}, Colors: []string{"white"}}).matches(l) {
		t.Fatal("product AND color")
	}
	if (promoMatcher{}).matches(l) {
		t.Fatal("an empty matcher matches nothing")
	}
}

func TestCouponStages(t *testing.T) {
	in := input(line(1, 10, "A", "Black", 2, 500)) // 1000
	fixed := promoDef{ID: 1, Type: "fixed_amount", Value: 100, Combinable: true}
	pct := promoDef{ID: 2, Type: "percentage", Value: 10, Combinable: true}
	free := promoDef{ID: 3, Type: "free_shipping", Combinable: true}
	o := evaluatePromotions(in, []promoDef{pct, fixed, free}, nil)
	// order discounts run in list order: 10% of 1000 = 100, then NT$100 off
	if o.Discount != 200 || !o.FreeShipping || len(o.Applied) != 3 {
		t.Fatalf("outcome: %+v", o)
	}
}

func TestMinOrderSkipsCoupon(t *testing.T) {
	in := input(line(1, 10, "A", "", 1, 500))
	o := evaluatePromotions(in, []promoDef{{ID: 1, Type: "fixed_amount", Value: 50, MinOrder: 1000, Combinable: true}}, nil)
	if o.Discount != 0 || len(o.Applied) != 0 {
		t.Fatalf("min order not met: %+v", o)
	}
}

func TestNonStackablePicksBest(t *testing.T) {
	in := input(line(1, 10, "A", "", 1, 1000))
	small := promoDef{ID: 1, Type: "fixed_amount", Value: 50, Combinable: true}
	big := promoDef{ID: 2, Type: "fixed_amount", Value: 300, Combinable: false}
	o := evaluatePromotions(in, []promoDef{small, big}, nil)
	if o.Discount != 300 || len(o.Applied) != 1 || o.Applied[0].PromotionID != 2 {
		t.Fatalf("the better non-stackable promotion must win: %+v", o)
	}
	big.Value = 20
	o = evaluatePromotions(in, []promoDef{small, big}, nil)
	if o.Discount != 50 || o.Applied[0].PromotionID != 1 {
		t.Fatalf("the stackable promotion is better here: %+v", o)
	}
}

func TestCodeNotUsedNote(t *testing.T) {
	in := input(line(1, 10, "A", "", 1, 1000))
	in.CodePromoID = 2
	o := evaluatePromotions(in, []promoDef{
		{ID: 1, Type: "fixed_amount", Value: 300, Combinable: false},
		{ID: 2, Type: "fixed_amount", Value: 50, Combinable: false},
	}, nil)
	if len(o.Notes) != 1 || o.Notes[0] != "code_not_used" {
		t.Fatalf("notes: %+v", o.Notes)
	}
}

func TestAddon(t *testing.T) {
	a := promoMatcher{ProductIDs: []int{10}}
	b := promoMatcher{ProductIDs: []int{20}}
	p := promoDef{ID: 1, Type: "addon", Combinable: true, Config: promoConfig{Trigger: a, Addon: b, AddonPrice: 100, MaxQty: 2}}
	// B alone: regular price
	if o := evaluatePromotions(input(line(2, 20, "B", "", 2, 300)), []promoDef{p}, nil); o.Discount != 0 {
		t.Fatalf("B without A stays regular: %+v", o)
	}
	// one A unlocks one B
	o := evaluatePromotions(input(line(1, 10, "A", "", 1, 500), line(2, 20, "B", "", 2, 300)), []promoDef{p}, nil)
	if o.Discount != 200 {
		t.Fatalf("one A, one B at 100: want 200 off, got %+v", o)
	}
	// three A, three B: limited to 2 discounted
	o = evaluatePromotions(input(line(1, 10, "A", "", 3, 500), line(2, 20, "B", "", 3, 300)), []promoDef{p}, nil)
	if o.Discount != 400 {
		t.Fatalf("limit of 2 add-ons: want 400, got %+v", o)
	}
	// add-on priced above the regular price never raises the total
	p.Config.AddonPrice = 999
	if o := evaluatePromotions(input(line(1, 10, "A", "", 1, 500), line(2, 20, "B", "", 1, 300)), []promoDef{p}, nil); o.Discount != 0 {
		t.Fatalf("no negative discount: %+v", o)
	}
}

func TestAddonSharedProduct(t *testing.T) {
	// A and B are the same product: one unit cannot be both
	m := promoMatcher{ProductIDs: []int{10}}
	p := promoDef{ID: 1, Type: "addon", Combinable: true, Config: promoConfig{Trigger: m, Addon: m, AddonPrice: 100}}
	if o := evaluatePromotions(input(line(1, 10, "A", "", 1, 500)), []promoDef{p}, nil); o.Discount != 0 {
		t.Fatalf("a single unit cannot unlock itself: %+v", o)
	}
	if o := evaluatePromotions(input(line(1, 10, "A", "", 2, 500)), []promoDef{p}, nil); o.Discount != 400 {
		t.Fatalf("two units: one is A, one is the add-on: %+v", o)
	}
}

func TestCombo(t *testing.T) {
	pool := promoMatcher{ProductIDs: []int{10}, Colors: []string{"Black", "White"}}
	p := promoDef{ID: 1, Type: "combo", Combinable: true, Config: promoConfig{Pool: pool, RequiredQty: 2, ComboPrice: 500, Distinct: true}}
	// Black + White: 300+300 -> 500
	o := evaluatePromotions(input(line(1, 10, "K", "Black", 1, 300), line(2, 10, "W", "White", 1, 300)), []promoDef{p}, nil)
	if o.Discount != 100 {
		t.Fatalf("combo: %+v", o)
	}
	// two Blacks are not a distinct combo
	if o := evaluatePromotions(input(line(1, 10, "K", "Black", 2, 300)), []promoDef{p}, nil); o.Discount != 0 {
		t.Fatalf("distinct combo needs different variants: %+v", o)
	}
	// without the Distinct flag two Blacks qualify
	p.Config.Distinct = false
	if o := evaluatePromotions(input(line(1, 10, "K", "Black", 2, 300)), []promoDef{p}, nil); o.Discount != 100 {
		t.Fatalf("any two: %+v", o)
	}
	// 3 units, sets of 2: one combo, the third pays full price
	if o := evaluatePromotions(input(line(1, 10, "K", "Black", 3, 300)), []promoDef{p}, nil); o.Discount != 100 {
		t.Fatalf("one set of 2 out of 3: %+v", o)
	}
	// a combo price above the sum never applies
	p.Config.ComboPrice = 700
	if o := evaluatePromotions(input(line(1, 10, "K", "Black", 2, 300)), []promoDef{p}, nil); o.Discount != 0 {
		t.Fatalf("combo dearer than the items: %+v", o)
	}
}

func TestBuyAGetB(t *testing.T) {
	gifts := map[int]giftMeta{7: {Price: 150, Name: "Socks"}, 8: {Price: 90, Name: "Hair clip"}}
	p := promoDef{ID: 1, Type: "buy_a_get_b", Combinable: true, Config: promoConfig{
		Trigger: promoMatcher{ProductIDs: []int{10}}, TriggerQty: 2, GiftQty: 1, Gifts: []promoGiftOpt{{7}, {8}}}}
	if o := evaluatePromotions(input(line(1, 10, "A", "", 1, 500)), []promoDef{p}, gifts); len(o.Gifts) != 0 {
		t.Fatalf("1 of 2 needed: %+v", o)
	}
	o := evaluatePromotions(input(line(1, 10, "A", "", 5, 500)), []promoDef{p}, gifts)
	if len(o.Gifts) != 1 || o.Gifts[0].VariantID != 7 || o.Gifts[0].Qty != 2 || o.Discount != 0 {
		t.Fatalf("5 A = 2 sets = 2 free gifts, the gift is free (no cash discount): %+v", o)
	}
	in := input(line(1, 10, "A", "", 2, 500))
	in.GiftChoice = map[int]int{1: 8}
	if o := evaluatePromotions(in, []promoDef{p}, gifts); o.Gifts[0].VariantID != 8 {
		t.Fatalf("CS swaps the gift: %+v", o.Gifts)
	}
	in.GiftChoice = map[int]int{1: 999} // not one of the allowed gifts
	if o := evaluatePromotions(in, []promoDef{p}, gifts); o.Gifts[0].VariantID != 7 {
		t.Fatalf("an unknown choice falls back to the default: %+v", o.Gifts)
	}
}

func TestProductPromotionsDoNotShareUnits(t *testing.T) {
	// the same two units cannot feed both a combo and an add-on
	pool := promoMatcher{ProductIDs: []int{10}}
	combo := promoDef{ID: 1, Type: "combo", Combinable: true, Config: promoConfig{Pool: pool, RequiredQty: 2, ComboPrice: 400}}
	addon := promoDef{ID: 2, Type: "addon", Combinable: true, Config: promoConfig{Trigger: pool, Addon: pool, AddonPrice: 100}}
	o := evaluatePromotions(input(line(1, 10, "A", "", 2, 300)), []promoDef{combo, addon}, nil)
	if len(o.Applied) != 1 {
		t.Fatalf("only one of them can use the two units: %+v", o)
	}
	// the add-on saves 200, the combo only 200 too (600-400): either is fine, never both
	if o.Discount != 200 {
		t.Fatalf("discount: %+v", o)
	}
}

func TestOrderOrderProductBeforeCoupon(t *testing.T) {
	// the percentage coupon is taken from the subtotal AFTER the combo discount
	pool := promoMatcher{ProductIDs: []int{10}}
	combo := promoDef{ID: 1, Type: "combo", Combinable: true, Config: promoConfig{Pool: pool, RequiredQty: 2, ComboPrice: 400}}
	pct := promoDef{ID: 2, Type: "percentage", Value: 10, Combinable: true}
	o := evaluatePromotions(input(line(1, 10, "A", "", 2, 300)), []promoDef{pct, combo}, nil) // 600 -> combo -200 -> 10% of 400
	if o.Discount != 240 || o.Applied[0].PromotionID != 1 {
		t.Fatalf("product discount first, then the coupon: %+v", o)
	}
}

func TestValidatePromotionRequest(t *testing.T) {
	code := func(s string) *string { return &s }
	cfg := func(c promoConfig) []byte { b, _ := json.Marshal(c); return b }
	ok := promoConfig{Pool: promoMatcher{ProductIDs: []int{1}}, RequiredQty: 2, ComboPrice: 500}
	cases := []struct {
		name string
		req  promotionRequest
		bad  bool
	}{
		{"public coupon", promotionRequest{Code: code("A"), Type: "fixed_amount", Value: 10, Audience: "public"}, false},
		{"public coupon needs a code", promotionRequest{Type: "fixed_amount", Value: 10, Audience: "public"}, true},
		{"cs-only coupon without code needs a name", promotionRequest{Type: "fixed_amount", Value: 10, Audience: "cs_only"}, true},
		{"cs-only coupon with name, no code", promotionRequest{Name: "Sorry gift", Type: "fixed_amount", Value: 10, Audience: "cs_only"}, false},
		{"auto combo", promotionRequest{Name: "Combo", Type: "combo", Audience: "public", AutoApply: true, Config: cfg(ok)}, false},
		{"public combo must be automatic", promotionRequest{Name: "Combo", Type: "combo", Audience: "public", Config: cfg(ok)}, true},
		{"cs-only combo is picked by CS", promotionRequest{Name: "Combo", Type: "combo", Audience: "cs_only", Config: cfg(ok)}, false},
		{"coupons cannot be automatic", promotionRequest{Code: code("A"), Type: "fixed_amount", Value: 10, Audience: "public", AutoApply: true}, true},
		{"combo needs 2 items", promotionRequest{Name: "C", Type: "combo", Audience: "public", AutoApply: true, Config: cfg(promoConfig{Pool: ok.Pool, RequiredQty: 1, ComboPrice: 5})}, true},
		{"combo needs a filter", promotionRequest{Name: "C", Type: "combo", Audience: "public", AutoApply: true, Config: cfg(promoConfig{RequiredQty: 2, ComboPrice: 5})}, true},
		{"gift needs a product", promotionRequest{Name: "G", Type: "buy_a_get_b", Audience: "public", AutoApply: true, Config: cfg(promoConfig{Trigger: ok.Pool})}, true},
		{"percentage over 100", promotionRequest{Code: code("A"), Type: "percentage", Value: 120, Audience: "public"}, true},
		{"unknown audience", promotionRequest{Code: code("A"), Type: "fixed_amount", Value: 10, Audience: "vip"}, true},
	}
	for _, c := range cases {
		if msg := validatePromotionRequest(c.req); (msg != "") != c.bad {
			t.Errorf("%s: message %q", c.name, msg)
		}
	}
}
