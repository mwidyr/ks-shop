package handlers

import (
	"context"
	"fmt"
	"math/rand"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// StorefrontHandler serves the public, no-login customer website (ralulu.com). Everything here is
// read-only catalog data plus guest checkout; staff-only data (cost, internal notes, other
// customers' orders) is never returned. Orders created here are tagged sales_channel='website'
// with no sales user, and go through the same pricing rules as staff-created orders (variant
// price from the DB, coupon via resolvePromotionByCode, shipping via ComputeShippingFee).
type StorefrontHandler struct {
	DB        *pgxpool.Pool
	JWTSecret string // to read an optional member session on quote / checkout
}

// memberFrom reads the optional member session (0 = guest checkout).
func (h *StorefrontHandler) memberFrom(r *http.Request) int {
	return (&MemberHandler{DB: h.DB, JWTSecret: h.JWTSecret}).memberIDFrom(r)
}

// ---- display helpers (localized like the admin: X-Lang, default Indonesian) ----

func storeColorSQL(r *http.Request, col string) string {
	switch requestLang(r) {
	case "":
		return "COALESCE((SELECT name_id FROM colors sc WHERE lower(btrim(sc.name_zh)) = lower(btrim(" + col + ")) OR lower(btrim(sc.name_id)) = lower(btrim(" + col + ")) ORDER BY (sc.name_zh = " + col + " OR sc.name_id = " + col + ") DESC LIMIT 1), " + col + ")"
	case "en":
		return "COALESCE((SELECT NULLIF(name_en,'') FROM colors sc WHERE lower(btrim(sc.name_zh)) = lower(btrim(" + col + ")) OR lower(btrim(sc.name_id)) = lower(btrim(" + col + ")) OR lower(btrim(sc.name_en)) = lower(btrim(" + col + ")) ORDER BY (sc.name_zh = " + col + " OR sc.name_id = " + col + ") DESC LIMIT 1), " + col + ")"
	case "zh":
		return "COALESCE((SELECT name_zh FROM colors sc WHERE lower(btrim(sc.name_zh)) = lower(btrim(" + col + ")) OR lower(btrim(sc.name_id)) = lower(btrim(" + col + ")) ORDER BY (sc.name_zh = " + col + " OR sc.name_id = " + col + ") DESC LIMIT 1), " + col + ")"
	}
	return col
}

func storeCategorySQL(r *http.Request, col string) string {
	switch requestLang(r) {
	case "":
		return "COALESCE((SELECT name_id FROM categories sc WHERE sc.name = " + col + " LIMIT 1), " + col + ")"
	case "zh":
		return "COALESCE((SELECT name_zh FROM categories sc WHERE sc.name = " + col + " LIMIT 1), " + col + ")"
	}
	return col
}

// sellableSQL is how many units of a variant can still be promised to a website customer:
// Available = Actual + Incoming - Ordered (customers may order before incoming stock arrives).
const sellableSQL = `(sb.available_stock + sb.incoming_stock - COALESCE((
	SELECT SUM(oi.qty) FROM order_items oi JOIN orders o ON o.id = oi.order_id
	WHERE oi.variant_id = pv.id AND o.status IN ` + orderedStatusesSQL + `), 0))`

// ---- catalog ----

type storeProduct struct {
	ID              int               `json:"id"`
	SKU             string            `json:"sku"`
	Name            string            `json:"name"`
	Category        string            `json:"category"`
	CategoryDisplay string            `json:"category_display"`
	Description     string            `json:"description"`
	Price           float64           `json:"price"`
	CompareAt       float64           `json:"compare_at"`
	Images          []string          `json:"images"`
	Colors          []string          `json:"colors"`
	InStock         bool              `json:"in_stock"`
	Sold            int               `json:"sold"`
	CreatedAt       string            `json:"created_at"`
	Variants        []storeVariant    `json:"variants,omitempty"`
	Measurements    map[string]string `json:"measurements,omitempty"`
	SizeChart       []sizeChartRow    `json:"size_chart,omitempty"` // #139; measurements is the legacy single set
	LiveCode        string            `json:"live_code,omitempty"`
	VideoURL        string            `json:"video_url,omitempty"`
	VideoPoster     string            `json:"video_poster_url,omitempty"`
	Hosts           []siteHostCard    `json:"hosts,omitempty"`
	Looks           []siteCard        `json:"looks,omitempty"`
	// Wear: what height/weight wore which size (from the hosts who show this product) - the basis of
	// the "recommended size" hint on the product page.
	Wear []storeWear `json:"wear,omitempty"`
}

type storeWear struct {
	Host     string `json:"host"`
	Slug     string `json:"slug"`
	HeightCM int    `json:"height_cm"`
	WeightKG int    `json:"weight_kg"`
	Size     string `json:"size"`
}

type storeVariant struct {
	ID        int     `json:"id"`
	SKU       string  `json:"sku"`
	Color     string  `json:"color"`
	Size      string  `json:"size"`
	Price     float64 `json:"price"`
	CompareAt float64 `json:"compare_at"`
	Stock     int     `json:"stock"`
}

// Products lists active products. Query: category, q, sort (newest|price_asc|price_desc|
// bestseller), sale=true, min_price, max_price, page, limit.
func (h *StorefrontHandler) Products(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	where := ` WHERE p.is_active AND p.deleted_at IS NULL
		AND EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.is_active)`
	args := []interface{}{}
	add := func(v interface{}) string { args = append(args, v); return "$" + strconv.Itoa(len(args)) }

	if c := q.Get("category"); c != "" {
		where += " AND p.category = " + add(c)
	}
	if s := strings.TrimSpace(q.Get("q")); s != "" {
		like := add("%" + s + "%")
		where += " AND (p.name ILIKE " + like + " OR p.names_search ILIKE " + like + " OR p.sku ILIKE " + like + " OR p.category ILIKE " + like + ")"
	}
	minExpr := `(SELECT MIN(v.price) FROM product_variants v WHERE v.product_id = p.id AND v.is_active)`
	if q.Get("live") == "true" {
		where += " AND p.live_code IS NOT NULL AND p.live_code <> ''"
	}
	if q.Get("sale") == "true" {
		where += ` AND EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.is_active AND v.compare_at_price > v.price)`
	}
	if v, err := strconv.ParseFloat(q.Get("min_price"), 64); err == nil && v > 0 {
		where += " AND " + minExpr + " >= " + add(v)
	}
	if v, err := strconv.ParseFloat(q.Get("max_price"), 64); err == nil && v > 0 {
		where += " AND " + minExpr + " <= " + add(v)
	}

	order := "p.id DESC"
	switch q.Get("sort") {
	case "price_asc":
		order = minExpr + " ASC, p.id DESC"
	case "price_desc":
		order = minExpr + " DESC, p.id DESC"
	case "bestseller":
		order = "sold DESC, p.id DESC"
	}

	limit, _ := strconv.Atoi(q.Get("limit"))
	if limit <= 0 || limit > 60 {
		limit = 24
	}
	page, _ := strconv.Atoi(q.Get("page"))
	if page < 1 {
		page = 1
	}

	var total int
	h.DB.QueryRow(r.Context(), `SELECT COUNT(*) FROM products p`+where, args...).Scan(&total)

	listArgs := append(append([]interface{}{}, args...), limit, (page-1)*limit)
	rows, err := h.DB.Query(r.Context(), `
		SELECT p.id, COALESCE(p.sku,''), `+productNameSQL(r, "p")+`, COALESCE(p.category,''), `+storeCategorySQL(r, "COALESCE(p.category,'')")+`,
		       COALESCE(p.description,''), p.created_at, COALESCE(p.live_code,''),
		       COALESCE(`+minExpr+`, 0),
		       COALESCE((SELECT v.compare_at_price FROM product_variants v WHERE v.product_id = p.id AND v.is_active ORDER BY v.price LIMIT 1), 0),
		       COALESCE((SELECT SUM(oi.qty) FROM order_items oi JOIN product_variants v ON v.id = oi.variant_id
		                 JOIN orders o ON o.id = oi.order_id
		                 WHERE v.product_id = p.id AND o.status NOT IN ('cancelled','return')), 0) AS sold
		FROM products p`+where+` ORDER BY `+order+` LIMIT $`+strconv.Itoa(len(args)+1)+` OFFSET $`+strconv.Itoa(len(args)+2), listArgs...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch products")
		return
	}
	defer rows.Close()

	products := []storeProduct{}
	ids := []int{}
	idx := map[int]int{}
	for rows.Next() {
		var p storeProduct
		var created time.Time
		if err := rows.Scan(&p.ID, &p.SKU, &p.Name, &p.Category, &p.CategoryDisplay, &p.Description, &created, &p.LiveCode, &p.Price, &p.CompareAt, &p.Sold); err != nil {
			continue
		}
		p.CreatedAt = created.Format(time.RFC3339)
		p.Images, p.Colors = []string{}, []string{}
		idx[p.ID] = len(products)
		ids = append(ids, p.ID)
		products = append(products, p)
	}
	rows.Close()

	if len(ids) > 0 {
		if irows, err := h.DB.Query(r.Context(), `SELECT product_id, url FROM product_images WHERE product_id = ANY($1) ORDER BY product_id, sort_order`, ids); err == nil {
			for irows.Next() {
				var pid int
				var u string
				if irows.Scan(&pid, &u) == nil {
					products[idx[pid]].Images = append(products[idx[pid]].Images, u)
				}
			}
			irows.Close()
		}
		if vrows, err := h.DB.Query(r.Context(), `
			SELECT pv.product_id, `+storeColorSQL(r, "pv.color")+`, `+sellableSQL+`
			FROM product_variants pv JOIN stock_buckets sb ON sb.variant_id = pv.id
			WHERE pv.product_id = ANY($1) AND pv.is_active ORDER BY pv.id`, ids); err == nil {
			seen := map[string]bool{}
			for vrows.Next() {
				var pid, stock int
				var color string
				if vrows.Scan(&pid, &color, &stock) != nil {
					continue
				}
				i := idx[pid]
				if stock > 0 {
					products[i].InStock = true
				}
				key := strconv.Itoa(pid) + "|" + color
				if color != "" && !seen[key] {
					seen[key] = true
					products[i].Colors = append(products[i].Colors, color)
				}
			}
			vrows.Close()
		}
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"products": products, "total": total, "page": page, "limit": limit,
	})
}

