package handlers

import (
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// ---- 7-ELEVEN / FamilyMart store search (number or name) ----

type siteStore struct {
	Code  string `json:"code"`
	Name  string `json:"name"`
	Addr  string `json:"addr"`
	Phone string `json:"phone,omitempty"`
}

var sixDigits = regexp.MustCompile(`^\d{6}$`)

func normalizeChain(c string) string {
	switch strings.ToLower(strings.TrimSpace(c)) {
	case "cvs_711", "711", "7-eleven", "unimart":
		return "cvs_711"
	case "cvs_familymart", "fami", "familymart":
		return "cvs_familymart"
	}
	return ""
}

// CvsSearch serves GET /public/store/cvs/search?chain=cvs_711|cvs_familymart&q=. A 6-digit query is an
// exact store-number lookup; anything else searches the Chinese store name / address (up to 10
// results, "more" = there were more). status: found | candidates | not_found | unavailable (the
// store cache has never been filled, e.g. ECPay unreachable). The cache is the ECPay store
// directory (see cvs_stores.go), which can miss newly opened stores - the website then offers
// "unlisted store" entry plus a WhatsApp hand-off instead of blocking the order.
func (h *SiteHandler) CvsSearch(w http.ResponseWriter, r *http.Request) {
	if !siteLimiter.allow("cvs:"+clientIP(r), 60, time.Minute) {
		respondError(w, http.StatusTooManyRequests, "too many requests")
		return
	}
	chain := normalizeChain(r.URL.Query().Get("chain"))
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if chain == "" || q == "" {
		respondError(w, http.StatusBadRequest, "chain and q are required")
		return
	}
	ctx := r.Context()
	var total int
	h.DB.QueryRow(ctx, `SELECT COUNT(*) FROM cvs_stores WHERE chain_type=$1`, chain).Scan(&total)
	if total == 0 {
		respondJSON(w, http.StatusOK, map[string]interface{}{"status": "unavailable", "results": []siteStore{}, "more": false})
		return
	}

	queryType := "name"
	var rowsQ string
	args := []interface{}{chain}
	if sixDigits.MatchString(q) {
		queryType = "code"
		rowsQ = `store_code = $2`
		args = append(args, q)
	} else {
		if len(q) > 40 {
			q = q[:40]
		}
		rowsQ = `(store_name ILIKE $2 OR store_addr ILIKE $2)`
		args = append(args, "%"+q+"%")
	}
	rows, err := h.DB.Query(ctx, `
		SELECT store_code, store_name, COALESCE(store_addr,''), COALESCE(store_phone,'')
		FROM cvs_stores WHERE chain_type=$1 AND `+rowsQ+` ORDER BY store_code LIMIT 11`, args...)
	if err != nil {
		respondJSON(w, http.StatusOK, map[string]interface{}{"status": "unavailable", "results": []siteStore{}, "more": false})
		return
	}
	defer rows.Close()
	results := []siteStore{}
	for rows.Next() {
		var s siteStore
		if rows.Scan(&s.Code, &s.Name, &s.Addr, &s.Phone) == nil {
			results = append(results, s)
		}
	}
	more := len(results) > 10
	if more {
		results = results[:10]
	}
	status := "not_found"
	switch {
	case len(results) == 1 && queryType == "code":
		status = "found"
	case len(results) == 1:
		status = "found"
	case len(results) > 1:
		status = "candidates"
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"status": status, "query_type": queryType, "results": results, "more": more})
}

// ---- coupons: claim by (live) code ----

