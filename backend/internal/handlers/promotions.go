package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	appmw "ordermgmt/internal/middleware"
)

type PromotionHandler struct {
	DB *pgxpool.Pool
}

type promotionView struct {
	ID               int             `json:"id"`
	Code             *string         `json:"code"`
	Name             string          `json:"name"`
	Type             string          `json:"type"`
	Value            float64         `json:"value"`
	MinOrderAmount   float64         `json:"min_order_amount"`
	StartDate        *string         `json:"start_date"`
	EndDate          *string         `json:"end_date"`
	UsageLimit       *int            `json:"usage_limit"`
	PerCustomerLimit *int            `json:"per_customer_limit"`
	Combinable       bool            `json:"combinable"`
	IsActive         bool            `json:"is_active"`
	Audience         string          `json:"audience"`
	AutoApply        bool            `json:"auto_apply"`
	Config           json.RawMessage `json:"config"`
	UsageCount       int             `json:"usage_count"`
	CreatedAt        string          `json:"created_at"`
}

func (h *PromotionHandler) List(w http.ResponseWriter, r *http.Request) {
	rows, err := h.DB.Query(r.Context(), `
		SELECT p.id, p.code, COALESCE(p.name,''), p.type, p.value, p.min_order_amount, p.start_date, p.end_date,
		       p.usage_limit, p.per_customer_limit, p.combinable, p.is_active, p.audience, p.auto_apply, p.config::text, p.created_at,
		       COUNT(pr.id)
		FROM promotions p
		LEFT JOIN promotion_redemptions pr ON pr.promotion_id = p.id
		WHERE p.member_id IS NULL
		GROUP BY p.id
		ORDER BY p.created_at DESC`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch promotions")
		return
	}
	defer rows.Close()

	list := []promotionView{}
	for rows.Next() {
		var p promotionView
		var start, end *time.Time
		var createdAt time.Time
		var cfg string
		if err := rows.Scan(&p.ID, &p.Code, &p.Name, &p.Type, &p.Value, &p.MinOrderAmount, &start, &end,
			&p.UsageLimit, &p.PerCustomerLimit, &p.Combinable, &p.IsActive, &p.Audience, &p.AutoApply, &cfg, &createdAt, &p.UsageCount); err != nil {
			continue
		}
		p.Config = json.RawMessage(cfg)
		p.CreatedAt = createdAt.Format(time.RFC3339)
		if start != nil {
			v := start.Format(time.RFC3339)
			p.StartDate = &v
		}
		if end != nil {
			v := end.Format(time.RFC3339)
			p.EndDate = &v
		}
		list = append(list, p)
	}
	respondJSON(w, http.StatusOK, list)
}

type promotionRequest struct {
	Code             *string         `json:"code"`
	Name             string          `json:"name"`
	Type             string          `json:"type"`
	Value            float64         `json:"value"`
	MinOrderAmount   float64         `json:"min_order_amount"`
	StartDate        *string         `json:"start_date"`
	EndDate          *string         `json:"end_date"`
	UsageLimit       *int            `json:"usage_limit"`
	PerCustomerLimit *int            `json:"per_customer_limit"`
	Combinable       bool            `json:"combinable"`
	IsActive         *bool           `json:"is_active"`
	Audience         string          `json:"audience"`
	AutoApply        bool            `json:"auto_apply"`
	Config           json.RawMessage `json:"config"`
}

var validPromotionTypes = map[string]bool{"fixed_amount": true, "percentage": true, "free_shipping": true, "buy_a_get_b": true, "addon": true, "combo": true}

func validMatcher(m promoMatcher) bool {
	n := 0
	for _, id := range m.ProductIDs {
		if id <= 0 {
			return false
		}
		n++
	}
	for _, c := range m.Colors {
		if strings.TrimSpace(c) == "" {
			return false
		}
		n++
	}
	for _, s := range m.SKUs {
		if tplKey(s) == "" {
			return false
		}
		n++
	}
	return n > 0
}

