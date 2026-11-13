package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	appmw "ordermgmt/internal/middleware"
)

type orderPromotionsRequest struct {
	Code                 string         `json:"code"`
	PromotionIDs         []int          `json:"promotion_ids"`
	ExcludedPromotionIDs []int          `json:"excluded_promotion_ids"`
	GiftChoices          map[string]int `json:"gift_choices"`
	Reason               string         `json:"reason"`
}

// orderPromoSel is what decides the promotions of an existing order.
type orderPromoSel struct {
	Code     string
	Picked   []int
	Excluded []int
	Gift     map[string]int
	Reason   string
	// Lenient: a promotion that can no longer be used (expired, used up, minimum not met) is simply dropped instead of
	// failing the whole save. Used when the order's items change, so an old promotion never blocks an edit.
	Lenient bool
}

// applyOrderPromotions decides the promotions of an order again from scratch with the one engine, against the prices
// saved on the order, and replaces its usage records, gifts, discount and (free-shipping) fee. The caller holds the
// transaction and has locked the order. A non-empty message (with an HTTP status) means nothing was applied.
func applyOrderPromotions(ctx context.Context, tx pgx.Tx, orderID int, sel orderPromoSel, userID *int) (promoOutcome, int, string) {
	var customerID *int
	var memberID *int
	var chainID int
	var inGroup bool
	if err := tx.QueryRow(ctx, `
		SELECT o.customer_id, o.member_id, o.pickup_chain_id, EXISTS (SELECT 1 FROM order_shipment_group_members gm WHERE gm.order_id = o.id)
		FROM orders o WHERE o.id=$1`, orderID).Scan(&customerID, &memberID, &chainID, &inGroup); err != nil {
		return promoOutcome{}, http.StatusNotFound, "order not found"
	}
	var prevFree bool
	_ = tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM promotion_redemptions pr JOIN promotions p ON p.id = pr.promotion_id WHERE pr.order_id=$1 AND p.type='free_shipping')`, orderID).Scan(&prevFree)

	// start from the order as the customer bought it: no promotions, no gifts
	if _, err := tx.Exec(ctx, `DELETE FROM promotion_redemptions WHERE order_id=$1`, orderID); err != nil {
		return promoOutcome{}, http.StatusInternalServerError, "failed to update promotions"
	}
	if _, err := tx.Exec(ctx, `DELETE FROM order_items WHERE order_id=$1 AND is_gift`, orderID); err != nil {
		return promoOutcome{}, http.StatusInternalServerError, "failed to update promotions"
	}
	var items []promoItem
	prices := map[int]float64{}
	subtotal := 0.0
	rows, err := tx.Query(ctx, `SELECT variant_id, qty, price_at_order FROM order_items WHERE order_id=$1`, orderID)
	if err != nil {
		return promoOutcome{}, http.StatusInternalServerError, "failed to read order"
	}
	for rows.Next() {
		var it promoItem
		var price float64
		if rows.Scan(&it.VariantID, &it.Qty, &price) == nil {
			items = append(items, it)
			if _, ok := prices[it.VariantID]; !ok {
				prices[it.VariantID] = price
			}
			subtotal += price * float64(it.Qty)
		}
	}
	rows.Close()

	baseFee, _ := ComputeShippingFee(ctx, tx, chainID, subtotal, false)
	out := promoOutcome{}
	if len(items) > 0 {
		var msg string
		var perr error
		out, _, _, msg, perr = resolvePromotions(ctx, tx, items, promoSelection{
			Code: sel.Code, PickedIDs: sel.Picked, ExcludedIDs: sel.Excluded,
			GiftChoice: giftChoices(sel.Gift), Staff: true, LinePrice: prices,
		}, customerID, ptrInt(memberID), baseFee)
		if perr != nil {
			return promoOutcome{}, http.StatusBadRequest, "variant not found"
		}
		if msg != "" && !sel.Lenient {
			return promoOutcome{}, http.StatusBadRequest, msg
		}
	}
	if msg := csReasonProblem(out, sel.Reason); msg != "" && !sel.Lenient {
		return promoOutcome{}, http.StatusBadRequest, msg
	}
	reason := sel.Reason
	if !promotionReasons[reason] {
		reason = ""
	}
	first, err := recordPromotions(ctx, tx, orderID, customerID, out, userID, reason)
	if err != nil {
		return promoOutcome{}, http.StatusInternalServerError, "failed to record promotion"
	}
	gifts, _ := json.Marshal(sel.Gift)
	if sel.Gift == nil {
		gifts = []byte("{}")
	}
	excluded := sel.Excluded
	if excluded == nil {
		excluded = []int{}
	}
	if _, err := tx.Exec(ctx, `UPDATE orders SET promotion_id=$2, promotion_discount_amount=$3, promotion_excluded=$4, promotion_gifts=$5::jsonb, updated_at=now() WHERE id=$1`,
		orderID, first, out.Discount, excluded, string(gifts)); err != nil {
		return promoOutcome{}, http.StatusInternalServerError, "failed to save promotions"
	}
	// shipping: a free-shipping promotion waives it; removing one restores the normal fee (an order merged into a
	// shipment group keeps its fee, the group fee holder carries it)
	if !inGroup {
		var err error
		switch {
		case out.FreeShipping:
			_, err = tx.Exec(ctx, `UPDATE orders SET shipping_fee=0, free_shipping_override=true WHERE id=$1`, orderID)
		case prevFree:
			_, err = tx.Exec(ctx, `UPDATE orders SET shipping_fee=$2, free_shipping_override=false WHERE id=$1`, orderID, baseFee)
		}
		if err != nil {
			return promoOutcome{}, http.StatusInternalServerError, "failed to update shipping fee"
		}
	}
	logActivity(ctx, tx, "order", orderID, "promotions_updated", userID, fmt.Sprintf("applied=%d discount=%.2f gifts=%d reason=%s", len(out.Applied), out.Discount, len(out.Gifts), reason))
	return out, 0, ""
}

// recomputeOrderPromotions keeps the promotions of an order in line with its items after Edit Order: the same
// choices CS made before (kept on the order and in the usage records) are decided again against the new items.
func recomputeOrderPromotions(ctx context.Context, tx pgx.Tx, orderID int, userID *int) (int, string) {
	sel := orderPromoSel{Lenient: true, Gift: map[string]int{}, Excluded: []int{}}
	var gifts string
	if err := tx.QueryRow(ctx, `SELECT promotion_excluded, promotion_gifts::text FROM orders WHERE id=$1`, orderID).Scan(&sel.Excluded, &gifts); err != nil {
		return http.StatusInternalServerError, "failed to read order promotions"
	}
	_ = json.Unmarshal([]byte(gifts), &sel.Gift)
	rows, err := tx.Query(ctx, `
		SELECT pr.promotion_id, COALESCE(pr.reason,'') FROM promotion_redemptions pr JOIN promotions p ON p.id = pr.promotion_id
		WHERE pr.order_id=$1 AND NOT p.auto_apply ORDER BY pr.id`, orderID)
	if err != nil {
		return http.StatusInternalServerError, "failed to read order promotions"
	}
	for rows.Next() {
		var id int
		var reason string
		if rows.Scan(&id, &reason) == nil {
			sel.Picked = append(sel.Picked, id)
			if sel.Reason == "" {
				sel.Reason = reason
			}
		}
	}
	rows.Close()
	_, status, msg := applyOrderPromotions(ctx, tx, orderID, sel, userID)
	return status, msg
}

// UpdatePromotions serves PUT /orders/{id}/promotions: CS changes the promotions of an order that has not started
// processing (private offer, after-sales service, compensation).
func (h *OrderHandler) UpdatePromotions(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid order id")
		return
	}
	var req orderPromotionsRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	ctx := r.Context()
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(ctx)

	var status string
	if err := tx.QueryRow(ctx, `SELECT status FROM orders WHERE id=$1 FOR UPDATE`, id).Scan(&status); err != nil {
		respondError(w, http.StatusNotFound, "order not found")
		return
	}
	if status != "pending" {
		respondError(w, http.StatusConflict, "promo hanya bisa diubah sebelum order masuk Processing (status saat ini: "+status+")")
		return
	}
	claims := appmw.GetClaims(r)
	var userID *int
	if claims != nil {
		userID = &claims.UserID
	}
	out, code, msg := applyOrderPromotions(ctx, tx, id, orderPromoSel{
		Code: req.Code, Picked: req.PromotionIDs, Excluded: req.ExcludedPromotionIDs, Gift: req.GiftChoices, Reason: req.Reason,
	}, userID)
	if msg != "" {
		respondError(w, code, msg)
		return
	}
	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "db commit failed")
		return
	}
	invalidateOrderCaches()
	if out.Applied == nil {
		out.Applied = []appliedPromo{}
	}
	if out.Gifts == nil {
		out.Gifts = []promoGift{}
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"applied": out.Applied, "gifts": out.Gifts, "discount": out.Discount, "free_shipping": out.FreeShipping})
}

func ptrInt(p *int) int {
	if p == nil {
		return 0
	}
	return *p
}
