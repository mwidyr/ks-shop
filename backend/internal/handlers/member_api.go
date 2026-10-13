package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"ordermgmt/internal/auth"
)

type memberCtxKey struct{}

// MemberAuth requires a valid member session (Authorization: Bearer <member token>).
func (h *MemberHandler) MemberAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := h.memberIDFrom(r)
		if id == 0 {
			respondError(w, http.StatusUnauthorized, "silakan login dulu")
			return
		}
		var active bool
		if h.DB.QueryRow(r.Context(), `SELECT is_active FROM members WHERE id=$1`, id).Scan(&active) != nil || !active {
			respondError(w, http.StatusUnauthorized, "akun tidak aktif")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), memberCtxKey{}, id)))
	})
}

// memberIDFrom reads the member id from a Bearer member token without requiring one (0 = guest).
func (h *MemberHandler) memberIDFrom(r *http.Request) int {
	header := r.Header.Get("Authorization")
	if !strings.HasPrefix(header, "Bearer ") {
		return 0
	}
	c, err := auth.ParseMemberToken(h.JWTSecret, strings.TrimPrefix(header, "Bearer "))
	if err != nil {
		return 0
	}
	return c.MemberID
}

func mid(r *http.Request) int { v, _ := r.Context().Value(memberCtxKey{}).(int); return v }

type memberProfile struct {
	Height    string                   `json:"height"`
	Weight    string                   `json:"weight"`
	Addresses []map[string]interface{} `json:"addresses"`
	Stores    []map[string]interface{} `json:"stores"`
}

// memberView is the account summary the website shows (profile, wallet, referral, counts).
func (h *MemberHandler) memberView(ctx context.Context, id int) map[string]interface{} {
	var m memberRow
	var profileRaw []byte
	err := h.DB.QueryRow(ctx, `SELECT id, phone, email, name, birthday, language, referral_code, referred_by, customer_id, is_active, profile FROM members WHERE id=$1`, id).
		Scan(&m.ID, &m.Phone, &m.Email, &m.Name, &m.Birthday, &m.Language, &m.ReferralCode, &m.ReferredBy, &m.CustomerID, &m.IsActive, &profileRaw)
	if err != nil {
		return nil
	}
	h.ensureBirthdayCoupon(ctx, h.DB, &m)
	bal, pts := balancesOf(ctx, h.DB, id)
	st := h.rewardSettings(ctx, h.DB)
	var prof map[string]interface{}
	_ = json.Unmarshal(profileRaw, &prof)
	if prof == nil {
		prof = map[string]interface{}{}
	}
	var coupons, favs, orders int
	h.DB.QueryRow(ctx, `
		SELECT COUNT(*) FROM member_coupons mc JOIN promotions p ON p.id = mc.promotion_id
		WHERE mc.member_id=$1 AND p.is_active AND (p.end_date IS NULL OR p.end_date >= now())
		  AND (p.usage_limit IS NULL OR (SELECT COUNT(*) FROM promotion_redemptions rd WHERE rd.promotion_id=p.id) < p.usage_limit)`, id).Scan(&coupons)
	h.DB.QueryRow(ctx, `SELECT COUNT(*) FROM member_favorites WHERE member_id=$1`, id).Scan(&favs)
	h.DB.QueryRow(ctx, `SELECT COUNT(*) FROM orders WHERE member_id=$1 OR ($2::int IS NOT NULL AND customer_id=$2)`, id, m.CustomerID).Scan(&orders)
	out := map[string]interface{}{
		"id": m.ID, "phone": m.Phone, "email": m.Email, "name": m.Name, "language": m.Language, "referral_code": m.ReferralCode,
		"balance": bal, "points": pts, "point_value": st.PointValue, "profile": prof,
		"counts":  map[string]int{"coupons": coupons, "favorites": favs, "orders": orders},
		"rewards": st,
	}
	if m.Birthday != nil {
		out["birthday"] = m.Birthday.Format("2006-01-02")
	}
	return out
}

