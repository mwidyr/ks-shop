package handlers

import (
	"context"
	"crypto/rand"
	"errors"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"golang.org/x/crypto/bcrypt"
)

const (
	memberPasswordMin  = 8
	memberPasswordMax  = 72 // bcrypt only reads the first 72 bytes
	memberLoginMaxFail = 5
	memberLoginLock    = 15 * time.Minute
)

// validMemberPassword checks the rules shown on the form: 8 to 72 bytes, not just blanks.
func validMemberPassword(pw string) error {
	if strings.TrimSpace(pw) == "" || utf8.RuneCountInString(pw) < memberPasswordMin {
		return errors.New("password minimal 8 karakter")
	}
	if len(pw) > memberPasswordMax {
		return errors.New("password terlalu panjang (maks. 72 karakter)")
	}
	return nil
}

// dummyHash is compared against when an email has no account / no password, so a wrong login takes the same
// time either way and cannot be used to find out which emails are registered.
var dummyHash = func() []byte {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	h, _ := bcrypt.GenerateFromPassword(b, bcrypt.DefaultCost)
	return h
}()

func (h *MemberHandler) setPassword(ctx context.Context, db dbx, memberID int, pw string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(pw), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	_, err = db.Exec(ctx, `UPDATE members SET password_hash=$2, password_changed_at=now(), login_failures=0, locked_until=NULL WHERE id=$1`, memberID, string(hash))
	return err
}

const loginFailed = "email atau password salah"

// Login serves POST /public/member/login {email, password}. Every failure answers the same way (wrong password, no
// such email, no password set yet, inactive, temporarily locked), so it never reveals whether an email has an account.
func (h *MemberHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := decodeJSON(r, &req); err != nil || strings.TrimSpace(req.Email) == "" || req.Password == "" || len(req.Password) > 200 {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if !siteLimiter.allow("mlogin:"+clientIP(r), 30, 15*time.Minute) {
		respondError(w, http.StatusTooManyRequests, "terlalu banyak percobaan, coba lagi nanti")
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	ctx := r.Context()
	var id, failures int
	var hash *string
	var active bool
	var lockedUntil *time.Time
	err := h.DB.QueryRow(ctx, `SELECT id, password_hash, is_active, login_failures, locked_until FROM members WHERE lower(email)=$1`, email).
		Scan(&id, &hash, &active, &failures, &lockedUntil)
	if err != nil || hash == nil || *hash == "" {
		_ = bcrypt.CompareHashAndPassword(dummyHash, []byte(req.Password))
		respondError(w, http.StatusUnauthorized, loginFailed)
		return
	}
	locked := lockedUntil != nil && lockedUntil.After(time.Now())
	ok := bcrypt.CompareHashAndPassword([]byte(*hash), []byte(req.Password)) == nil
	if locked || !ok {
		if !locked {
			// the 5th wrong password in a row locks password sign-in for 15 minutes (the mailed code still works)
			h.DB.Exec(ctx, `UPDATE members SET login_failures = login_failures + 1,
				locked_until = CASE WHEN login_failures + 1 >= $2 THEN now() + $3::interval ELSE locked_until END WHERE id=$1`,
				id, memberLoginMaxFail, "15 minutes")
		}
		respondError(w, http.StatusUnauthorized, loginFailed)
		return
	}
	if !active {
		respondError(w, http.StatusUnauthorized, loginFailed)
		return
	}
	h.DB.Exec(ctx, `UPDATE members SET login_failures=0, locked_until=NULL, last_login_at=now() WHERE id=$1`, id)
	m, err := h.findMember(ctx, h.DB, "", email)
	if err != nil {
		respondError(w, http.StatusUnauthorized, loginFailed)
		return
	}
	h.session(w, ctx, m, false)
}

// ChangePassword serves POST /member/password {current_password, new_password}. A member who already has a password
// must give the current one; one who never set it (registered before passwords existed) can set it from the session.
func (h *MemberHandler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Current string `json:"current_password"`
		New     string `json:"new_password"`
	}
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	id := mid(r)
	if !siteLimiter.allow("mpw:"+itoa(id), 10, time.Hour) {
		respondError(w, http.StatusTooManyRequests, "terlalu banyak percobaan, coba lagi nanti")
		return
	}
	if err := validMemberPassword(req.New); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	var hash *string
	if err := h.DB.QueryRow(r.Context(), `SELECT password_hash FROM members WHERE id=$1`, id).Scan(&hash); err != nil {
		respondError(w, http.StatusNotFound, "akun tidak ditemukan")
		return
	}
	if hash != nil && *hash != "" {
		if bcrypt.CompareHashAndPassword([]byte(*hash), []byte(req.Current)) != nil {
			respondError(w, http.StatusForbidden, "password saat ini salah")
			return
		}
	}
	if err := h.setPassword(r.Context(), h.DB, id, req.New); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save password")
		return
	}
	respondJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