// ClaimCoupon serves POST /public/store/coupons/claim {code}: validates a coupon code and returns what
// the visitor gets, without redeeming it (redemption happens at checkout, server-side).
func (h *SiteHandler) ClaimCoupon(w http.ResponseWriter, r *http.Request) {
	if !siteLimiter.allow("coupon:"+clientIP(r), 30, time.Minute) {
		respondError(w, http.StatusTooManyRequests, "too many requests")
		return
	}
	var req struct {
		Code string `json:"code"`
	}
	if err := decodeJSON(r, &req); err != nil || strings.TrimSpace(req.Code) == "" {
		respondError(w, http.StatusBadRequest, "code is required")
		return
	}
	code := strings.ToUpper(strings.TrimSpace(req.Code))
	var p struct {
		Code     string     `json:"code"`
		Type     string     `json:"type"`
		Value    float64    `json:"value"`
		MinOrder float64    `json:"min_order_amount"`
		EndDate  *time.Time `json:"end_date"`
		Title    string     `json:"title"`
		Host     string     `json:"host"`
	}
	var active bool
	var start *time.Time
	var limit *int
	var used int
	err := h.DB.QueryRow(r.Context(), `
		SELECT p.code, p.type, p.value, p.min_order_amount, p.end_date, p.start_date, p.is_active, p.usage_limit,
		       (SELECT COUNT(*) FROM promotion_redemptions rd WHERE rd.promotion_id = p.id),
		       COALESCE((SELECT hc.title FROM host_coupons hc WHERE hc.promotion_id = p.id LIMIT 1), ''),
		       COALESCE((SELECT h.name FROM host_coupons hc JOIN hosts h ON h.id = hc.host_id WHERE hc.promotion_id = p.id LIMIT 1), '')
		FROM promotions p WHERE p.code = $1`, code).
		Scan(&p.Code, &p.Type, &p.Value, &p.MinOrder, &p.EndDate, &start, &active, &limit, &used, &p.Title, &p.Host)
	if err != nil {
		respondError(w, http.StatusNotFound, "kode kupon tidak ditemukan")
		return
	}
	now := time.Now()
	switch {
	case !active:
		respondError(w, http.StatusConflict, "kupon tidak aktif")
		return
	case start != nil && start.After(now):
		respondError(w, http.StatusConflict, "kupon belum berlaku")
		return
	case p.EndDate != nil && p.EndDate.Before(now):
		respondError(w, http.StatusConflict, "kupon sudah kedaluwarsa")
		return
	case limit != nil && used >= *limit:
		respondError(w, http.StatusConflict, "kupon sudah habis diklaim")
		return
	}
	respondJSON(w, http.StatusOK, p)
}

// ---- restock + return requests ----

// RestockRequest serves POST /public/store/restock-requests {product_id, variant_id?, contact}.
func (h *SiteHandler) RestockRequest(w http.ResponseWriter, r *http.Request) {
	if !siteLimiter.allow("restock:"+clientIP(r), 20, time.Hour) {
		respondError(w, http.StatusTooManyRequests, "too many requests")
		return
	}
	var req struct {
		ProductID int    `json:"product_id"`
		VariantID *int   `json:"variant_id"`
		Contact   string `json:"contact"`
	}
	if err := decodeJSON(r, &req); err != nil || req.ProductID == 0 || len(strings.TrimSpace(req.Contact)) < 5 || len(req.Contact) > 80 {
		respondError(w, http.StatusBadRequest, "product and contact are required")
		return
	}
	if _, err := h.DB.Exec(r.Context(), `INSERT INTO restock_requests (product_id, variant_id, contact) VALUES ($1,$2,$3)`,
		req.ProductID, req.VariantID, strings.TrimSpace(req.Contact)); err != nil {
		respondError(w, http.StatusBadRequest, "product not found")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]string{"status": "ok"})
}

