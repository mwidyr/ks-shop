package handlers

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	appmw "ordermgmt/internal/middleware"
)

// MemberAdminHandler is the Ralulu Hub side of website accounts: list, detail with wallet history, manual
// wallet adjustment, deactivate, and the editable reward rules.
type MemberAdminHandler struct {
	DB *pgxpool.Pool
}

// List serves GET /admin/members?q=.
func (h *MemberAdminHandler) List(w http.ResponseWriter, r *http.Request) {
	args := []interface{}{}
	where := ""
	if q := strings.TrimSpace(r.URL.Query().Get("q")); q != "" {
		args = append(args, "%"+q+"%")
		where = ` WHERE m.name ILIKE $1 OR m.email ILIKE $1 OR m.phone ILIKE $1 OR m.referral_code ILIKE $1`
	}
	pg := parsePage(r, 25, 100)
	total := 0
	limit := " LIMIT 200"
	if isPaged(r) {
		h.DB.QueryRow(r.Context(), `SELECT COUNT(*) FROM members m`+where, args...).Scan(&total)
		limit = pg.limitSQL(&args)
	}
	rows, err := h.DB.Query(r.Context(), `
		SELECT m.id, m.name, COALESCE(m.phone,''), COALESCE(m.email,''), m.referral_code, m.is_active, m.created_at, m.last_login_at,
		       COALESCE((SELECT SUM(amount) FROM member_ledger l WHERE l.member_id=m.id AND l.kind='balance'),0),
		       COALESCE((SELECT SUM(amount) FROM member_ledger l WHERE l.member_id=m.id AND l.kind='points'),0),
		       (SELECT COUNT(*) FROM orders o WHERE o.member_id=m.id)
		FROM members m`+where+` ORDER BY m.created_at DESC, m.id DESC`+limit, args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load members")
		return
	}
	defer rows.Close()
	type row struct {
		ID        int        `json:"id"`
		Name      string     `json:"name"`
		Phone     string     `json:"phone"`
		Email     string     `json:"email"`
		Referral  string     `json:"referral_code"`
		Active    bool       `json:"is_active"`
		CreatedAt time.Time  `json:"created_at"`
		LastLogin *time.Time `json:"last_login_at"`
		Balance   float64    `json:"balance"`
		Points    float64    `json:"points"`
		Orders    int        `json:"orders"`
	}
	out := []row{}
	for rows.Next() {
		var x row
		if rows.Scan(&x.ID, &x.Name, &x.Phone, &x.Email, &x.Referral, &x.Active, &x.CreatedAt, &x.LastLogin, &x.Balance, &x.Points, &x.Orders) == nil {
			out = append(out, x)
		}
	}
	if isPaged(r) {
		respondJSON(w, http.StatusOK, pageResponse(out, total, pg))
		return
	}
	respondJSON(w, http.StatusOK, out)
}

// Detail serves GET /admin/members/{id}: profile + latest wallet entries.
func (h *MemberAdminHandler) Detail(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid id")
		return
	}
	mh := &MemberHandler{DB: h.DB}
	view := mh.memberView(r.Context(), id)
	if view == nil {
		respondError(w, http.StatusNotFound, "member not found")
		return
	}
	var referredBy, referrals int
	var active bool
	h.DB.QueryRow(r.Context(), `SELECT COALESCE(referred_by,0), is_active FROM members WHERE id=$1`, id).Scan(&referredBy, &active)
	h.DB.QueryRow(r.Context(), `SELECT COUNT(*) FROM members WHERE referred_by=$1`, id).Scan(&referrals)
	rows, _ := h.DB.Query(r.Context(), `SELECT kind, amount, reason, COALESCE(note,''), created_at FROM member_ledger WHERE member_id=$1 ORDER BY created_at DESC, id DESC LIMIT 100`, id)
	type e struct {
		Kind      string    `json:"kind"`
		Amount    float64   `json:"amount"`
		Reason    string    `json:"reason"`
		Note      string    `json:"note"`
		CreatedAt time.Time `json:"created_at"`
	}
	ledger := []e{}
	if rows != nil {
		for rows.Next() {
			var x e
			if rows.Scan(&x.Kind, &x.Amount, &x.Reason, &x.Note, &x.CreatedAt) == nil {
				ledger = append(ledger, x)
			}
		}
		rows.Close()
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"member": view, "is_active": active, "referred_by": referredBy, "referrals": referrals, "ledger": ledger})
}

