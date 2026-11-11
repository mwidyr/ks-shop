package handlers

import (
	"context"
	"fmt"
	"math"
	"time"

	"github.com/jackc/pgx/v5"
)

// qrow is the read-only slice of a pool / tx / storeDB that the wallet readers need.
type qrow interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// RewardSettings are the admin-editable numbers behind balance, points, referral and coupons.
type RewardSettings struct {
	WelcomeBalance         float64 `json:"welcome_balance"`
	WelcomeVoucherAmount   float64 `json:"welcome_voucher_amount"`
	WelcomeVoucherMinOrder float64 `json:"welcome_voucher_min_order"`
	WelcomeVoucherDays     int     `json:"welcome_voucher_days"`
	ReferralReward         float64 `json:"referral_reward"`
	ReferralFriendAmount   float64 `json:"referral_friend_amount"`
	ReferralFriendMinOrder float64 `json:"referral_friend_min_order"`
	ReferralFriendDays     int     `json:"referral_friend_days"`
	ReferralRewardLimit    int     `json:"referral_reward_limit"`
	PointsPer100           float64 `json:"points_per_100"`
	PointValue             float64 `json:"point_value"`
	BirthdayDiscountPct    float64 `json:"birthday_discount_pct"`
	RefundCreditBonusPct   float64 `json:"refund_credit_bonus_pct"`
}

func defaultRewardSettings() RewardSettings {
	return RewardSettings{WelcomeBalance: 100, WelcomeVoucherAmount: 150, WelcomeVoucherMinOrder: 1500, WelcomeVoucherDays: 30,
		ReferralReward: 50, ReferralFriendAmount: 50, ReferralFriendDays: 30, PointsPer100: 1, PointValue: 1, BirthdayDiscountPct: 10, RefundCreditBonusPct: 5}
}

func (h *MemberHandler) rewardSettings(ctx context.Context, db qrow) RewardSettings {
	s := defaultRewardSettings()
	_ = db.QueryRow(ctx, `
		SELECT welcome_balance, welcome_voucher_amount, welcome_voucher_min_order, welcome_voucher_days, referral_reward,
		       referral_friend_amount, referral_friend_min_order, referral_friend_days, referral_reward_limit,
		       points_per_100, point_value, birthday_discount_pct, refund_credit_bonus_pct FROM reward_settings WHERE id=1`).
		Scan(&s.WelcomeBalance, &s.WelcomeVoucherAmount, &s.WelcomeVoucherMinOrder, &s.WelcomeVoucherDays, &s.ReferralReward,
			&s.ReferralFriendAmount, &s.ReferralFriendMinOrder, &s.ReferralFriendDays, &s.ReferralRewardLimit,
			&s.PointsPer100, &s.PointValue, &s.BirthdayDiscountPct, &s.RefundCreditBonusPct)
	return s
}

// ledgerAdd appends a wallet entry. A non-empty reasonKey makes it idempotent (the same grant twice is ignored).
// It returns whether a row was written.
func (h *MemberHandler) ledgerAdd(ctx context.Context, db dbx, memberID int, kind string, amount float64, reason, reasonKey, note string, orderID *int) bool {
	if amount == 0 {
		return false
	}
	ct, err := db.Exec(ctx, `
		INSERT INTO member_ledger (member_id, kind, amount, reason, reason_key, note, order_id)
		VALUES ($1,$2,$3,$4,NULLIF($5,''),NULLIF($6,''),$7) ON CONFLICT DO NOTHING`, memberID, kind, amount, reason, reasonKey, note, orderID)
	return err == nil && ct.RowsAffected() > 0
}

// balances returns the member's wallet: balance in NT$, points.
func balancesOf(ctx context.Context, db qrow, memberID int) (balance float64, points int) {
	var p float64
	_ = db.QueryRow(ctx, `
		SELECT COALESCE(SUM(amount) FILTER (WHERE kind='balance'),0), COALESCE(SUM(amount) FILTER (WHERE kind='points'),0)
		FROM member_ledger WHERE member_id=$1`, memberID).Scan(&balance, &p)
	return balance, int(math.Round(p))
}