// Product returns one product with its active variants and sellable stock.
func (h *StorefrontHandler) Product(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid product id")
		return
	}
	var p storeProduct
	var created time.Time
	var bust, waist, length, bottom, elasticity, note string
	var lookIDs []int32
	err = h.DB.QueryRow(r.Context(), `
		SELECT p.id, COALESCE(p.sku,''), `+productNameSQL(r, "p")+`, COALESCE(p.category,''), `+storeCategorySQL(r, "COALESCE(p.category,'')")+`,
		       COALESCE(p.description,''), p.created_at,
		       COALESCE(p.measurement_bust,''), COALESCE(p.measurement_waist,''), COALESCE(p.measurement_length,''),
		       COALESCE(p.measurement_bottom_length,''), COALESCE(p.measurement_elasticity,''), COALESCE(p.measurement_note,''),
		       COALESCE(p.live_code,''), COALESCE(p.video_url,''), COALESCE(p.video_poster_url,''), p.complete_the_look
		FROM products p WHERE p.id=$1 AND p.is_active AND p.deleted_at IS NULL`, id).
		Scan(&p.ID, &p.SKU, &p.Name, &p.Category, &p.CategoryDisplay, &p.Description, &created, &bust, &waist, &length, &bottom, &elasticity, &note,
			&p.LiveCode, &p.VideoURL, &p.VideoPoster, &lookIDs)
	if err != nil {
		respondError(w, http.StatusNotFound, "product not found")
		return
	}
	p.CreatedAt = created.Format(time.RFC3339)
	p.Measurements = map[string]string{}
	for k, v := range map[string]string{"bust": bust, "waist": waist, "length": length, "bottom_length": bottom, "elasticity": elasticity, "note": note} {
		if v != "" {
			p.Measurements[k] = v
		}
	}

	p.SizeChart = loadSizeChart(r.Context(), h.DB, p.ID)
	p.Images = []string{}
	if irows, err := h.DB.Query(r.Context(), `SELECT url FROM product_images WHERE product_id=$1 ORDER BY sort_order`, id); err == nil {
		for irows.Next() {
			var u string
			if irows.Scan(&u) == nil {
				p.Images = append(p.Images, u)
			}
		}
		irows.Close()
	}

	p.Variants = []storeVariant{}
	p.Colors = []string{}
	vrows, err := h.DB.Query(r.Context(), `
		SELECT pv.id, pv.sku, `+storeColorSQL(r, "pv.color")+`, pv.size, pv.price, pv.compare_at_price, GREATEST(`+sellableSQL+`, 0)
		FROM product_variants pv JOIN stock_buckets sb ON sb.variant_id = pv.id
		WHERE pv.product_id=$1 AND pv.is_active ORDER BY pv.id`, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch variants")
		return
	}
	defer vrows.Close()
	seen := map[string]bool{}
	for vrows.Next() {
		var v storeVariant
		if vrows.Scan(&v.ID, &v.SKU, &v.Color, &v.Size, &v.Price, &v.CompareAt, &v.Stock) != nil {
			continue
		}
		p.Variants = append(p.Variants, v)
		if v.Stock > 0 {
			p.InStock = true
		}
		if v.Color != "" && !seen[v.Color] {
			seen[v.Color] = true
			p.Colors = append(p.Colors, v.Color)
		}
		if p.Price == 0 || v.Price < p.Price {
			p.Price, p.CompareAt = v.Price, v.CompareAt
		}
	}
	site := &SiteHandler{DB: h.DB}
	p.Hosts = site.hostsForProduct(r.Context(), p.ID)
	ids := make([]int, 0, len(lookIDs))
	for _, v := range lookIDs {
		ids = append(ids, int(v))
	}
	p.Looks = site.cards(r.Context(), r, ids)
	if wrows, err := h.DB.Query(r.Context(), `
		SELECT h.name, h.slug, h.height_cm, COALESCE(h.weight_kg,0), hp.wear_size
		FROM host_products hp JOIN hosts h ON h.id = hp.host_id
		WHERE hp.product_id=$1 AND hp.wear_size <> '' AND h.height_cm IS NOT NULL AND h.is_active AND h.is_public AND h.slug IS NOT NULL`, p.ID); err == nil {
		for wrows.Next() {
			var x storeWear
			if wrows.Scan(&x.Host, &x.Slug, &x.HeightCM, &x.WeightKG, &x.Size) == nil {
				p.Wear = append(p.Wear, x)
			}
		}
		wrows.Close()
	}
	respondJSON(w, http.StatusOK, p)
}

