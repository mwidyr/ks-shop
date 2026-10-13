package handlers

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/mail"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"ordermgmt/internal/auth"
	"ordermgmt/internal/mailer"
)

const (
	memberOTPTTL      = 10 * time.Minute
	memberOTPMaxTries = 5
	memberOTPCooldown = 30 * time.Second
)

// ---- email OTP (same primitives as staff login OTP: NewOTPCode / HashToken / mailer.Send, 30 s cooldown, attempts lock) ----

type memberEmailRequest struct {
	Email string `json:"email"`
	Ref   string `json:"ref"`
}

// EmailRequest serves POST /public/member/email/request. It is also the "resend" action: a code issued less than
// 30 seconds ago is not re-sent (the earlier one still works), older live codes are invalidated. The answer is
// always the same so the endpoint never reveals whether an email has an account.
func (h *MemberHandler) EmailRequest(w http.ResponseWriter, r *http.Request) {
	var req memberEmailRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	if _, err := mail.ParseAddress(email); err != nil || len(email) > 150 || !strings.Contains(email, ".") {
		respondError(w, http.StatusBadRequest, "email tidak valid")
		return
	}
	ip := clientIP(r)
	if !siteLimiter.allow("memail:"+ip, 10, time.Hour) || !siteLimiter.allow("memail-to:"+email, 6, time.Hour) {
		respondError(w, http.StatusTooManyRequests, "terlalu banyak permintaan kode, coba lagi nanti")
		return
	}
	ctx := r.Context()
	var recent bool
	h.DB.QueryRow(ctx, `SELECT true FROM member_otps WHERE channel='email' AND target=$1 AND used_at IS NULL AND created_at > now() - $2::interval LIMIT 1`,
		email, fmt.Sprintf("%d seconds", int(memberOTPCooldown.Seconds()))).Scan(&recent)
	if !recent {
		h.DB.Exec(ctx, `UPDATE member_otps SET used_at=now() WHERE channel='email' AND target=$1 AND used_at IS NULL`, email)
		if code, err := auth.NewOTPCode(); err == nil {
			if _, err := h.DB.Exec(ctx, `INSERT INTO member_otps (channel, target, code_hash, referral_code, expires_at) VALUES ('email',$1,$2,NULLIF($3,''),now()+$4::interval)`,
				email, auth.HashToken(email+":"+code), strings.ToUpper(strings.TrimSpace(req.Ref)), fmt.Sprintf("%d seconds", int(memberOTPTTL.Seconds()))); err == nil {
				mailer.Send(h.Cfg, email, "ralulu - kode verifikasi / verification code",
					fmt.Sprintf("Kode verifikasi ralulu: %s\nralulu verification code: %s\nralulu 驗證碼：%s\n\n10 menit / 10 minutes / 10 分鐘。\nJangan bagikan kode ini / Do not share this code / 請勿分享此驗證碼。", code, code, code))
			}
		}
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"sent": true, "cooldown": int(memberOTPCooldown.Seconds())})
}

type memberEmailVerify struct {
	Email string `json:"email"`
	Code  string `json:"code"`
}

