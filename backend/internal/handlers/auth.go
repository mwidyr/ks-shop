package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"ordermgmt/internal/auth"
	"ordermgmt/internal/config"
	"ordermgmt/internal/mailer"
)

type AuthHandler struct {
	DB        *pgxpool.Pool
	JWTSecret string
	Cfg       config.Config
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// Login handles login for ALL roles including customer (unified users table).
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	row := h.DB.QueryRow(r.Context(), `
		SELECT u.id, u.name, u.email, u.password_hash, r.name, u.customer_id, u.is_active
		FROM users u JOIN roles r ON r.id = u.role_id
		WHERE u.email = $1`, req.Email)

	var (
		id                      int
		name, email, hash, role string
		customerID              *int
		isActive                bool
	)
	if err := row.Scan(&id, &name, &email, &hash, &role, &customerID, &isActive); err != nil {
		respondError(w, http.StatusUnauthorized, "invalid email or password")
		return
	}
	if !isActive {
		respondError(w, http.StatusForbidden, "account is inactive")
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)); err != nil {
		respondError(w, http.StatusUnauthorized, "invalid email or password")
		return
	}

	token, err := auth.GenerateToken(h.JWTSecret, id, name, email, role, customerID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"token": token,
		"user": map[string]interface{}{
			"id": id, "name": name, "email": email, "role": role, "customer_id": customerID,
		},
	})
}

type requestLoginOTPRequest struct {
	Email string `json:"email"`
}

const loginOTPPurpose = "login_otp"
const loginOTPTTL = 10 * time.Minute
const loginOTPMaxAttempts = 5

