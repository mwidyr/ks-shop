package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
)

// Database side of the promotion engine: loading the cart and the candidate promotions, the eligibility checks
// (active, dates, usage limits, audience) and recording what was applied to an order.

const promoCols = `p.id, COALESCE(p.code,''), COALESCE(p.name,''), p.type, p.value, p.min_order_amount, p.combinable, p.audience,
	p.auto_apply, p.usage_limit, p.per_customer_limit, p.start_date, p.end_date, p.is_active, p.member_id, p.config::text`

type promoItem struct {
	VariantID int
	Qty       int
}

// promoSelection is what the caller asks for on top of the automatic promotions.
type promoSelection struct {
	Code        string      // a coupon code typed by the customer or CS
	PickedIDs   []int       // promotions CS picked from the list (staff only)
	ExcludedIDs []int       // automatic promotions CS removed from this order (staff only)
	GiftChoice  map[int]int // promotion id -> chosen gift variant (staff only)
	Staff       bool
	LinePrice   map[int]float64 // Edit Order: the prices saved on the order, so a later price change cannot alter its promotions
}

func loadPromoDefs(ctx context.Context, db storeDB, where string, args ...any) ([]promoDef, error) {
	rows, err := db.Query(ctx, `SELECT `+promoCols+` FROM promotions p WHERE `+where+` ORDER BY p.id`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []promoDef
	for rows.Next() {
		var p promoDef
		var raw string
		if err := rows.Scan(&p.ID, &p.Code, &p.Name, &p.Type, &p.Value, &p.MinOrder, &p.Combinable, &p.Audience,
			&p.AutoApply, &p.UsageLimit, &p.PerCustomer, &p.StartDate, &p.EndDate, &p.IsActive, &p.MemberID, &raw); err != nil {
			return nil, err
		}
		_ = json.Unmarshal([]byte(raw), &p.Config)
		out = append(out, p)
	}
	return out, rows.Err()
}

// loadPromoLines (prices: the saved prices of an existing order, else the current ones) reads the real price / product / SKU / colour of every cart variant (never client values).
func loadPromoLines(ctx context.Context, db storeDB, items []promoItem, prices map[int]float64) ([]promoLine, float64, error) {
	var lines []promoLine
	idx := map[int]int{}
	sub := 0.0
	for _, it := range items {
		if i, ok := idx[it.VariantID]; ok {
			lines[i].Qty += it.Qty
			sub += lines[i].Price * float64(it.Qty)
			continue
		}
		var l promoLine
		l.VariantID, l.Qty = it.VariantID, it.Qty
		if err := db.QueryRow(ctx, `SELECT pv.product_id, COALESCE(pv.sku,''), COALESCE(pv.color,''), pv.price FROM product_variants pv WHERE pv.id=$1`,
			it.VariantID).Scan(&l.ProductID, &l.SKU, &l.Color, &l.Price); err != nil {
			return nil, 0, fmt.Errorf("variant %d not found", it.VariantID)
		}
		if p, ok := prices[it.VariantID]; ok {
			l.Price = p
		}
		idx[it.VariantID] = len(lines)
		lines = append(lines, l)
		sub += l.Price * float64(it.Qty)
	}
	return lines, sub, nil
}

func loadGiftMeta(ctx context.Context, db storeDB, defs []promoDef) map[int]giftMeta {
	out := map[int]giftMeta{}
	for _, p := range defs {
		if p.Type != "buy_a_get_b" {
			continue
		}
		for _, g := range p.Config.Gifts {
			var m giftMeta
			var color, size string
			if db.QueryRow(ctx, `
				SELECT pv.price, p.name, COALESCE(pv.color,''), COALESCE(pv.size,'')
				FROM product_variants pv JOIN products p ON p.id = pv.product_id
				WHERE pv.id=$1 AND pv.is_active AND p.is_active AND p.deleted_at IS NULL`, g.VariantID).Scan(&m.Price, &m.Name, &color, &size) == nil {
				if v := strings.Trim(strings.Join([]string{color, size}, " / "), " /"); v != "" {
					m.Name += " (" + v + ")"
				}
				out[g.VariantID] = m
			}
		}
	}
	return out
}

// promoUsable checks one promotion for this customer; "" = fine. Rows with a usage limit are locked so two orders
// racing for the last unit cannot both succeed (a harmless no-op outside a transaction).
func promoUsable(ctx context.Context, db storeDB, p promoDef, customerID *int, memberID int, staff bool) string {
	if (p.MemberID != nil && *p.MemberID != memberID) || (p.Audience == "cs_only" && !staff) {
		return "promotion code not found"
	}
	if !p.IsActive {
		return "this promotion is not active"
	}
	now := time.Now()
	if p.StartDate != nil && now.Before(*p.StartDate) {
		return "this promotion is not active yet"
	}
	if p.EndDate != nil && now.After(*p.EndDate) {
		return "this promotion has expired"
	}
	if p.UsageLimit != nil {
		var lock int
		_ = db.QueryRow(ctx, `SELECT id FROM promotions WHERE id=$1 FOR UPDATE`, p.ID).Scan(&lock)
		var count int
		_ = db.QueryRow(ctx, `SELECT COUNT(*) FROM promotion_redemptions WHERE promotion_id=$1`, p.ID).Scan(&count)
		if count >= *p.UsageLimit {
			return "this promotion has reached its usage limit"
		}
	}
	if p.PerCustomer != nil && customerID != nil {
		var count int
		_ = db.QueryRow(ctx, `SELECT COUNT(*) FROM promotion_redemptions WHERE promotion_id=$1 AND customer_id=$2`, p.ID, *customerID).Scan(&count)
		if count >= *p.PerCustomer {
			return "this customer has already used this promotion the maximum number of times"
		}
	}
	return ""
}

// resolvePromotions is the one entry point of the engine for the website checkout, Create Order, Edit Order and the
// preview: it loads the cart, collects the automatic promotions plus the typed code and the ones CS picked, drops
// the ones that are not usable, and lets evaluatePromotions decide. errMsg is the reason a typed / picked promotion
// was refused (the rest of the outcome is still valid); err is a real failure.
func resolvePromotions(ctx context.Context, db storeDB, items []promoItem, sel promoSelection, customerID *int, memberID int, shippingFee float64) (promoOutcome, []promoLine, float64, string, error) {
	lines, subtotal, err := loadPromoLines(ctx, db, items, sel.LinePrice)
	if err != nil {
		return promoOutcome{}, nil, 0, "", err
	}
	excluded := map[int]bool{}
	if sel.Staff {
		for _, id := range sel.ExcludedIDs {
			excluded[id] = true
		}
	}
	seen := map[int]bool{}
	var cands []promoDef
	var firstErr string
	codePromo := 0
	add := func(p promoDef, explicit bool) {
		if seen[p.ID] {
			return
		}
		if msg := promoUsable(ctx, db, p, customerID, memberID, sel.Staff); msg != "" {
			if explicit && firstErr == "" {
				firstErr = msg
			}
			return
		}
		if explicit && !p.isProduct() && subtotal < p.MinOrder {
			if firstErr == "" {
				firstErr = fmt.Sprintf("order subtotal must be at least %.2f to use this code", p.MinOrder)
			}
			return
		}
		seen[p.ID] = true
		cands = append(cands, p)
	}
	if code := strings.ToUpper(strings.TrimSpace(sel.Code)); code != "" {
		defs, err := loadPromoDefs(ctx, db, `p.code = $1`, code)
		if err != nil {
			return promoOutcome{}, nil, 0, "", err
		}
		if len(defs) == 0 {
			firstErr = "promotion code not found"
		}
		for _, p := range defs {
			add(p, true)
			if seen[p.ID] {
				codePromo = p.ID
			}
		}
	}
	if sel.Staff && len(sel.PickedIDs) > 0 {
		defs, err := loadPromoDefs(ctx, db, `p.id = ANY($1)`, sel.PickedIDs)
		if err != nil {
			return promoOutcome{}, nil, 0, "", err
		}
		for _, p := range defs {
			add(p, true)
		}
	}
	auto, err := loadPromoDefs(ctx, db, `p.auto_apply AND p.is_active AND p.audience = 'public' AND p.member_id IS NULL AND p.type IN ('buy_a_get_b','addon','combo')`)
	if err != nil {
		return promoOutcome{}, nil, 0, "", err
	}
	for _, p := range auto {
		if !excluded[p.ID] {
			add(p, false)
		}
	}
	in := promoInput{Lines: lines, Subtotal: subtotal, ShippingFee: shippingFee, GiftChoice: sel.GiftChoice, CodePromoID: codePromo}
	if !sel.Staff {
		in.GiftChoice = nil
	}
	out := evaluatePromotions(in, cands, loadGiftMeta(ctx, db, cands))
	// remember which applied promotions are CS-only (they need a reason on the order)
	cs := map[int]bool{}
	for _, p := range cands {
		cs[p.ID] = p.Audience == "cs_only"
	}
	for i := range out.Applied {
		out.Applied[i].CSOnly = cs[out.Applied[i].PromotionID]
	}
	return out, lines, subtotal, firstErr, nil
}

type execDB interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

// recordPromotions saves what was applied: one redemption per promotion (usage record) and the free gifts as order
// items at price 0. Returns the id to keep in orders.promotion_id (the first applied one, or nil).
func recordPromotions(ctx context.Context, db execDB, orderID int, customerID *int, out promoOutcome, userID *int, reason string) (*int, error) {
	var first *int
	var reasonArg interface{}
	if reason != "" {
		reasonArg = reason
	}
	for _, a := range out.Applied {
		if first == nil {
			id := a.PromotionID
			first = &id
		}
		if _, err := db.Exec(ctx, `
			INSERT INTO promotion_redemptions (promotion_id, order_id, customer_id, discount_applied, applied_by, reason)
			VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (promotion_id, order_id) DO NOTHING`,
			a.PromotionID, orderID, customerID, a.Discount+a.GiftValue, userID, reasonArg); err != nil {
			return nil, err
		}
	}
	for _, g := range out.Gifts {
		if _, err := db.Exec(ctx, `
			INSERT INTO order_items (order_id, variant_id, qty, price_at_order, is_gift, promotion_id) VALUES ($1,$2,$3,0,true,$4)`,
			orderID, g.VariantID, g.Qty, g.PromotionID); err != nil {
			return nil, err
		}
	}
	return first, nil
}

// promotionReasons are the reasons CS can give when applying a CS-only promotion.
var promotionReasons = map[string]bool{"": true, "private_offer": true, "after_sales": true, "compensation": true}

// csReasonProblem: a CS-only promotion must say why it was used.
func csReasonProblem(out promoOutcome, reason string) string {
	if !promotionReasons[reason] {
		return "alasan promo tidak valid"
	}
	for _, a := range out.Applied {
		if a.CSOnly && reason == "" {
			return "alasan promo wajib dipilih untuk promo khusus CS"
		}
	}
	return ""
}