// EmailVerify serves POST /public/member/email/verify: a valid code logs in (or registers) the member.
func (h *MemberHandler) EmailVerify(w http.ResponseWriter, r *http.Request) {
	var req memberEmailVerify
	if err := decodeJSON(r, &req); err != nil || req.Email == "" || req.Code == "" {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	ctx := r.Context()
	var id, attempts int
	var hash string
	var ref *string
	err := h.DB.QueryRow(ctx, `
		SELECT id, attempts, code_hash, referral_code FROM member_otps
		WHERE channel='email' AND target=$1 AND used_at IS NULL AND expires_at > now() ORDER BY id DESC LIMIT 1`, email).Scan(&id, &attempts, &hash, &ref)
	if err != nil {
		respondError(w, http.StatusUnauthorized, "kode salah atau sudah kedaluwarsa")
		return
	}
	if attempts >= memberOTPMaxTries {
		respondError(w, http.StatusUnauthorized, "terlalu banyak percobaan, minta kode baru")
		return
	}
	if auth.HashToken(email+":"+strings.TrimSpace(req.Code)) != hash {
		h.DB.Exec(ctx, `UPDATE member_otps SET attempts=attempts+1 WHERE id=$1`, id)
		respondError(w, http.StatusUnauthorized, "kode salah atau sudah kedaluwarsa")
		return
	}
	h.DB.Exec(ctx, `UPDATE member_otps SET used_at=now() WHERE id=$1`, id)
	refCode := ""
	if ref != nil {
		refCode = *ref
	}
	m, created, err := h.loginOrCreate(ctx, "", email, refCode)
	if err != nil {
		respondError(w, http.StatusForbidden, err.Error())
		return
	}
	h.session(w, ctx, m, created)
}

// ---- WhatsApp OTP: the member sends the code to the shop number from their own WhatsApp ----

// WhatsAppProvider is how inbound WhatsApp messages reach us. "cloud" = Meta WhatsApp Cloud API webhook (HMAC signed),
// "gateway" = a generic third-party gateway posting {from, text} with a shared secret, "off" (default) = not set up.
func waProvider() string {
	p := strings.ToLower(strings.TrimSpace(os.Getenv("WHATSAPP_PROVIDER")))
	switch p {
	case "cloud", "gateway":
		return p
	}
	return "off"
}

type memberWAStart struct {
	Phone   string `json:"phone"`
	Country string `json:"country"`
	Ref     string `json:"ref"`
}

// WAStart serves POST /public/member/wa/start {phone, country}: creates a pending challenge. The client opens
// wa_url (the shop's WhatsApp with "ralulu <code>" filled in), the member just presses send, and polls WAStatus.
func (h *MemberHandler) WAStart(w http.ResponseWriter, r *http.Request) {
	if waProvider() == "off" {
		respondJSON(w, http.StatusOK, map[string]interface{}{"configured": false})
		return
	}
	var req memberWAStart
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	phone := CanonicalPhone(req.Country, req.Phone)
	if phone == "" {
		respondError(w, http.StatusBadRequest, "nomor HP tidak valid")
		return
	}
	if !siteLimiter.allow("mwa:"+clientIP(r), 10, time.Hour) || !siteLimiter.allow("mwa-to:"+phone, 6, time.Hour) {
		respondError(w, http.StatusTooManyRequests, "terlalu banyak permintaan kode, coba lagi nanti")
		return
	}
	site := &SiteHandler{DB: h.DB}
	shop := site.setting(r.Context(), "whatsapp_number", "")
	if shop == "" {
		respondJSON(w, http.StatusOK, map[string]interface{}{"configured": false})
		return
	}
	code, err := auth.NewOTPCode()
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create code")
		return
	}
	h.DB.Exec(r.Context(), `UPDATE member_otps SET used_at=now() WHERE channel='wa' AND target=$1 AND used_at IS NULL`, phone)
	var id int
	if err := h.DB.QueryRow(r.Context(), `
		INSERT INTO member_otps (channel, target, code_hash, referral_code, expires_at) VALUES ('wa',$1,$2,NULLIF($3,''),now()+$4::interval) RETURNING id`,
		phone, auth.HashToken(phone+":"+code), strings.ToUpper(strings.TrimSpace(req.Ref)), fmt.Sprintf("%d seconds", int(memberOTPTTL.Seconds()))).Scan(&id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create challenge")
		return
	}
	text := "ralulu " + code
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"configured": true, "challenge_id": id, "code": code, "phone": phone, "expires_in": int(memberOTPTTL.Seconds()),
		"wa_url": WhatsAppURL(shop, text), "text": text,
	})
}

// WAStatus serves GET /public/member/wa/status/{id}?phone=: pending / verified (+ session, returned once) / expired.
func (h *MemberHandler) WAStatus(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid id")
		return
	}
	phone := CanonicalPhone(r.URL.Query().Get("country"), r.URL.Query().Get("phone"))
	var target string
	var verified, used *time.Time
	var expires time.Time
	var ref *string
	if err := h.DB.QueryRow(r.Context(), `SELECT target, wa_verified_at, used_at, expires_at, referral_code FROM member_otps WHERE id=$1 AND channel='wa'`, id).
		Scan(&target, &verified, &used, &expires, &ref); err != nil || target != phone {
		respondError(w, http.StatusNotFound, "challenge not found")
		return
	}
	switch {
	case verified != nil && used == nil:
		// one-time: claim it atomically so two polls can't both get a session
		ct, _ := h.DB.Exec(r.Context(), `UPDATE member_otps SET used_at=now() WHERE id=$1 AND used_at IS NULL`, id)
		if ct.RowsAffected() == 0 {
			respondJSON(w, http.StatusOK, map[string]string{"status": "expired"})
			return
		}
		refCode := ""
		if ref != nil {
			refCode = *ref
		}
		m, created, err := h.loginOrCreate(r.Context(), target, "", refCode)
		if err != nil {
			respondError(w, http.StatusForbidden, err.Error())
			return
		}
		h.session(w, r.Context(), m, created)
	case used != nil || time.Now().After(expires):
		respondJSON(w, http.StatusOK, map[string]string{"status": "expired"})
	default:
		respondJSON(w, http.StatusOK, map[string]string{"status": "pending"})
	}
}

// ---- inbound webhook ----

// inboundWA is one received WhatsApp text: the sender's number (digits, country code) and the text.
type inboundWA struct{ From, Text string }