// WalletUse is how much of the member's wallet an order consumes.
type WalletUse struct {
	Balance     float64 `json:"balance"`
	Points      int     `json:"points"`
	PointsValue float64 `json:"points_value"`
}

func (w WalletUse) Total() float64 { return w.Balance + w.PointsValue }

// planWalletUse decides what to take from the wallet for a payable amount: balance first (NT$), then points
// converted at point_value, never more than payable and never more than the member holds.
func planWalletUse(payable, balance float64, points int, pointValue float64, useBalance, usePoints bool) WalletUse {
	var u WalletUse
	left := math.Floor(payable)
	if left < 0 {
		left = 0
	}
	if useBalance && balance > 0 {
		u.Balance = math.Min(math.Floor(balance), left)
		left -= u.Balance
	}
	if usePoints && points > 0 && pointValue > 0 && left > 0 {
		need := int(math.Ceil(left / pointValue))
		if need > points {
			need = points
		}
		u.Points = need
		u.PointsValue = math.Min(float64(need)*pointValue, left)
	}
	return u
}

// earnPoints is the points granted for a delivered order's paid amount.
func earnPoints(paid, per100 float64) int {
	if paid <= 0 || per100 <= 0 {
		return 0
	}
	return int(math.Floor(paid / 100 * per100))
}

// ---- order lifecycle hooks (called from orders.go inside the status-change transaction) ----

// OrderDeliveredReward grants points for a delivered (Completed) order and runs the referral rules:
//   - the referred member's qualifying order pays the inviter's reward, or holds it until the inviter has a
//     Completed purchase of their own;
//   - an inviter's own Completed order releases the rewards held for them.
//
// The invited friend's side is a voucher given at sign-up (loginOrCreate), not paid here. All entries are keyed,
// so repeating the hook is harmless.
func OrderDeliveredReward(ctx context.Context, db dbx, orderID int) {
	h := &MemberHandler{}
	var memberID, customerID *int
	var paid float64
	if err := db.QueryRow(ctx, `
		SELECT o.member_id, o.customer_id,
		       COALESCE((SELECT SUM(oi.qty*oi.price_at_order) FROM order_items oi WHERE oi.order_id=o.id),0) - o.discount_amount - o.promotion_discount_amount + o.additional_amount
		FROM orders o WHERE o.id=$1`, orderID).Scan(&memberID, &customerID, &paid); err != nil {
		return
	}
	st := h.rewardSettings(ctx, db)
	// a purchase made through live / POS counts for the member linked to that customer, for releasing held rewards
	buyer := memberID
	if buyer == nil && customerID != nil {
		var mid int
		if db.QueryRow(ctx, `SELECT id FROM members WHERE customer_id=$1 ORDER BY id LIMIT 1`, *customerID).Scan(&mid) == nil {
			buyer = &mid
		}
	}
	if memberID != nil {
		if pts := earnPoints(paid, st.PointsPer100); pts > 0 {
			h.ledgerAdd(ctx, db, *memberID, "points", float64(pts), "order_earn", fmt.Sprintf("earn:%d", orderID), "", &orderID)
		}
		var referrer *int
		_ = db.QueryRow(ctx, `SELECT referred_by FROM members WHERE id=$1`, *memberID).Scan(&referrer)
		if referrer != nil {
			h.referralOnDelivered(ctx, db, *memberID, *referrer, orderID, paid, st)
		}
	}
	if buyer != nil {
		h.releasePendingReferrals(ctx, db, *buyer, orderID, st)
	}
}

// referralAction is the decision for one referred order: "skip" (nothing now), "hold" (inviter has no Completed
// purchase yet) or "pay".
func referralAction(st RewardSettings, orderPaid float64, blocked, referrerHasPurchase, limitReached bool) string {
	switch {
	case st.ReferralReward <= 0 || blocked || orderPaid < st.ReferralFriendMinOrder:
		return "skip"
	case limitReached:
		return "skip"
	case !referrerHasPurchase:
		return "hold"
	}
	return "pay"
}

