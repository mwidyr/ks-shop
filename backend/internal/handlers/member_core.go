package handlers

import (
	"context"
	"crypto/rand"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"ordermgmt/internal/auth"
	"ordermgmt/internal/config"
)

// MemberHandler serves website accounts: login by WhatsApp number (the member sends the code from their own
// WhatsApp) or email OTP, the account API, the wallet (balance / points), referral and member coupons.
type MemberHandler struct {
	DB        *pgxpool.Pool
	Cfg       config.Config
	JWTSecret string
}

// dbx is satisfied by both pgxpool.Pool and pgx.Tx.
type dbx interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

// ---- phone numbers ----

var digitsOnly = regexp.MustCompile(`\D+`)

// CanonicalPhone turns what a person types into digits with the country code. country is the dial code the
// form had selected ("886" default); a leading 0 means a local number, a leading + / 00 / the country code
// means it is already international. Returns "" when it cannot be a mobile number.
func CanonicalPhone(country, raw string) string {
	trimmed := strings.TrimSpace(raw)
	d := digitsOnly.ReplaceAllString(trimmed, "")
	if d == "" {
		return ""
	}
	if country == "" {
		country = "886"
	}
	switch {
	case strings.HasPrefix(trimmed, "+"):
		// already international
	case strings.HasPrefix(d, "00"):
		d = d[2:]
	case strings.HasPrefix(d, "0"):
		d = country + d[1:]
	case strings.HasPrefix(d, country):
		// typed with the country code but no +
	default:
		d = country + d
	}
	if len(d) < 9 || len(d) > 15 {
		return ""
	}
	return d
}

// phoneVariants lists how a canonical number may be stored in customers.phone (orders typed 0912..., +886...).
func phoneVariants(canon string) []string {
	out := []string{canon, "+" + canon}
	if strings.HasPrefix(canon, "886") {
		out = append(out, "0"+canon[3:], "+886 "+canon[3:], "0"+canon[3:4]+" "+canon[4:])
	}
	if strings.HasPrefix(canon, "62") {
		out = append(out, "0"+canon[2:])
	}
	return out
}

// ---- codes ----

const referralAlphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"

func newReferralCode() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	for i := range b {
		b[i] = referralAlphabet[int(b[i])%len(referralAlphabet)]
	}
	return string(b)
}

// ---- member records ----

type memberRow struct {
	ID           int
	Phone, Email *string
	Name         string
	Birthday     *time.Time
	Language     string
	ReferralCode string
	ReferredBy   *int
	CustomerID   *int
	IsActive     bool
}

func (h *MemberHandler) findMember(ctx context.Context, db dbx, phone, email string) (*memberRow, error) {
	var m memberRow
	var err error
	q := `SELECT id, phone, email, name, birthday, language, referral_code, referred_by, customer_id, is_active FROM members WHERE `
	switch {
	case phone != "":
		err = db.QueryRow(ctx, q+`phone=$1`, phone).Scan(&m.ID, &m.Phone, &m.Email, &m.Name, &m.Birthday, &m.Language, &m.ReferralCode, &m.ReferredBy, &m.CustomerID, &m.IsActive)
	default:
		err = db.QueryRow(ctx, q+`lower(email)=lower($1)`, email).Scan(&m.ID, &m.Phone, &m.Email, &m.Name, &m.Birthday, &m.Language, &m.ReferralCode, &m.ReferredBy, &m.CustomerID, &m.IsActive)
	}
	if err != nil {
		return nil, err
	}
	return &m, nil
}

// loginOrCreate finds the member for a verified phone / email or creates it (first login = registration).
// A new member gets the welcome balance and voucher (idempotent) and, with a valid referral code, the
// referrer link. A phone that matches an existing website customer links the member to that customer so
// past orders show up in the account.
func (h *MemberHandler) loginOrCreate(ctx context.Context, phone, email, refCode string) (*memberRow, bool, error) {
	if m, err := h.findMember(ctx, h.DB, phone, email); err == nil {
		if !m.IsActive {
			return nil, false, fmt.Errorf("account is inactive")
		}
		h.DB.Exec(ctx, `UPDATE members SET last_login_at=now() WHERE id=$1`, m.ID)
		if phone != "" && m.CustomerID == nil {
			h.linkCustomer(ctx, h.DB, m.ID, phone)
		}
		return m, false, nil
	}
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		return nil, false, err
	}
	defer tx.Rollback(ctx)

	var referrer *int
	if code := strings.ToUpper(strings.TrimSpace(refCode)); code != "" {
		var rid int
		if tx.QueryRow(ctx, `SELECT id FROM members WHERE referral_code=$1 AND is_active`, code).Scan(&rid) == nil {
			referrer = &rid
		}
	}
	var id int
	for attempt := 0; attempt < 5; attempt++ {
		err = tx.QueryRow(ctx, `
			INSERT INTO members (phone, email, referral_code, referred_by, last_login_at)
			VALUES (NULLIF($1,''), NULLIF($2,''), $3, $4, now()) RETURNING id`, phone, email, newReferralCode(), referrer).Scan(&id)
		if err == nil || !strings.Contains(err.Error(), "referral_code") {
			break
		}
	}
	if err != nil {
		return nil, false, err
	}
	if phone != "" {
		h.linkCustomer(ctx, tx, id, phone)
	}
	st := h.rewardSettings(ctx, tx)
	if st.WelcomeBalance > 0 {
		h.ledgerAdd(ctx, tx, id, "balance", st.WelcomeBalance, "welcome", fmt.Sprintf("welcome:%d", id), "", nil)
	}
	if st.WelcomeVoucherAmount > 0 {
		code := fmt.Sprintf("WELCOME-%d", id)
		tx.Exec(ctx, `
			INSERT INTO promotions (code, type, value, min_order_amount, end_date, usage_limit, per_customer_limit, is_active, member_id)
			VALUES ($1,'fixed_amount',$2,$3, now() + make_interval(days => $4), 1, 1, true, $5) ON CONFLICT (code) DO NOTHING`,
			code, st.WelcomeVoucherAmount, st.WelcomeVoucherMinOrder, st.WelcomeVoucherDays, id)
		tx.Exec(ctx, `INSERT INTO member_coupons (member_id, promotion_id) SELECT $1, id FROM promotions WHERE code=$2 ON CONFLICT DO NOTHING`, id, code)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, false, err
	}
	m, err := h.findMember(ctx, h.DB, phone, email)
	return m, true, err
}

// linkCustomer ties a member to the website customer with the same (verified) phone, if any.
func (h *MemberHandler) linkCustomer(ctx context.Context, db dbx, memberID int, canon string) {
	var cid int
	if db.QueryRow(ctx, `SELECT id FROM customers WHERE phone = ANY($1) ORDER BY id LIMIT 1`, phoneVariants(canon)).Scan(&cid) == nil {
		db.Exec(ctx, `UPDATE members SET customer_id=$2 WHERE id=$1 AND customer_id IS NULL`, memberID, cid)
	}
}

func (h *MemberHandler) session(w http.ResponseWriter, ctx context.Context, m *memberRow, created bool) {
	token, err := auth.GenerateMemberToken(h.JWTSecret, m.ID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create session")
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"token": token, "created": created, "member": h.memberView(ctx, m.ID)})
}