// Me serves GET /member/me.
func (h *MemberHandler) Me(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, h.memberView(r.Context(), mid(r)))
}

// UpdateProfile serves PATCH /member/profile {name, email?, birthday, language, profile{height,weight,addresses,stores}}.
// A phone / email can be added (e.g. a WhatsApp member adding an email) but only through a verified login, not here.
func (h *MemberHandler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name     *string                `json:"name"`
		Birthday *string                `json:"birthday"`
		Language *string                `json:"language"`
		Profile  map[string]interface{} `json:"profile"`
	}
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	id := mid(r)
	ctx := r.Context()
	if req.Name != nil {
		n := strings.TrimSpace(*req.Name)
		if len(n) > 150 {
			respondError(w, http.StatusBadRequest, "nama terlalu panjang")
			return
		}
		h.DB.Exec(ctx, `UPDATE members SET name=$2 WHERE id=$1`, id, n)
	}
	if req.Birthday != nil {
		if *req.Birthday == "" {
			h.DB.Exec(ctx, `UPDATE members SET birthday=NULL WHERE id=$1`, id)
		} else if _, err := time.Parse("2006-01-02", *req.Birthday); err != nil {
			respondError(w, http.StatusBadRequest, "tanggal lahir tidak valid")
			return
		} else {
			h.DB.Exec(ctx, `UPDATE members SET birthday=$2 WHERE id=$1`, id, *req.Birthday)
		}
	}
	if req.Language != nil && (*req.Language == "id" || *req.Language == "en" || *req.Language == "zh") {
		h.DB.Exec(ctx, `UPDATE members SET language=$2 WHERE id=$1`, id, *req.Language)
	}
	if req.Profile != nil {
		raw, _ := json.Marshal(req.Profile)
		if len(raw) > 20000 {
			respondError(w, http.StatusBadRequest, "profil terlalu besar")
			return
		}
		h.DB.Exec(ctx, `UPDATE members SET profile = profile || $2::jsonb WHERE id=$1`, id, string(raw))
	}
	respondJSON(w, http.StatusOK, h.memberView(ctx, id))
}

// ---- favourites ----

// Favorites serves GET /member/favorites -> product ids with the price they were saved at.
func (h *MemberHandler) Favorites(w http.ResponseWriter, r *http.Request) {
	rows, err := h.DB.Query(r.Context(), `SELECT product_id, COALESCE(price_at_save,0) FROM member_favorites WHERE member_id=$1 ORDER BY created_at DESC`, mid(r))
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load favorites")
		return
	}
	defer rows.Close()
	type fav struct {
		ProductID int     `json:"id"`
		Price     float64 `json:"price"`
	}
	out := []fav{}
	for rows.Next() {
		var f fav
		if rows.Scan(&f.ProductID, &f.Price) == nil {
			out = append(out, f)
		}
	}
	respondJSON(w, http.StatusOK, out)
}