// Categories lists categories that have at least one sellable product.
func (h *StorefrontHandler) Categories(w http.ResponseWriter, r *http.Request) {
	rows, err := h.DB.Query(r.Context(), `
		SELECT c.name, `+storeCategorySQL(r, "c.name")+`,
		       (SELECT COUNT(*) FROM products p WHERE p.category = c.name AND p.is_active AND p.deleted_at IS NULL
		         AND EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.is_active))
		FROM categories c ORDER BY c.id`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch categories")
		return
	}
	defer rows.Close()
	type cat struct {
		Name    string `json:"name"`
		Display string `json:"display"`
		Count   int    `json:"count"`
	}
	out := []cat{}
	for rows.Next() {
		var c cat
		if rows.Scan(&c.Name, &c.Display, &c.Count) == nil && c.Count > 0 {
			out = append(out, c)
		}
	}
	respondJSON(w, http.StatusOK, out)
}

// Promotions lists currently usable coupon codes for the "Promo / Voucher" blocks.
func (h *StorefrontHandler) Promotions(w http.ResponseWriter, r *http.Request) {
	rows, err := h.DB.Query(r.Context(), `
		SELECT p.code, p.type, p.value, p.min_order_amount, p.end_date
		FROM promotions p
		WHERE p.is_active AND p.code IS NOT NULL
		  AND (p.start_date IS NULL OR p.start_date <= now()) AND (p.end_date IS NULL OR p.end_date >= now())
		  AND (p.usage_limit IS NULL OR (SELECT COUNT(*) FROM promotion_redemptions rd WHERE rd.promotion_id = p.id) < p.usage_limit)
		ORDER BY p.id DESC`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch promotions")
		return
	}
	defer rows.Close()
	type promo struct {
		Code     string     `json:"code"`
		Type     string     `json:"type"`
		Value    float64    `json:"value"`
		MinOrder float64    `json:"min_order_amount"`
		EndDate  *time.Time `json:"end_date"`
	}
	out := []promo{}
	for rows.Next() {
		var p promo
		if rows.Scan(&p.Code, &p.Type, &p.Value, &p.MinOrder, &p.EndDate) == nil {
			out = append(out, p)
		}
	}
	respondJSON(w, http.StatusOK, out)
}

