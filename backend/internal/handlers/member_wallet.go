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
	PointsPer100           float64 `json:"points_per_100"`
	PointValue             float64 `json:"point_value"`
	BirthdayDiscountPct    float64 `json:"birthday_discount_pct"`
	RefundCreditBonusPct   float64 `json:"refund_credit_bonus_pct"`
}

func defaultRewardSettings() RewardSettings {
	return RewardSettings{WelcomeBalance: 100, WelcomeVoucherAmount: 150, WelcomeVoucherMinOrder: 1500, WelcomeVoucherDays: 30,
		ReferralReward: 50, PointsPer100: 1, PointValue: 1, BirthdayDiscountPct: 10, RefundCreditBonusPct: 5}
}

func (h *MemberHandler) rewardSettings(ctx context.Context, db qrow) RewardSettings {
	s := defaultRewardSettings()
	_ = db.QueryRow(ctx, `
		SELECT welcome_balance, welcome_voucher_amount, welcome_voucher_min_order, welcome_voucher_days, referral_reward,
		       points_per_100, point_value, birthday_discount_pct, refund_credit_bonus_pct FROM reward_settings WHERE id=1`).
		Scan(&s.WelcomeBalance, &s.WelcomeVoucherAmount, &s.WelcomeVoucherMinOrder, &s.WelcomeVoucherDays, &s.ReferralReward,
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

// OrderDeliveredReward grants points for a delivered order and, on the referred member's first delivered
// order, the referral reward to both people. All entries are keyed so repeating the hook is harmless.
func OrderDeliveredReward(ctx context.Context, db dbx, orderID int) {
	h := &MemberHandler{}
	var memberID *int
	var paid float64
	if err := db.QueryRow(ctx, `
		SELECT o.member_id,
		       COALESCE((SELECT SUM(oi.qty*oi.price_at_order) FROM order_items oi WHERE oi.order_id=o.id),0) - o.discount_amount - o.promotion_discount_amount + o.additional_amount
		FROM orders o WHERE o.id=$1`, orderID).Scan(&memberID, &paid); err != nil || memberID == nil {
		return
	}
	st := h.rewardSettings(ctx, db)
	if pts := earnPoints(paid, st.PointsPer100); pts > 0 {
		h.ledgerAdd(ctx, db, *memberID, "points", float64(pts), "order_earn", fmt.Sprintf("earn:%d", orderID), "", &orderID)
	}
	var referrer *int
	_ = db.QueryRow(ctx, `SELECT referred_by FROM members WHERE id=$1`, *memberID).Scan(&referrer)
	if referrer != nil && st.ReferralReward > 0 {
		// first reward wins: the key is per referred member, so a second delivered order never pays again
		if h.ledgerAdd(ctx, db, *memberID, "balance", st.ReferralReward, "referral_welcome", fmt.Sprintf("referral:%d", *memberID), "", &orderID) {
			h.ledgerAdd(ctx, db, *referrer, "balance", st.ReferralReward, "referral_bonus", fmt.Sprintf("referral-from:%d", *memberID), "", &orderID)
		}
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