// referralBlockedPair is true when staff flagged either side, or the two look like the same person (same linked
// customer, or the referred order ships to an address the inviter has also used).
func (h *MemberHandler) referralBlockedPair(ctx context.Context, db dbx, referred, referrer, orderID int) bool {
	var blocked bool
	_ = db.QueryRow(ctx, `
		SELECT EXISTS (SELECT 1 FROM members WHERE id IN ($1,$2) AND referral_blocked)
		    OR EXISTS (SELECT 1 FROM members a JOIN members b ON b.customer_id = a.customer_id WHERE a.id=$1 AND b.id=$2 AND a.customer_id IS NOT NULL)
		    OR EXISTS (SELECT 1 FROM orders ob JOIN orders oa ON oa.member_id=$2 AND oa.status NOT IN ('cancelled','return')
		               AND lower(btrim(oa.shipping_address)) = lower(btrim(ob.shipping_address))
		               WHERE ob.id=$3 AND btrim(COALESCE(ob.shipping_address,'')) <> '')`, referred, referrer, orderID).Scan(&blocked)
	return blocked
}

// memberHasCompletedPurchase: a Completed (delivered) order of the member, placed on the website or through the linked customer.
func memberHasCompletedPurchase(ctx context.Context, db dbx, memberID, currentOrderID int) bool {
	var ok bool
	_ = db.QueryRow(ctx, `
		SELECT EXISTS (SELECT 1 FROM orders o WHERE (o.status='delivered' OR o.id=$2)
		               AND (o.member_id=$1 OR o.customer_id = (SELECT customer_id FROM members WHERE id=$1)))`, memberID, currentOrderID).Scan(&ok)
	return ok
}

func referralLimitReached(ctx context.Context, db dbx, referrer int, st RewardSettings) bool {
	if st.ReferralRewardLimit <= 0 {
		return false
	}
	var n int
	_ = db.QueryRow(ctx, `SELECT COUNT(*) FROM member_ledger WHERE member_id=$1 AND reason='referral_bonus'`, referrer).Scan(&n)
	return n >= st.ReferralRewardLimit
}