// validatePromoConfig checks the rules of a product promotion; "" = fine.
func validatePromoConfig(typ string, c promoConfig) string {
	switch typ {
	case "buy_a_get_b":
		if !validMatcher(c.Trigger) {
			return "choose the products, colors or SKUs of A"
		}
		if len(c.Gifts) == 0 {
			return "choose at least one gift product B"
		}
		for _, g := range c.Gifts {
			if g.VariantID <= 0 {
				return "invalid gift product"
			}
		}
		if c.TriggerQty < 0 || c.GiftQty < 0 || c.MaxSets < 0 {
			return "quantities cannot be negative"
		}
	case "addon":
		if !validMatcher(c.Trigger) || !validMatcher(c.Addon) {
			return "choose the products, colors or SKUs of A and B"
		}
		if c.AddonPrice < 0 {
			return "add-on price cannot be negative"
		}
		if c.TriggerQty < 0 || c.MaxQty < 0 {
			return "quantities cannot be negative"
		}
	case "combo":
		if !validMatcher(c.Pool) {
			return "choose the products, colors or SKUs of the combo"
		}
		if c.RequiredQty < 2 {
			return "a combo needs a quantity of at least 2"
		}
		if c.ComboPrice <= 0 {
			return "combo price must be a positive amount"
		}
		if c.MaxSets < 0 {
			return "max sets cannot be negative"
		}
	}
	return ""
}

func validatePromotionRequest(req promotionRequest) string {
	if !validPromotionTypes[req.Type] {
		return "unknown promotion type"
	}
	if req.Audience != "public" && req.Audience != "cs_only" {
		return "audience must be public or cs_only"
	}
	product := req.Type == "buy_a_get_b" || req.Type == "addon" || req.Type == "combo"
	hasCode := req.Code != nil && strings.TrimSpace(*req.Code) != ""
	if !product && !hasCode && req.Audience == "public" {
		return "code is required"
	}
	if (product || req.Audience == "cs_only") && strings.TrimSpace(req.Name) == "" {
		return "name is required"
	}
	if len(req.Name) > 120 {
		return "name is too long"
	}
	if product && req.Audience == "public" && !req.AutoApply {
		return "a public product promotion must be automatic (no code to enter)"
	}
	if req.AutoApply && !product {
		return "only product promotions can be automatic"
	}
	if req.Type == "percentage" && (req.Value <= 0 || req.Value > 100) {
		return "percentage value must be between 0 and 100"
	}
	if req.Type == "fixed_amount" && req.Value <= 0 {
		return "value must be a positive amount"
	}
	if req.MinOrderAmount < 0 {
		return "min_order_amount cannot be negative"
	}
	if req.UsageLimit != nil && *req.UsageLimit <= 0 {
		return "usage_limit must be positive when set"
	}
	if req.PerCustomerLimit != nil && *req.PerCustomerLimit <= 0 {
		return "per_customer_limit must be positive when set"
	}
	if product {
		var c promoConfig
		if len(req.Config) == 0 || json.Unmarshal(req.Config, &c) != nil {
			return "invalid promotion rules"
		}
		return validatePromoConfig(req.Type, c)
	}
	return ""
}

// promoConfigJSON is what is stored: the rules of a product promotion, {} for a coupon.
func promoConfigJSON(req promotionRequest) string {
	if req.Type == "buy_a_get_b" || req.Type == "addon" || req.Type == "combo" {
		var c promoConfig
		_ = json.Unmarshal(req.Config, &c)
		b, _ := json.Marshal(c)
		return string(b)
	}
	return "{}"
}

func normalizedCode(req promotionRequest) *string {
	if req.Code == nil || strings.TrimSpace(*req.Code) == "" {
		return nil
	}
	c := strings.ToUpper(strings.TrimSpace(*req.Code))
	return &c
}