// Settings returns the public store info plus the shipping rules shown in banners/cart.
func (h *StorefrontHandler) Settings(w http.ResponseWriter, r *http.Request) {
	shop := "Ralulu"
	h.DB.QueryRow(r.Context(), `SELECT value FROM store_settings WHERE key='shop_name'`).Scan(&shop)
	values, _ := loadShippingFeeSettings(r.Context(), h.DB)
	rows, err := h.DB.Query(r.Context(), `SELECT id, name, chain_type, target_fee FROM pickup_chains WHERE is_active ORDER BY name`)
	type chain struct {
		ID        int     `json:"id"`
		Name      string  `json:"name"`
		ChainType string  `json:"chain_type"`
		Fee       float64 `json:"fee"`
	}
	chains := []chain{}
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var c chain
			if rows.Scan(&c.ID, &c.Name, &c.ChainType, &c.Fee) == nil {
				if c.ChainType == "courier" {
					c.Fee = values["home_delivery_flat_fee"]
				}
				chains = append(chains, c)
			}
		}
	}
	site := &SiteHandler{DB: h.DB}
	ctx := r.Context()
	waNumber := site.setting(ctx, "whatsapp_number", "")
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"shop_name":                shop,
		"logo_url":                 site.setting(ctx, "site_logo_url", ""),
		"free_shipping_minimarket": values["free_shipping_threshold_minimarket"],
		"free_shipping_courier":    values["free_shipping_threshold_pos"],
		"free_shipping_active":     site.setting(ctx, "free_shipping_active", "true") != "false",
		"free_shipping_start":      site.setting(ctx, "free_shipping_start", ""),
		"free_shipping_end":        site.setting(ctx, "free_shipping_end", ""),
		"shipping_options":         chains,
		"whatsapp_number":          waNumber,
		"line_id":                  site.setting(ctx, "line_id", defaultLineID),
		"store_tutorial":           site.loadTutorial(r),
		"cs_hours":                 site.setting(ctx, "cs_hours", ""),
		"cs_hours_note":            site.setting(ctx, "cs_hours_note", ""),
		"rewards": func() map[string]interface{} {
			st := (&MemberHandler{}).rewardSettings(ctx, h.DB)
			return map[string]interface{}{"welcome_balance": st.WelcomeBalance, "referral_reward": st.ReferralReward, "point_value": st.PointValue, "refund_credit_bonus_pct": st.RefundCreditBonusPct}
		}(),
		"whatsapp_login":    waProvider() != "off",
		"ga_measurement_id": gaMeasurementID(),
		"social": map[string]string{
			"youtube": site.setting(ctx, "social_youtube", ""), "instagram": site.setting(ctx, "social_instagram", ""),
			"facebook": site.setting(ctx, "social_facebook", ""), "tiktok": site.setting(ctx, "social_tiktok", ""),
		},
	})
}