// RequestLoginOTP sends a 6-digit one-time login code to the given email - when it's either an
// already-active account, or a still-pending invite (password_hash IS NULL - never completed
// AcceptInvite, so a deliberately deactivated/offboarded account with a real password on file
// stays excluded). A pending invite that verifies its code gets activated by VerifyLoginOTP
// below - receiving and entering an emailed code proves email ownership at the same trust level
// as clicking an invite link, so OTP can stand in as an alternative onboarding path. Like
// ForgotPassword, the response is always the same generic message regardless of whether the
// email matched, to avoid leaking which emails are registered.
func (h *AuthHandler) RequestLoginOTP(w http.ResponseWriter, r *http.Request) {
	var req requestLoginOTPRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Email == "" {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	var userID int
	err := h.DB.QueryRow(r.Context(), `SELECT id FROM users WHERE email=$1 AND (is_active=true OR password_hash IS NULL)`, req.Email).Scan(&userID)
	if err == nil {
		// Skip silently if a code was already issued moments ago (e.g. a double-click) instead
		// of sending another email - the earlier code is still valid and unexpired.
		var recentlyIssued bool
		h.DB.QueryRow(r.Context(), `
			SELECT true FROM auth_tokens
			WHERE user_id=$1 AND purpose=$2 AND used_at IS NULL AND created_at > now() - interval '30 seconds'`,
			userID, loginOTPPurpose).Scan(&recentlyIssued)

		if !recentlyIssued {
			// Invalidate any older still-live codes so only the newest one works.
			h.DB.Exec(r.Context(), `UPDATE auth_tokens SET used_at=now() WHERE user_id=$1 AND purpose=$2 AND used_at IS NULL`, userID, loginOTPPurpose)

			if code, codeErr := auth.NewOTPCode(); codeErr == nil {
				if _, tokErr := h.DB.Exec(r.Context(), `
					INSERT INTO auth_tokens (user_id, token_hash, purpose, expires_at) VALUES ($1,$2,$3,now()+$4::interval)`,
					userID, auth.HashToken(code), loginOTPPurpose, fmt.Sprintf("%d seconds", int(loginOTPTTL.Seconds()))); tokErr == nil {
					mailer.Send(h.Cfg, req.Email, "Your login code",
						fmt.Sprintf("Your login code: %s\n\nValid for 10 minutes. Do not share this code with anyone.", code))
				}
			}
		}
	}

	respondJSON(w, http.StatusOK, map[string]string{"message": "if that email is registered, a login code has been sent"})
}

type verifyLoginOTPRequest struct {
	Email string `json:"email"`
	Code  string `json:"code"`
}

// VerifyLoginOTP checks the code emailed by RequestLoginOTP and, if valid, issues a normal
// session JWT - same response shape as Login, so the frontend handles both identically.
func (h *AuthHandler) VerifyLoginOTP(w http.ResponseWriter, r *http.Request) {
	var req verifyLoginOTPRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Email == "" || req.Code == "" {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	var (
		tokenID, attempts, id int
		storedHash            string
		name, email, role     string
		customerID            *int
		isActive, hasPassword bool
	)
	err := h.DB.QueryRow(r.Context(), `
		SELECT at.id, at.attempts, at.token_hash, u.id, u.name, u.email, r.name, u.customer_id, u.is_active, u.password_hash IS NOT NULL
		FROM auth_tokens at
		JOIN users u ON u.id = at.user_id
		JOIN roles r ON r.id = u.role_id
		WHERE u.email=$1 AND at.purpose=$2 AND at.used_at IS NULL AND at.expires_at > now()
		ORDER BY at.id DESC LIMIT 1`, req.Email, loginOTPPurpose).
		Scan(&tokenID, &attempts, &storedHash, &id, &name, &email, &role, &customerID, &isActive, &hasPassword)
	if err != nil {
		respondError(w, http.StatusUnauthorized, "invalid or expired code")
		return
	}
	if attempts >= loginOTPMaxAttempts {
		respondError(w, http.StatusUnauthorized, "too many attempts, request a new code")
		return
	}
	// A deliberately deactivated (offboarded) account has a real password on file - that must
	// stay blocked. A still-pending invite (no password ever set) is allowed through here and
	// gets activated below - same trust level as completing the invite-link flow.
	if !isActive && hasPassword {
		respondError(w, http.StatusForbidden, "account is inactive")
		return
	}
	if auth.HashToken(req.Code) != storedHash {
		h.DB.Exec(r.Context(), `UPDATE auth_tokens SET attempts=attempts+1 WHERE id=$1`, tokenID)
		respondError(w, http.StatusUnauthorized, "invalid or expired code")
		return
	}
	h.DB.Exec(r.Context(), `UPDATE auth_tokens SET used_at=now() WHERE id=$1`, tokenID)
	if !isActive {
		h.DB.Exec(r.Context(), `UPDATE users SET is_active=true WHERE id=$1`, id)
	}

	token, tokenErr := auth.GenerateToken(h.JWTSecret, id, name, email, role, customerID)
	if tokenErr != nil {
		respondError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"token": token,
		"user": map[string]interface{}{
			"id": id, "name": name, "email": email, "role": role, "customer_id": customerID,
		},
	})
}

type forgotPasswordRequest struct {
	Email string `json:"email"`
}

// ForgotPassword always responds with the same generic message regardless of whether the email
// matched an account, to avoid leaking which emails are registered.
func (h *AuthHandler) ForgotPassword(w http.ResponseWriter, r *http.Request) {
	var req forgotPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Email == "" {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	var userID int
	err := h.DB.QueryRow(r.Context(), `SELECT id FROM users WHERE email=$1 AND is_active=true`, req.Email).Scan(&userID)
	if err == nil {
		if raw, tokenErr := h.issueToken(r, userID, "reset", time.Hour); tokenErr == nil {
			link := fmt.Sprintf("%s/reset-password?token=%s", h.Cfg.AppBaseURL, raw)
			mailer.Send(h.Cfg, req.Email, "Reset your password",
				fmt.Sprintf("Click the link below to reset your password (valid 1 hour):\n\n%s", link))
		}
	}

	respondJSON(w, http.StatusOK, map[string]string{"message": "if that email is registered, a reset link has been sent"})
}

type resetPasswordRequest struct {
	Token    string `json:"token"`
	Password string `json:"password"`
}

func (h *AuthHandler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	var req resetPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Token == "" || len(req.Password) < 6 {
		respondError(w, http.StatusBadRequest, "invalid token or password too short")
		return
	}

	userID, tokenID, err := h.lookupToken(r, req.Token, "reset")
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid or expired token")
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to hash password")
		return
	}
	if _, err := h.DB.Exec(r.Context(), `UPDATE users SET password_hash=$1 WHERE id=$2`, string(hash), userID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to update password")
		return
	}
	h.DB.Exec(r.Context(), `UPDATE auth_tokens SET used_at=now() WHERE id=$1`, tokenID)

	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

type acceptInviteRequest struct {
	Token    string `json:"token"`
	Password string `json:"password"`
}

func (h *AuthHandler) AcceptInvite(w http.ResponseWriter, r *http.Request) {
	var req acceptInviteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Token == "" || len(req.Password) < 6 {
		respondError(w, http.StatusBadRequest, "invalid token or password too short")
		return
	}

	userID, tokenID, err := h.lookupToken(r, req.Token, "invite")
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid or expired token")
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to hash password")
		return
	}
	if _, err := h.DB.Exec(r.Context(), `UPDATE users SET password_hash=$1, is_active=true WHERE id=$2`, string(hash), userID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to activate account")
		return
	}
	h.DB.Exec(r.Context(), `UPDATE auth_tokens SET used_at=now() WHERE id=$1`, tokenID)

	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ValidateToken lets the frontend show "invite for foo@bar.com" / "link expired" before the
// user fills in a password, without spending the token.
func (h *AuthHandler) ValidateToken(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	var purpose, email string
	err := h.DB.QueryRow(r.Context(), `
		SELECT at.purpose, u.email
		FROM auth_tokens at JOIN users u ON u.id = at.user_id
		WHERE at.token_hash=$1 AND at.used_at IS NULL AND at.expires_at > now()`,
		auth.HashToken(token)).Scan(&purpose, &email)
	if err != nil {
		respondJSON(w, http.StatusOK, map[string]interface{}{"valid": false})
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"valid": true, "purpose": purpose, "email": email})
}

func (h *AuthHandler) issueToken(r *http.Request, userID int, purpose string, ttl time.Duration) (string, error) {
	raw, err := auth.NewRawToken()
	if err != nil {
		return "", err
	}
	_, err = h.DB.Exec(r.Context(), `
		INSERT INTO auth_tokens (user_id, token_hash, purpose, expires_at) VALUES ($1,$2,$3,now()+$4::interval)`,
		userID, auth.HashToken(raw), purpose, fmt.Sprintf("%d seconds", int(ttl.Seconds())))
	if err != nil {
		return "", err
	}
	return raw, nil
}

func (h *AuthHandler) lookupToken(r *http.Request, raw, purpose string) (userID int, tokenID int, err error) {
	err = h.DB.QueryRow(r.Context(), `
		SELECT user_id, id FROM auth_tokens
		WHERE token_hash=$1 AND purpose=$2 AND used_at IS NULL AND expires_at > now()`,
		auth.HashToken(raw), purpose).Scan(&userID, &tokenID)
	return
}