// referralOnDelivered runs when an invited member's order is Completed.
func (h *MemberHandler) referralOnDelivered(ctx context.Context, db dbx, referred, referrer, orderID int, paid float64, st RewardSettings) {
	var done bool
	_ = db.QueryRow(ctx, `
		SELECT EXISTS (SELECT 1 FROM member_ledger WHERE member_id=$1 AND reason_key=$2)
		    OR EXISTS (SELECT 1 FROM referral_pending WHERE referred_id=$3)`, referrer, fmt.Sprintf("referral-from:%d", referred), referred).Scan(&done)
	if done {
		return
	}
	blocked := h.referralBlockedPair(ctx, db, referred, referrer, orderID)
	switch referralAction(st, paid, blocked, memberHasCompletedPurchase(ctx, db, referrer, 0), referralLimitReached(ctx, db, referrer, st)) {
	case "pay":
		h.ledgerAdd(ctx, db, referrer, "balance", st.ReferralReward, "referral_bonus", fmt.Sprintf("referral-from:%d", referred), "", &orderID)
	case "hold":
		db.Exec(ctx, `INSERT INTO referral_pending (referred_id, referrer_id, order_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, referred, referrer, orderID)
	}
}

// releasePendingReferrals pays the rewards held for a member who has just completed a purchase.
func (h *MemberHandler) releasePendingReferrals(ctx context.Context, db dbx, referrer, currentOrderID int, st RewardSettings) {
	rows, err := db.Query(ctx, `SELECT referred_id, COALESCE(order_id,0) FROM referral_pending WHERE referrer_id=$1 ORDER BY created_at, referred_id`, referrer)
	if err != nil {
		return
	}
	type held struct{ referred, order int }
	var list []held
	for rows.Next() {
		var x held
		if rows.Scan(&x.referred, &x.order) == nil {
			list = append(list, x)
		}
	}
	rows.Close()
	for _, x := range list {
		if h.referralBlockedPair(ctx, db, x.referred, referrer, x.order) {
			continue // stays held; staff can lift the block
		}
		if st.ReferralReward > 0 && !referralLimitReached(ctx, db, referrer, st) {
			var oid *int
			if x.order > 0 {
				oid = &x.order
			}
			h.ledgerAdd(ctx, db, referrer, "balance", st.ReferralReward, "referral_bonus", fmt.Sprintf("referral-from:%d", x.referred), "", oid)
		}
		db.Exec(ctx, `DELETE FROM referral_pending WHERE referred_id=$1`, x.referred)
	}
}

// OrderCancelledRefund gives back the wallet an order used (cancelled before delivery) and takes back points it earned.
func OrderCancelledRefund(ctx context.Context, db dbx, orderID int) {
	h := &MemberHandler{}
	var memberID *int
	var bal, pv float64
	var pts int
	if err := db.QueryRow(ctx, `SELECT member_id, wallet_balance_used, wallet_points_used, wallet_points_value FROM orders WHERE id=$1`, orderID).Scan(&memberID, &bal, &pts, &pv); err != nil || memberID == nil {
		return
	}
	if bal > 0 {
		h.ledgerAdd(ctx, db, *memberID, "balance", bal, "order_refund", fmt.Sprintf("refund-bal:%d", orderID), "", &orderID)
	}
	if pts > 0 {
		h.ledgerAdd(ctx, db, *memberID, "points", float64(pts), "order_refund", fmt.Sprintf("refund-pts:%d", orderID), "", &orderID)
	}
	OrderEarnReverse(ctx, db, orderID)
}

// OrderEarnReverse removes the points a delivered order granted (return / cancel after delivery).
func OrderEarnReverse(ctx context.Context, db dbx, orderID int) {
	h := &MemberHandler{}
	var memberID *int
	var earned float64
	_ = db.QueryRow(ctx, `SELECT o.member_id, COALESCE((SELECT amount FROM member_ledger l WHERE l.member_id=o.member_id AND l.kind='points' AND l.reason_key='earn:'||o.id),0) FROM orders o WHERE o.id=$1`, orderID).Scan(&memberID, &earned)
	if memberID != nil && earned > 0 {
		h.ledgerAdd(ctx, db, *memberID, "points", -earned, "order_earn_reverse", fmt.Sprintf("earn-rev:%d", orderID), "", &orderID)
	}
}

// ---- member-bound coupons ----

// ensureBirthdayCoupon issues this year's birthday coupon (a percentage promotion bound to the member, valid
// during the birth month) the first time the member looks during that month.
func (h *MemberHandler) ensureBirthdayCoupon(ctx context.Context, db dbx, m *memberRow) {
	if m.Birthday == nil {
		return
	}
	now := time.Now().In(businessTZ)
	if int(now.Month()) != int(m.Birthday.Month()) {
		return
	}
	st := h.rewardSettings(ctx, db)
	if st.BirthdayDiscountPct <= 0 {
		return
	}
	code := fmt.Sprintf("BDAY-%d-%d", m.ID, now.Year())
	start := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, businessTZ)
	end := start.AddDate(0, 1, 0)
	db.Exec(ctx, `
		INSERT INTO promotions (code, type, value, min_order_amount, start_date, end_date, usage_limit, per_customer_limit, is_active, member_id)
		VALUES ($1,'percentage',$2,0,$3,$4,1,1,true,$5) ON CONFLICT (code) DO NOTHING`, code, st.BirthdayDiscountPct, start, end, m.ID)
	db.Exec(ctx, `INSERT INTO member_coupons (member_id, promotion_id) SELECT $1, id FROM promotions WHERE code=$2 ON CONFLICT DO NOTHING`, m.ID, code)
}