// ---- cart pricing + checkout ----

type storeCartItem struct {
	VariantID int `json:"variant_id"`
	Qty       int `json:"qty"`
}

type storeQuoteRequest struct {
	Items         []storeCartItem `json:"items"`
	PickupChainID int             `json:"pickup_chain_id"`
	PromotionCode string          `json:"promotion_code"`
	Phone         string          `json:"phone"`
	UseBalance    bool            `json:"use_balance"`
	UsePoints     bool            `json:"use_points"`
	memberID      int
}

type storeQuote struct {
	Subtotal       float64 `json:"subtotal"`
	Discount       float64 `json:"discount"`
	ShippingFee    float64 `json:"shipping_fee"`
	Total          float64 `json:"total"`
	PromotionError string  `json:"promotion_error,omitempty"`
	// Wallet (signed-in members): what balance / points this order would use, and the amount still to pay.
	Wallet      *WalletUse `json:"wallet,omitempty"`
	PayableNow  float64    `json:"payable_now"`
	promotionID *int
	customerID  *int
}

type storeDB interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

// priceCart computes the authoritative totals for a cart (client-sent prices are never used).
// A bad coupon is reported in PromotionError for quotes; strict makes it a hard error instead.
func priceCart(ctx context.Context, db storeDB, req storeQuoteRequest, strict bool) (storeQuote, string) {
	var q storeQuote
	if len(req.Items) == 0 {
		return q, "keranjang kosong"
	}
	for _, it := range req.Items {
		if it.Qty <= 0 || it.Qty > 99 || it.VariantID == 0 {
			return q, "item tidak valid"
		}
		var price float64
		err := db.QueryRow(ctx, `
			SELECT pv.price FROM product_variants pv JOIN products p ON p.id = pv.product_id
			WHERE pv.id=$1 AND pv.is_active AND p.is_active AND p.deleted_at IS NULL`, it.VariantID).Scan(&price)
		if err != nil {
			return q, "produk tidak tersedia"
		}
		q.Subtotal += price * float64(it.Qty)
	}

	if phone := strings.TrimSpace(req.Phone); phone != "" {
		var cid int
		// older customers may have been stored as typed (+886...), newer ones in the local 09 format
		if db.QueryRow(ctx, `SELECT id FROM customers WHERE phone = ANY($1) ORDER BY id LIMIT 1`, []string{NormalizeTWPhone(phone), phone}).Scan(&cid) == nil {
			q.customerID = &cid
		}
	}

	freeShip := false
	if code := strings.ToUpper(strings.TrimSpace(req.PromotionCode)); code != "" {
		res, msg := resolvePromotionByCode(ctx, db, code, q.customerID, q.Subtotal, req.memberID)
		if msg != "" {
			if strict {
				return q, msg
			}
			q.PromotionError = msg
		} else {
			q.promotionID = &res.id
			q.Discount = res.discountAmount
			freeShip = res.freeShipping
		}
	}

	if req.PickupChainID > 0 {
		fee, err := ComputeShippingFee(ctx, db, req.PickupChainID, q.Subtotal, freeShip)
		if err != nil {
			return q, "metode pengambilan tidak valid"
		}
		q.ShippingFee = fee
	}
	q.Total = q.Subtotal - q.Discount + q.ShippingFee
	if q.Total < 0 {
		q.Total = 0
	}
	q.PayableNow = q.Total
	if req.memberID > 0 && (req.UseBalance || req.UsePoints) {
		mh := &MemberHandler{}
		bal, pts := balancesOf(ctx, db, req.memberID)
		u := planWalletUse(q.Total, bal, pts, mh.rewardSettings(ctx, db).PointValue, req.UseBalance, req.UsePoints)
		if u.Total() > 0 {
			q.Wallet = &u
			q.PayableNow = q.Total - u.Total()
		}
	}
	return q, ""
}