// ReturnRequest serves POST /public/store/returns: a guest return / exchange request. The order number +
// phone are the shared secret (same as order tracking). Staff see it in the admin and continue on WhatsApp.
func (h *SiteHandler) ReturnRequest(w http.ResponseWriter, r *http.Request) {
	if !siteLimiter.allow("return:"+clientIP(r), 10, time.Hour) {
		respondError(w, http.StatusTooManyRequests, "too many requests")
		return
	}
	var req struct {
		OrderNo      string   `json:"order_no"`
		Phone        string   `json:"phone"`
		Kind         string   `json:"kind"`
		Reason       string   `json:"reason"`
		Note         string   `json:"note"`
		ItemIDs      []int    `json:"item_ids"`
		Photos       []string `json:"photos"`
		ReturnMethod string   `json:"return_method"`
		RefundMethod string   `json:"refund_method"`
	}
	if err := decodeJSON(r, &req); err != nil || req.OrderNo == "" || req.Phone == "" || req.Reason == "" {
		respondError(w, http.StatusBadRequest, "order, phone and reason are required")
		return
	}
	if req.Kind != "exchange" {
		req.Kind = "return"
	}
	var orderID int
	var status string
	if err := h.DB.QueryRow(r.Context(), `
		SELECT o.id, o.status FROM orders o JOIN customers c ON c.id = o.customer_id
		WHERE o.order_no=$1 AND c.phone=$2`, strings.TrimSpace(req.OrderNo), strings.TrimSpace(req.Phone)).Scan(&orderID, &status); err != nil {
		respondError(w, http.StatusNotFound, "pesanan tidak ditemukan")
		return
	}
	if status != "delivered" && status != "shipped" {
		respondError(w, http.StatusConflict, "pesanan belum bisa diretur")
		return
	}
	if req.Photos == nil {
		req.Photos = []string{} // the column is NOT NULL: a return without photos stores an empty array
	}
	if len(req.Photos) > 6 {
		req.Photos = req.Photos[:6]
	}
	ids32 := make([]int32, len(req.ItemIDs))
	for i, v := range req.ItemIDs {
		ids32[i] = int32(v)
	}
	if _, err := h.DB.Exec(r.Context(), `
		INSERT INTO web_return_requests (order_id, kind, reason, note, item_ids, photos, return_method, refund_method)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
		orderID, req.Kind, req.Reason, req.Note, ids32, req.Photos, req.ReturnMethod, req.RefundMethod); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save request")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]string{"status": "ok"})
}

// ---- WhatsApp hand-off ----

type waLine struct {
	Name  string
	Color string
	Size  string
	Qty   int
	Price float64
}

func moneyNT(n float64) string {
	return "NT$" + strconv.FormatFloat(float64(int64(n+0.5)), 'f', 0, 64)
}

var waTemplates = map[string]map[string]string{
	"id": {
		"head": "Halo ralulu, saya baru membuat pesanan:", "no": "No. pesanan", "items": "Produk", "subtotal": "Subtotal",
		"discount": "Diskon", "shipping": "Ongkir", "free": "Gratis", "total": "Total (bayar di toko)", "pickup": "Pengambilan",
		"home": "Kirim ke rumah", "name": "Nama", "phone": "HP", "unverified": "(nomor toko belum terverifikasi, mohon dicek CS)",
	},
	"en": {
		"head": "Hello ralulu, I just placed an order:", "no": "Order no.", "items": "Items", "subtotal": "Subtotal",
		"discount": "Discount", "shipping": "Shipping", "free": "Free", "total": "Total (pay at store)", "pickup": "Pickup",
		"home": "Home delivery", "name": "Name", "phone": "Phone", "unverified": "(store number not verified, please check)",
	},
	"zh": {
		"head": "你好 ralulu，我剛下了訂單：", "no": "訂單編號", "items": "商品", "subtotal": "商品小計",
		"discount": "折扣", "shipping": "運費", "free": "免運", "total": "應付總額（到店付款）", "pickup": "取貨",
		"home": "宅配", "name": "姓名", "phone": "電話", "unverified": "（店號尚未驗證，請協助確認）",
	},
}

// BuildOrderWhatsAppText is the prefilled message for the WhatsApp hand-off after checkout.
func BuildOrderWhatsAppText(lang, orderNo string, lines []waLine, subtotal, discount, shipping, total float64, pickup, name, phone string, verified bool) string {
	t := waTemplates[lang]
	if t == nil {
		t = waTemplates["id"]
	}
	var b strings.Builder
	b.WriteString(t["head"] + "\n")
	b.WriteString(t["no"] + ": " + orderNo + "\n\n" + t["items"] + ":\n")
	for _, l := range lines {
		variant := strings.Trim(strings.TrimSpace(l.Color+" / "+l.Size), " /")
		b.WriteString(fmt.Sprintf("- %s", l.Name))
		if variant != "" {
			b.WriteString(" (" + variant + ")")
		}
		b.WriteString(fmt.Sprintf(" x%d = %s\n", l.Qty, moneyNT(l.Price*float64(l.Qty))))
	}
	b.WriteString("\n" + t["subtotal"] + ": " + moneyNT(subtotal) + "\n")
	if discount > 0 {
		b.WriteString(t["discount"] + ": -" + moneyNT(discount) + "\n")
	}
	if shipping > 0 {
		b.WriteString(t["shipping"] + ": " + moneyNT(shipping) + "\n")
	} else {
		b.WriteString(t["shipping"] + ": " + t["free"] + "\n")
	}
	b.WriteString(t["total"] + ": " + moneyNT(total) + "\n\n")
	b.WriteString(t["pickup"] + ": " + pickup)
	if !verified {
		b.WriteString(" " + t["unverified"])
	}
	b.WriteString("\n" + t["name"] + ": " + name + "\n" + t["phone"] + ": " + phone)
	return b.String()
}

// WhatsAppURL is the wa.me link for a number (digits with country code) and a message.
func WhatsAppURL(number, text string) string {
	if number == "" {
		return ""
	}
	// %20 (not "+") for spaces: wa.me decodes it reliably on every client.
	return "https://wa.me/" + number + "?text=" + strings.ReplaceAll(url.QueryEscape(text), "+", "%20")
}

// WhatsAppOrder serves GET /public/store/whatsapp/order?order_no=&phone= (rebuilds the hand-off message
// for an existing order, e.g. from the order detail page).
func (h *SiteHandler) WhatsAppOrder(w http.ResponseWriter, r *http.Request) {
	orderNo := strings.TrimSpace(r.URL.Query().Get("order_no"))
	phone := strings.TrimSpace(r.URL.Query().Get("phone"))
	lang := siteLang(r)
	if orderNo == "" || phone == "" {
		respondError(w, http.StatusBadRequest, "order_no and phone are required")
		return
	}
	text, ok := h.orderWhatsAppText(r, lang, orderNo, phone)
	if !ok {
		respondError(w, http.StatusNotFound, "pesanan tidak ditemukan")
		return
	}
	number := h.setting(r.Context(), "whatsapp_number", "")
	respondJSON(w, http.StatusOK, map[string]string{"number": number, "text": text, "url": WhatsAppURL(number, text)})
}

func (h *SiteHandler) orderWhatsAppText(r *http.Request, lang, orderNo, phone string) (string, bool) {
	ctx := r.Context()
	var id int
	var orderNoDB, cname, store, code, chainType, chainName string
	var verified bool
	var ship, disc float64
	if err := h.DB.QueryRow(ctx, `
		SELECT o.id, o.order_no, c.name, COALESCE(o.pickup_store_name,''), COALESCE(o.pickup_store_code,''), o.pickup_store_verified,
		       pc.chain_type, pc.name, o.shipping_fee, o.promotion_discount_amount + o.discount_amount
		FROM orders o JOIN customers c ON c.id = o.customer_id JOIN pickup_chains pc ON pc.id = o.pickup_chain_id
		WHERE o.order_no=$1 AND c.phone=$2`, orderNo, phone).
		Scan(&id, &orderNoDB, &cname, &store, &code, &verified, &chainType, &chainName, &ship, &disc); err != nil {
		return "", false
	}
	lines := []waLine{}
	var subtotal float64
	if rows, err := h.DB.Query(ctx, `
		SELECT `+productNameSQL(r, "p")+`, `+storeColorSQL(r, "pv.color")+`, pv.size, oi.qty, oi.price_at_order
		FROM order_items oi JOIN product_variants pv ON pv.id = oi.variant_id JOIN products p ON p.id = pv.product_id
		WHERE oi.order_id=$1 ORDER BY oi.id`, id); err == nil {
		for rows.Next() {
			var l waLine
			if rows.Scan(&l.Name, &l.Color, &l.Size, &l.Qty, &l.Price) == nil {
				lines = append(lines, l)
				subtotal += l.Price * float64(l.Qty)
			}
		}
		rows.Close()
	}
	pickup := chainName
	if chainType == "cvs_711" || chainType == "cvs_familymart" {
		pickup = strings.TrimSpace(chainName + " " + store + " (" + code + ")")
	} else {
		pickup = waTemplates[lang]["home"]
	}
	total := subtotal - disc + ship
	return BuildOrderWhatsAppText(lang, orderNoDB, lines, subtotal, disc, ship, total, pickup, cname, phone, verified), true
}