// parseCloudWebhook extracts messages from a Meta WhatsApp Cloud API payload.
func parseCloudWebhook(body []byte) []inboundWA {
	var p struct {
		Entry []struct {
			Changes []struct {
				Value struct {
					Messages []struct {
						From string `json:"from"`
						Type string `json:"type"`
						Text struct {
							Body string `json:"body"`
						} `json:"text"`
					} `json:"messages"`
				} `json:"value"`
			} `json:"changes"`
		} `json:"entry"`
	}
	if json.Unmarshal(body, &p) != nil {
		return nil
	}
	var out []inboundWA
	for _, e := range p.Entry {
		for _, c := range e.Changes {
			for _, m := range c.Value.Messages {
				if m.Type == "text" {
					out = append(out, inboundWA{From: digitsOnly.ReplaceAllString(m.From, ""), Text: m.Text.Body})
				}
			}
		}
	}
	return out
}

// VerifyCloudSignature checks Meta's X-Hub-Signature-256 ("sha256=<hex>") over the raw body.
func VerifyCloudSignature(secret string, body []byte, header string) bool {
	if secret == "" || !strings.HasPrefix(header, "sha256=") {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	want := mac.Sum(nil)
	got, err := hex.DecodeString(strings.TrimPrefix(header, "sha256="))
	return err == nil && hmac.Equal(want, got)
}

// WebhookVerify serves GET /webhooks/whatsapp (Meta's subscription handshake: hub.challenge).
func (h *MemberHandler) WebhookVerify(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	token := os.Getenv("WHATSAPP_VERIFY_TOKEN")
	if token != "" && q.Get("hub.mode") == "subscribe" && hmac.Equal([]byte(q.Get("hub.verify_token")), []byte(token)) {
		_, _ = w.Write([]byte(q.Get("hub.challenge")))
		return
	}
	http.Error(w, "forbidden", http.StatusForbidden)
}

// Webhook serves POST /webhooks/whatsapp. Each inbound text is matched against pending challenges: the text must
// contain the 6-digit code AND the sender's number must equal the number the member typed, so a code seen on someone
// else's screen is useless. Always answers 200 (providers retry on errors).
func (h *MemberHandler) Webhook(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		w.WriteHeader(http.StatusOK)
		return
	}
	var msgs []inboundWA
	switch waProvider() {
	case "cloud":
		if !VerifyCloudSignature(os.Getenv("WHATSAPP_APP_SECRET"), body, r.Header.Get("X-Hub-Signature-256")) {
			http.Error(w, "bad signature", http.StatusUnauthorized)
			return
		}
		msgs = parseCloudWebhook(body)
	case "gateway":
		secret := os.Getenv("WHATSAPP_GATEWAY_SECRET")
		if secret == "" || !hmac.Equal([]byte(r.Header.Get("X-Webhook-Secret")), []byte(secret)) {
			http.Error(w, "forbidden", http.StatusUnauthorized)
			return
		}
		var m struct {
			From string `json:"from"`
			Text string `json:"text"`
		}
		if json.Unmarshal(body, &m) == nil {
			msgs = append(msgs, inboundWA{From: digitsOnly.ReplaceAllString(m.From, ""), Text: m.Text})
		}
	default:
		http.Error(w, "whatsapp login is not configured", http.StatusNotFound)
		return
	}
	for _, m := range msgs {
		h.matchInbound(r, m)
	}
	w.WriteHeader(http.StatusOK)
}

var codeInText = func() func(string) []string {
	return func(s string) []string {
		var out []string
		cur := ""
		for _, c := range s + " " {
			if c >= '0' && c <= '9' {
				cur += string(c)
				continue
			}
			if len(cur) == 6 {
				out = append(out, cur)
			}
			cur = ""
		}
		return out
	}
}()

func (h *MemberHandler) matchInbound(r *http.Request, m inboundWA) {
	if m.From == "" {
		return
	}
	ctx := r.Context()
	for _, code := range codeInText(m.Text) {
		var id, attempts int
		err := h.DB.QueryRow(ctx, `
			SELECT id, attempts FROM member_otps
			WHERE channel='wa' AND target=$1 AND code_hash=$2 AND used_at IS NULL AND wa_verified_at IS NULL AND expires_at > now()
			ORDER BY id DESC LIMIT 1`, m.From, auth.HashToken(m.From+":"+code)).Scan(&id, &attempts)
		if err == nil && attempts < memberOTPMaxTries {
			h.DB.Exec(ctx, `UPDATE member_otps SET wa_verified_at=now() WHERE id=$1`, id)
			return
		}
	}
	// a code-looking message from a number with a pending challenge but a wrong code counts as an attempt
	h.DB.Exec(ctx, `UPDATE member_otps SET attempts=attempts+1 WHERE channel='wa' AND target=$1 AND used_at IS NULL AND wa_verified_at IS NULL AND expires_at > now()`, m.From)
}