func (h *PromotionHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req promotionRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Audience == "" {
		req.Audience = "public"
	}
	if msg := validatePromotionRequest(req); msg != "" {
		respondError(w, http.StatusBadRequest, msg)
		return
	}
	code := normalizedCode(req)
	ctx := r.Context()

	if code != nil {
		var exists bool
		h.DB.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM promotions WHERE code=$1)`, *code).Scan(&exists)
		if exists {
			respondError(w, http.StatusBadRequest, "this code is already in use")
			return
		}
	}

	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}
	claims := appmw.GetClaims(r)

	var id int
	if err := h.DB.QueryRow(ctx, `
		INSERT INTO promotions (code, name, type, value, min_order_amount, start_date, end_date, usage_limit, per_customer_limit, combinable, is_active, created_by, audience, auto_apply, config)
		VALUES ($1,NULLIF($2,''),$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb) RETURNING id`,
		code, strings.TrimSpace(req.Name), req.Type, req.Value, req.MinOrderAmount, req.StartDate, req.EndDate,
		req.UsageLimit, req.PerCustomerLimit, req.Combinable, isActive, claims.UserID, req.Audience, req.AutoApply, promoConfigJSON(req)).Scan(&id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create promotion")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]int{"id": id})
}

func (h *PromotionHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid promotion id")
		return
	}
	var req promotionRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Audience == "" {
		req.Audience = "public"
	}
	if msg := validatePromotionRequest(req); msg != "" {
		respondError(w, http.StatusBadRequest, msg)
		return
	}
	code := normalizedCode(req)
	ctx := r.Context()

	if code != nil {
		var exists bool
		h.DB.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM promotions WHERE code=$1 AND id!=$2)`, *code, id).Scan(&exists)
		if exists {
			respondError(w, http.StatusBadRequest, "this code is already in use")
			return
		}
	}

	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	ct, err := h.DB.Exec(ctx, `
		UPDATE promotions SET code=$1, name=NULLIF($2,''), type=$3, value=$4, min_order_amount=$5, start_date=$6, end_date=$7,
		       usage_limit=$8, per_customer_limit=$9, combinable=$10, is_active=$11, audience=$12, auto_apply=$13, config=$14::jsonb
		WHERE id=$15`,
		code, strings.TrimSpace(req.Name), req.Type, req.Value, req.MinOrderAmount, req.StartDate, req.EndDate,
		req.UsageLimit, req.PerCustomerLimit, req.Combinable, isActive, req.Audience, req.AutoApply, promoConfigJSON(req), id)
	if err != nil || ct.RowsAffected() == 0 {
		respondError(w, http.StatusNotFound, "promotion not found")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// Delete deactivates a promotion rather than removing it - redemption history must stay intact
// for reporting even after a campaign is retired.
func (h *PromotionHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid promotion id")
		return
	}
	ct, err := h.DB.Exec(r.Context(), `UPDATE promotions SET is_active=false WHERE id=$1`, id)
	if err != nil || ct.RowsAffected() == 0 {
		respondError(w, http.StatusNotFound, "promotion not found")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ---- preview + list for the order pages ----

type promoPreviewRequest struct {
	Items []struct {
		VariantID int `json:"variant_id"`
		Qty       int `json:"qty"`
	} `json:"items"`
	CustomerID    *int           `json:"customer_id"`
	Code          string         `json:"code"`
	PromotionIDs  []int          `json:"promotion_ids"`
	ExcludedIDs   []int          `json:"excluded_ids"`
	GiftChoices   map[string]int `json:"gift_choices"`
	PickupChainID int            `json:"pickup_chain_id"`
	OrderID       int            `json:"order_id"` // preview for an existing order: its saved items and prices are used
}

func (r promoPreviewRequest) selection() (promoSelection, []promoItem) {
	items := make([]promoItem, 0, len(r.Items))
	for _, it := range r.Items {
		if it.Qty > 0 {
			items = append(items, promoItem{it.VariantID, it.Qty})
		}
	}
	return promoSelection{Code: r.Code, PickedIDs: r.PromotionIDs, ExcludedIDs: r.ExcludedIDs, GiftChoice: giftChoices(r.GiftChoices), Staff: true}, items
}

// giftChoices turns the JSON object {"<promotion id>": <variant id>} into a map.
func giftChoices(in map[string]int) map[int]int {
	out := map[int]int{}
	for k, v := range in {
		if id, err := strconv.Atoi(k); err == nil {
			out[id] = v
		}
	}
	return out
}

// Validate is the read-only preview CS sees on the order pages: the same engine as order creation, but nothing is
// written, so repeated previews never consume a usage limit.
func (h *PromotionHandler) Validate(w http.ResponseWriter, r *http.Request) {
	var req promoPreviewRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	sel, items := req.selection()
	ctx := r.Context()
	if req.OrderID > 0 {
		items, sel.LinePrice = nil, map[int]float64{}
		var cust *int
		var chain int
		if h.DB.QueryRow(ctx, `SELECT customer_id, pickup_chain_id FROM orders WHERE id=$1`, req.OrderID).Scan(&cust, &chain) != nil {
			respondError(w, http.StatusNotFound, "order not found")
			return
		}
		req.CustomerID, req.PickupChainID = cust, chain
		if rows, err := h.DB.Query(ctx, `SELECT variant_id, qty, price_at_order FROM order_items WHERE order_id=$1 AND NOT is_gift`, req.OrderID); err == nil {
			for rows.Next() {
				var it promoItem
				var price float64
				if rows.Scan(&it.VariantID, &it.Qty, &price) == nil {
					items = append(items, it)
					if _, ok := sel.LinePrice[it.VariantID]; !ok {
						sel.LinePrice[it.VariantID] = price
					}
				}
			}
			rows.Close()
		}
	}
	if len(items) == 0 {
		respondJSON(w, http.StatusOK, map[string]interface{}{"applied": []appliedPromo{}, "gifts": []promoGift{}, "discount": 0, "free_shipping": false})
		return
	}
	fee := 0.0
	if req.PickupChainID > 0 {
		lines, sub, err := loadPromoLines(ctx, h.DB, items, sel.LinePrice)
		if err != nil {
			respondError(w, http.StatusBadRequest, "variant not found")
			return
		}
		_ = lines
		fee, _ = ComputeShippingFee(ctx, h.DB, req.PickupChainID, sub, false)
	}
	out, _, subtotal, errMsg, err := resolvePromotions(ctx, h.DB, items, sel, req.CustomerID, 0, fee)
	if err != nil {
		respondError(w, http.StatusBadRequest, "variant not found")
		return
	}
	if out.Applied == nil {
		out.Applied = []appliedPromo{}
	}
	if out.Gifts == nil {
		out.Gifts = []promoGift{}
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"applied": out.Applied, "gifts": out.Gifts, "discount": out.Discount, "free_shipping": out.FreeShipping,
		"notes": out.Notes, "error": errMsg, "subtotal": subtotal,
	})
}

type availablePromo struct {
	ID         int          `json:"id"`
	Code       string       `json:"code,omitempty"`
	Name       string       `json:"name"`
	Type       string       `json:"type"`
	Value      float64      `json:"value"`
	Min        float64      `json:"min_order_amount"`
	Audience   string       `json:"audience"`
	AutoApply  bool         `json:"auto_apply"`
	Combinable bool         `json:"combinable"`
	Gifts      []giftOption `json:"gifts,omitempty"`
}

type giftOption struct {
	VariantID int    `json:"variant_id"`
	Name      string `json:"name"`
}

// Available lists what CS can pick on an order page: every promotion that is active, inside its dates and not used up.
func (h *PromotionHandler) Available(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	defs, err := loadPromoDefs(ctx, h.DB, `p.is_active AND p.member_id IS NULL
		AND (p.start_date IS NULL OR p.start_date <= now()) AND (p.end_date IS NULL OR p.end_date >= now())
		AND (p.usage_limit IS NULL OR (SELECT COUNT(*) FROM promotion_redemptions rd WHERE rd.promotion_id = p.id) < p.usage_limit)`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch promotions")
		return
	}
	meta := loadGiftMeta(ctx, h.DB, defs)
	out := []availablePromo{}
	for _, p := range defs {
		a := availablePromo{ID: p.ID, Code: p.Code, Name: p.label(), Type: p.Type, Value: p.Value, Min: p.MinOrder, Audience: p.Audience, AutoApply: p.AutoApply, Combinable: p.Combinable}
		for _, g := range p.Config.Gifts {
			if m, ok := meta[g.VariantID]; ok {
				a.Gifts = append(a.Gifts, giftOption{g.VariantID, m.Name})
			}
		}
		out = append(out, a)
	}
	respondJSON(w, http.StatusOK, out)
}