// Quote prices a cart (totals, coupon, shipping) without creating anything.
func (h *StorefrontHandler) Quote(w http.ResponseWriter, r *http.Request) {
	var req storeQuoteRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.memberID = h.memberFrom(r)
	q, msg := priceCart(r.Context(), h.DB, req, false)
	if msg != "" {
		respondError(w, http.StatusBadRequest, msg)
		return
	}
	respondJSON(w, http.StatusOK, q)
}

type storeOrderRequest struct {
	storeQuoteRequest
	Name            string `json:"name"`
	Email           string `json:"email"`
	Address         string `json:"address"`
	PickupStoreName string `json:"pickup_store_name"`
	PickupStoreCode string `json:"pickup_store_code"`
	Notes           string `json:"notes"`
	Source          string `json:"source"`         // self_checkout (default) | cs_assisted
	StoreUnlisted   bool   `json:"store_unlisted"` // the customer typed a store code that the directory did not know
	Lang            string `json:"lang"`
}

var phonePattern = regexp.MustCompile(`^[0-9+\-\s]{8,20}$`)

// CreateOrder is guest checkout. Stock is checked under a row lock so two shoppers can't both
// take the last unit; the order lands as 'pending' for the warehouse like any other order.
func (h *StorefrontHandler) CreateOrder(w http.ResponseWriter, r *http.Request) {
	var req storeOrderRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Name, req.Email = strings.TrimSpace(req.Name), strings.TrimSpace(req.Email)
	// Phones are stored in the local Taiwan format (09xxxxxxxx) so the ERP and shipping exports agree.
	// Storefront checkout must be a Taiwan mobile; an order a staff member keys in for a customer may
	// carry another country's number.
	req.Phone = NormalizeTWPhone(req.Phone)
	staffOrder := req.Source == "cs_assisted"
	if req.Name == "" || len(req.Name) > 150 || !(IsTWMobile(req.Phone) || (staffOrder && phonePattern.MatchString(req.Phone))) {
		respondError(w, http.StatusBadRequest, "nama dan nomor HP Taiwan yang valid (09xxxxxxxx) wajib diisi")
		return
	}
	if req.Email != "" && !validEmailAddress(req.Email) {
		respondError(w, http.StatusBadRequest, "format email tidak valid")
		return
	}
	if req.PickupChainID == 0 {
		respondError(w, http.StatusBadRequest, "pilih metode pengambilan")
		return
	}
	ctx := r.Context()

	address, bad := resolvePickupAddress(ctx, h.DB, req.PickupChainID, req.PickupStoreCode, req.PickupStoreName, strings.TrimSpace(req.Address))
	if bad != "" {
		respondError(w, http.StatusBadRequest, bad)
		return
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(ctx)

	// Lock the stock rows (consistent order) and verify there is enough to promise.
	need := map[int]int{}
	for _, it := range req.Items {
		need[it.VariantID] += it.Qty
	}
	for vid, qty := range need {
		var name string
		var sellable int
		err := tx.QueryRow(ctx, `
			SELECT p.name, `+sellableSQL+`
			FROM product_variants pv JOIN products p ON p.id = pv.product_id JOIN stock_buckets sb ON sb.variant_id = pv.id
			WHERE pv.id=$1 AND pv.is_active AND p.is_active AND p.deleted_at IS NULL FOR UPDATE OF sb`, vid).Scan(&name, &sellable)
		if err != nil {
			respondError(w, http.StatusBadRequest, "produk tidak tersedia")
			return
		}
		if sellable < qty {
			respondError(w, http.StatusConflict, fmt.Sprintf("stok %s tidak cukup (tersisa %d)", name, max(sellable, 0)))
			return
		}
	}

	req.memberID = h.memberFrom(r)
	if req.memberID > 0 {
		// serialise wallet use per member so two checkouts can't spend the same balance
		var lock int
		_ = tx.QueryRow(ctx, `SELECT id FROM members WHERE id=$1 FOR UPDATE`, req.memberID).Scan(&lock)
	}
	quote, msg := priceCart(ctx, tx, req.storeQuoteRequest, true)
	if msg != "" {
		respondError(w, http.StatusBadRequest, msg)
		return
	}

	customerID := 0
	if quote.customerID != nil {
		customerID = *quote.customerID
	} else if err := tx.QueryRow(ctx, `INSERT INTO customers (name, phone, address) VALUES ($1,$2,$3) RETURNING id`,
		req.Name, req.Phone, address).Scan(&customerID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create customer")
		return
	}

	notes := strings.TrimSpace(req.Notes)
	if req.Email != "" {
		notes = strings.TrimSpace("Email: " + req.Email + "\n" + notes)
	}
	source := "self_checkout"
	if req.Source == "cs_assisted" {
		source = "cs_assisted"
	}
	// A CVS store code the directory doesn't contain is accepted (the directory misses new stores) but
	// flagged so warehouse/CS can confirm it before shipping.
	verified := true
	var chainType string
	_ = tx.QueryRow(ctx, `SELECT chain_type FROM pickup_chains WHERE id=$1`, req.PickupChainID).Scan(&chainType)
	if chainType == "cvs_711" || chainType == "cvs_familymart" {
		var n int
		_ = tx.QueryRow(ctx, `SELECT COUNT(*) FROM cvs_stores WHERE chain_type=$1 AND store_code=$2`, chainType, req.PickupStoreCode).Scan(&n)
		verified = n > 0 && !req.StoreUnlisted
		if !verified && source == "self_checkout" {
			// An unknown store number is no longer accepted from the storefront: the customer is sent to CS.
			respondError(w, http.StatusBadRequest, "nomor toko tidak ditemukan - silakan hubungi CS")
			return
		}
		if !verified {
			notes = strings.TrimSpace("[Nomor toko belum terverifikasi di direktori - mohon dicek CS]\n" + notes)
		}
	}
	orderNo := fmt.Sprintf("WEB-%d-%04d", time.Now().Unix(), rand.Intn(9999))
	var orderID int
	if err := tx.QueryRow(ctx, `
		INSERT INTO orders (order_no, customer_id, sales_id, status, shipping_address, pickup_chain_id, pickup_store_name, pickup_store_code,
		                    discount_amount, additional_amount, internal_notes, sales_channel, shipping_fee, free_shipping_override,
		                    promotion_id, promotion_discount_amount, website_source, source, pickup_store_verified, recipient_email)
		VALUES ($1,$2,NULL,'pending',$3,$4,$5,$6,0,0,$7,'website',$8,$9,$10,$11,'self_service',$12,$13,NULLIF($14,'')) RETURNING id`,
		orderNo, customerID, address, req.PickupChainID, req.PickupStoreName, req.PickupStoreCode,
		notes, quote.ShippingFee, quote.ShippingFee == 0, quote.promotionID, quote.Discount, source, verified, req.Email).Scan(&orderID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create order")
		return
	}
	if _, err := tx.Exec(ctx, `INSERT INTO order_status_log (order_id, status_from, status_to, changed_by) VALUES ($1, NULL, 'pending', NULL)`, orderID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to log order status")
		return
	}
	for _, it := range req.Items {
		if _, err := tx.Exec(ctx, `
			INSERT INTO order_items (order_id, variant_id, qty, price_at_order)
			SELECT $1, pv.id, $3, pv.price FROM product_variants pv WHERE pv.id=$2`, orderID, it.VariantID, it.Qty); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to create order item")
			return
		}
	}
	if req.memberID > 0 {
		// link the order to the account and spend the wallet (balance first, then points). The wallet value is also
		// folded into discount_amount, so every existing total / report stays correct without touching their queries.
		var used WalletUse
		if quote.Wallet != nil {
			used = *quote.Wallet
		}
		if _, err := tx.Exec(ctx, `
			UPDATE orders SET member_id=$2, wallet_balance_used=$3, wallet_points_used=$4, wallet_points_value=$5, discount_amount = discount_amount + $6 WHERE id=$1`,
			orderID, req.memberID, used.Balance, used.Points, used.PointsValue, used.Total()); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to apply wallet")
			return
		}
		mh := &MemberHandler{}
		if used.Balance > 0 {
			mh.ledgerAdd(ctx, tx, req.memberID, "balance", -used.Balance, "order_spend", fmt.Sprintf("spend-bal:%d", orderID), orderNo, &orderID)
		}
		if used.Points > 0 {
			mh.ledgerAdd(ctx, tx, req.memberID, "points", -float64(used.Points), "order_spend", fmt.Sprintf("spend-pts:%d", orderID), orderNo, &orderID)
		}
	}
	if quote.promotionID != nil {
		if _, err := tx.Exec(ctx, `INSERT INTO promotion_redemptions (promotion_id, order_id, customer_id, discount_applied) VALUES ($1,$2,$3,$4)`,
			*quote.promotionID, orderID, customerID, quote.Discount); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to record promotion")
			return
		}
	}
	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "db commit failed")
		return
	}
	// WhatsApp hand-off: the order summary prefilled for the admin-configured number.
	site := &SiteHandler{DB: h.DB}
	lang := siteLang(r)
	if req.Lang == "en" || req.Lang == "zh" || req.Lang == "id" {
		lang = req.Lang
	}
	waText, _ := site.orderWhatsAppText(r, lang, orderNo, req.Phone)
	waNumber := site.setting(ctx, "whatsapp_number", "")
	respondJSON(w, http.StatusCreated, map[string]interface{}{
		"order_no": orderNo, "subtotal": quote.Subtotal, "discount": quote.Discount,
		"shipping_fee": quote.ShippingFee, "total": quote.PayableNow, "wallet": quote.Wallet, "store_verified": verified,
		"whatsapp": map[string]string{"number": waNumber, "text": waText, "url": WhatsAppURL(waNumber, waText)},
	})
}