// SetFavorite serves PUT /member/favorites/{id} {on, price} (toggle on/off).
func (h *MemberHandler) SetFavorite(w http.ResponseWriter, r *http.Request) {
	pid, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid product id")
		return
	}
	var req struct {
		On    bool    `json:"on"`
		Price float64 `json:"price"`
	}
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.On {
		h.DB.Exec(r.Context(), `INSERT INTO member_favorites (member_id, product_id, price_at_save) VALUES ($1,$2,NULLIF($3,0)) ON CONFLICT DO NOTHING`, mid(r), pid, req.Price)
	} else {
		h.DB.Exec(r.Context(), `DELETE FROM member_favorites WHERE member_id=$1 AND product_id=$2`, mid(r), pid)
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ---- coupons ----

// Coupons serves GET /member/coupons: every coupon the member holds (claimed codes, welcome, birthday).
func (h *MemberHandler) Coupons(w http.ResponseWriter, r *http.Request) {
	id := mid(r)
	h.ensureBirthdayCoupon(r.Context(), h.DB, h.mustMember(r, id))
	rows, err := h.DB.Query(r.Context(), `
		SELECT p.code, p.type, p.value, p.min_order_amount, p.end_date, p.start_date, p.is_active,
		       EXISTS (SELECT 1 FROM promotion_redemptions rd JOIN orders o ON o.id = rd.order_id WHERE rd.promotion_id = p.id AND o.member_id = $1),
		       COALESCE((SELECT hc.title FROM host_coupons hc WHERE hc.promotion_id = p.id LIMIT 1), ''),
		       COALESCE((SELECT h.name FROM host_coupons hc JOIN hosts h ON h.id = hc.host_id WHERE hc.promotion_id = p.id LIMIT 1), ''),
		       p.member_id IS NOT NULL
		FROM member_coupons mc JOIN promotions p ON p.id = mc.promotion_id
		WHERE mc.member_id=$1 AND p.code IS NOT NULL ORDER BY mc.claimed_at DESC`, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load coupons")
		return
	}
	defer rows.Close()
	type c struct {
		Code     string     `json:"code"`
		Type     string     `json:"type"`
		Value    float64    `json:"value"`
		MinOrder float64    `json:"min_order_amount"`
		EndDate  *time.Time `json:"end_date"`
		Title    string     `json:"title"`
		Host     string     `json:"host"`
		Used     bool       `json:"used"`
		Personal bool       `json:"personal"`
		Active   bool       `json:"-"`
		Start    *time.Time `json:"-"`
	}
	out := []c{}
	for rows.Next() {
		var x c
		if rows.Scan(&x.Code, &x.Type, &x.Value, &x.MinOrder, &x.EndDate, &x.Start, &x.Active, &x.Used, &x.Title, &x.Host, &x.Personal) == nil && x.Active && (x.Start == nil || !x.Start.After(time.Now())) {
			out = append(out, x)
		}
	}
	respondJSON(w, http.StatusOK, out)
}

func (h *MemberHandler) mustMember(r *http.Request, id int) *memberRow {
	m := &memberRow{ID: id}
	h.DB.QueryRow(r.Context(), `SELECT birthday FROM members WHERE id=$1`, id).Scan(&m.Birthday)
	return m
}

// ClaimCoupon serves POST /member/coupons/claim {code}: adds a (live) coupon code to the account.
func (h *MemberHandler) ClaimCoupon(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Code string `json:"code"`
	}
	if err := decodeJSON(r, &req); err != nil || strings.TrimSpace(req.Code) == "" {
		respondError(w, http.StatusBadRequest, "code is required")
		return
	}
	code := strings.ToUpper(strings.TrimSpace(req.Code))
	var pid int
	var active bool
	var end *time.Time
	var bound *int
	if h.DB.QueryRow(r.Context(), `SELECT id, is_active, end_date, member_id FROM promotions WHERE code=$1`, code).Scan(&pid, &active, &end, &bound) != nil || (bound != nil && *bound != mid(r)) {
		respondError(w, http.StatusNotFound, "kode kupon tidak ditemukan")
		return
	}
	if !active || (end != nil && end.Before(time.Now())) {
		respondError(w, http.StatusConflict, "kupon sudah tidak berlaku")
		return
	}
	h.DB.Exec(r.Context(), `INSERT INTO member_coupons (member_id, promotion_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, mid(r), pid)
	respondJSON(w, http.StatusOK, map[string]string{"code": code})
}

// ---- orders + wallet ----

// Orders serves GET /member/orders: orders placed while signed in plus the orders of the linked customer (same verified phone).
func (h *MemberHandler) Orders(w http.ResponseWriter, r *http.Request) {
	var cid *int
	h.DB.QueryRow(r.Context(), `SELECT customer_id FROM members WHERE id=$1`, mid(r)).Scan(&cid)
	rows, err := h.DB.Query(r.Context(), `
		SELECT o.order_no, c.phone, o.status FROM orders o JOIN customers c ON c.id = o.customer_id
		WHERE o.sales_channel='website' AND (o.member_id=$1 OR ($2::int IS NOT NULL AND o.customer_id=$2)) ORDER BY o.created_at DESC LIMIT 60`, mid(r), cid)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load orders")
		return
	}
	defer rows.Close()
	type ref struct {
		OrderNo string `json:"order_no"`
		Phone   string `json:"phone"`
		Status  string `json:"status"`
	}
	out := []ref{}
	for rows.Next() {
		var x ref
		if rows.Scan(&x.OrderNo, &x.Phone, &x.Status) == nil {
			out = append(out, x)
		}
	}
	respondJSON(w, http.StatusOK, out)
}

// Ledger serves GET /member/ledger?kind=balance|points.
func (h *MemberHandler) Ledger(w http.ResponseWriter, r *http.Request) {
	kind := r.URL.Query().Get("kind")
	args := []interface{}{mid(r)}
	where := ""
	if kind == "balance" || kind == "points" {
		where = " AND kind=$2"
		args = append(args, kind)
	}
	rows, err := h.DB.Query(r.Context(), `SELECT kind, amount, reason, COALESCE(note,''), created_at FROM member_ledger WHERE member_id=$1`+where+` ORDER BY created_at DESC, id DESC LIMIT 100`, args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load ledger")
		return
	}
	defer rows.Close()
	type e struct {
		Kind      string    `json:"kind"`
		Amount    float64   `json:"amount"`
		Reason    string    `json:"reason"`
		Note      string    `json:"note"`
		CreatedAt time.Time `json:"created_at"`
	}
	out := []e{}
	for rows.Next() {
		var x e
		if rows.Scan(&x.Kind, &x.Amount, &x.Reason, &x.Note, &x.CreatedAt) == nil {
			out = append(out, x)
		}
	}
	respondJSON(w, http.StatusOK, out)
}

// Sync serves POST /member/sync: the first login merges what the device collected as a guest -
// favourites, claimed coupon codes, the local profile and order numbers (looked up with their phone).
func (h *MemberHandler) Sync(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Favorites []struct {
			ID    int     `json:"id"`
			Price float64 `json:"price"`
		} `json:"favorites"`
		Coupons []string               `json:"coupons"`
		Profile map[string]interface{} `json:"profile"`
		Name    string                 `json:"name"`
		Orders  []struct {
			OrderNo string `json:"orderNo"`
			Phone   string `json:"phone"`
		} `json:"orders"`
	}
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	id, ctx := mid(r), r.Context()
	for i, f := range req.Favorites {
		if i >= 100 {
			break
		}
		h.DB.Exec(ctx, `INSERT INTO member_favorites (member_id, product_id, price_at_save) SELECT $1,$2,NULLIF($3,0) WHERE EXISTS (SELECT 1 FROM products WHERE id=$2) ON CONFLICT DO NOTHING`, id, f.ID, f.Price)
	}
	for i, c := range req.Coupons {
		if i >= 50 {
			break
		}
		h.DB.Exec(ctx, `INSERT INTO member_coupons (member_id, promotion_id) SELECT $1, id FROM promotions WHERE code=$2 AND member_id IS NULL ON CONFLICT DO NOTHING`, id, strings.ToUpper(strings.TrimSpace(c)))
	}
	if req.Profile != nil {
		raw, _ := json.Marshal(req.Profile)
		h.DB.Exec(ctx, `UPDATE members SET profile = $2::jsonb || profile WHERE id=$1`, id, string(raw))
	}
	if n := strings.TrimSpace(req.Name); n != "" {
		h.DB.Exec(ctx, `UPDATE members SET name=$2 WHERE id=$1 AND name=''`, id, n)
	}
	for i, o := range req.Orders {
		if i >= 30 {
			break
		}
		// the order number + phone are the shared secret (as for tracking): attach it to this account
		h.DB.Exec(ctx, `
			UPDATE orders SET member_id=$1 WHERE order_no=$2 AND member_id IS NULL
			  AND customer_id IN (SELECT id FROM customers WHERE phone = $3)`, id, o.OrderNo, o.Phone)
	}
	respondJSON(w, http.StatusOK, h.memberView(ctx, id))
}