// Adjust serves POST /admin/members/{id}/adjust {kind, amount, note}: manual wallet correction (note required, logged).
func (h *MemberAdminHandler) Adjust(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req struct {
		Kind   string  `json:"kind"`
		Amount float64 `json:"amount"`
		Note   string  `json:"note"`
	}
	if err := decodeJSON(r, &req); err != nil || (req.Kind != "balance" && req.Kind != "points") || req.Amount == 0 || strings.TrimSpace(req.Note) == "" {
		respondError(w, http.StatusBadRequest, "jenis, jumlah, dan catatan wajib diisi")
		return
	}
	claims := appmw.GetClaims(r)
	if _, err := h.DB.Exec(r.Context(), `INSERT INTO member_ledger (member_id, kind, amount, reason, note, created_by) VALUES ($1,$2,$3,'admin_adjust',$4,$5)`,
		id, req.Kind, req.Amount, strings.TrimSpace(req.Note), claims.UserID); err != nil {
		respondError(w, http.StatusBadRequest, "member tidak ditemukan")
		return
	}
	bal, pts := balancesOf(r.Context(), h.DB, id)
	if bal < 0 || pts < 0 {
		h.DB.Exec(r.Context(), `DELETE FROM member_ledger WHERE id = (SELECT MAX(id) FROM member_ledger WHERE member_id=$1 AND reason='admin_adjust')`, id)
		respondError(w, http.StatusBadRequest, "saldo / poin tidak boleh menjadi negatif")
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"balance": bal, "points": pts})
}

// SetActive serves PATCH /admin/members/{id} {is_active}.
func (h *MemberAdminHandler) SetActive(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.Atoi(chi.URLParam(r, "id"))
	var req struct {
		Active bool `json:"is_active"`
	}
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	h.DB.Exec(r.Context(), `UPDATE members SET is_active=$2 WHERE id=$1`, id, req.Active)
	respondJSON(w, http.StatusOK, map[string]bool{"is_active": req.Active})
}

// GetRewards serves GET /admin/reward-settings.
func (h *MemberAdminHandler) GetRewards(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, (&MemberHandler{}).rewardSettings(r.Context(), h.DB))
}

// SaveRewards serves PUT /admin/reward-settings (validated ranges).
func (h *MemberAdminHandler) SaveRewards(w http.ResponseWriter, r *http.Request) {
	var s RewardSettings
	if err := decodeJSON(r, &s); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	switch {
	case s.WelcomeBalance < 0 || s.WelcomeVoucherAmount < 0 || s.WelcomeVoucherMinOrder < 0 || s.ReferralReward < 0 || s.PointsPer100 < 0:
		respondError(w, http.StatusBadRequest, "nilai tidak boleh negatif")
		return
	case s.PointValue <= 0 || s.PointValue > 100:
		respondError(w, http.StatusBadRequest, "nilai 1 poin harus lebih dari 0")
		return
	case s.BirthdayDiscountPct < 0 || s.BirthdayDiscountPct > 100 || s.RefundCreditBonusPct < 0 || s.RefundCreditBonusPct > 100:
		respondError(w, http.StatusBadRequest, "persentase harus 0-100")
		return
	case s.WelcomeVoucherDays < 1 || s.WelcomeVoucherDays > 365:
		respondError(w, http.StatusBadRequest, "masa berlaku voucher 1-365 hari")
		return
	}
	if _, err := h.DB.Exec(r.Context(), `
		UPDATE reward_settings SET welcome_balance=$1, welcome_voucher_amount=$2, welcome_voucher_min_order=$3, welcome_voucher_days=$4, referral_reward=$5,
		       points_per_100=$6, point_value=$7, birthday_discount_pct=$8, refund_credit_bonus_pct=$9, updated_at=now() WHERE id=1`,
		s.WelcomeBalance, s.WelcomeVoucherAmount, s.WelcomeVoucherMinOrder, s.WelcomeVoucherDays, s.ReferralReward, s.PointsPer100, s.PointValue, s.BirthdayDiscountPct, s.RefundCreditBonusPct); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save")
		return
	}
	respondJSON(w, http.StatusOK, s)
}