// Track ("Lacak Pesanan") shows an order's status; the phone number is the shared secret, so
// guessing an order number alone reveals nothing.
func (h *StorefrontHandler) Track(w http.ResponseWriter, r *http.Request) {
	orderNo := strings.TrimSpace(r.URL.Query().Get("order_no"))
	rawPhone := strings.TrimSpace(r.URL.Query().Get("phone"))
	phone := NormalizeTWPhone(rawPhone)
	if orderNo == "" || phone == "" {
		respondError(w, http.StatusBadRequest, "nomor pesanan dan nomor HP wajib diisi")
		return
	}
	var o struct {
		OrderNo   string                   `json:"order_no"`
		Status    string                   `json:"status"`
		CreatedAt string                   `json:"created_at"`
		UpdatedAt string                   `json:"updated_at"`
		Tracking  string                   `json:"tracking_number"`
		Customer  string                   `json:"customer_name"`
		Address   string                   `json:"shipping_address"`
		Chain     string                   `json:"chain"`
		ChainType string                   `json:"chain_type"`
		StoreName string                   `json:"store_name"`
		StoreCode string                   `json:"store_code"`
		Verified  bool                     `json:"store_verified"`
		ShipFee   float64                  `json:"shipping_fee"`
		Discount  float64                  `json:"discount"`
		Subtotal  float64                  `json:"subtotal"`
		Total     float64                  `json:"total"`
		Items     []map[string]interface{} `json:"items"`
	}
	var id int
	var created, updated time.Time
	err := h.DB.QueryRow(r.Context(), `
		SELECT o.id, o.order_no, o.status, o.created_at, o.updated_at, COALESCE(o.tracking_number,''), COALESCE(c.name,''), COALESCE(o.shipping_address,''),
		       o.shipping_fee, o.promotion_discount_amount + o.discount_amount,
		       pc.name, pc.chain_type, COALESCE(o.pickup_store_name,''), COALESCE(o.pickup_store_code,''), o.pickup_store_verified
		FROM orders o JOIN customers c ON c.id = o.customer_id JOIN pickup_chains pc ON pc.id = o.pickup_chain_id
		WHERE o.order_no=$1 AND c.phone = ANY($2)`, orderNo, []string{phone, rawPhone}).
		Scan(&id, &o.OrderNo, &o.Status, &created, &updated, &o.Tracking, &o.Customer, &o.Address, &o.ShipFee, &o.Discount,
			&o.Chain, &o.ChainType, &o.StoreName, &o.StoreCode, &o.Verified)
	if err != nil {
		respondError(w, http.StatusNotFound, "pesanan tidak ditemukan")
		return
	}
	o.CreatedAt = created.Format(time.RFC3339)
	o.UpdatedAt = updated.Format(time.RFC3339)
	o.Items = []map[string]interface{}{}
	rows, err := h.DB.Query(r.Context(), `
		SELECT oi.id, p.id, `+productNameSQL(r, "p")+`, `+storeColorSQL(r, "pv.color")+`, pv.size, oi.qty, oi.price_at_order,
		       COALESCE((SELECT url FROM product_images WHERE product_id = p.id ORDER BY sort_order LIMIT 1), ''),
		       EXISTS (SELECT 1 FROM product_reviews rv WHERE rv.order_item_id = oi.id)
		FROM order_items oi JOIN product_variants pv ON pv.id = oi.variant_id JOIN products p ON p.id = pv.product_id
		WHERE oi.order_id=$1 ORDER BY oi.id`, id)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var itemID, productID int
			var name, color, size, image string
			var qty int
			var price float64
			var reviewed bool
			if rows.Scan(&itemID, &productID, &name, &color, &size, &qty, &price, &image, &reviewed) == nil {
				o.Subtotal += price * float64(qty)
				o.Items = append(o.Items, map[string]interface{}{"id": itemID, "product_id": productID, "image": image, "name": name, "color": color, "size": size, "qty": qty, "price": price, "reviewed": reviewed})
			}
		}
	}
	o.Total = o.Subtotal - o.Discount + o.ShipFee
	respondJSON(w, http.StatusOK, o)
}

// Subscribe stores a newsletter email (idempotent).
func (h *StorefrontHandler) Subscribe(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email string `json:"email"`
	}
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	if len(email) > 150 || !strings.Contains(email, "@") || !strings.Contains(email[strings.Index(email, "@"):], ".") {
		respondError(w, http.StatusBadRequest, "email tidak valid")
		return
	}
	h.DB.Exec(r.Context(), `INSERT INTO newsletter_subscribers (email) VALUES ($1) ON CONFLICT DO NOTHING`, email)
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
