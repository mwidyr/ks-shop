package handlers

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"ordermgmt/internal/auth"
	"ordermgmt/internal/config"
	"ordermgmt/internal/mailer"
	appmw "ordermgmt/internal/middleware"
)

// UserHandler manages internal staff accounts (Manajemen Pengguna) - real CRUD on top of the
// existing JWT+bcrypt auth system (no new auth provider). super_user only.
type UserHandler struct {
	DB  *pgxpool.Pool
	Cfg config.Config
}

var staffRoles = map[string]bool{"super_user": true, "management": true, "spv": true, "sales": true, "cs": true, "warehouse": true}

type userView struct {
	ID       int    `json:"id"`
	Name     string `json:"name"`
	Email    string `json:"email"`
	Role     string `json:"role"`
	IsActive bool   `json:"is_active"`
}

// List returns every internal staff account (customer-role rows, if any remain, are excluded).
func (h *UserHandler) List(w http.ResponseWriter, r *http.Request) {
	rows, err := h.DB.Query(r.Context(), `
		SELECT u.id, u.name, u.email, ro.name, u.is_active
		FROM users u JOIN roles ro ON ro.id = u.role_id
		WHERE ro.name <> 'customer'
		ORDER BY u.name`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch users")
		return
	}
	defer rows.Close()

	list := []userView{}
	for rows.Next() {
		var u userView
		if err := rows.Scan(&u.ID, &u.Name, &u.Email, &u.Role, &u.IsActive); err != nil {
			continue
		}
		list = append(list, u)
	}
	respondJSON(w, http.StatusOK, list)
}

type createUserRequest struct {
	Name  string `json:"name"`
	Email string `json:"email"`
	Role  string `json:"role"`
}

// Create provisions a new staff account (name/email/role) as pending: no password yet,
// is_active=false. An invite token is emailed (or logged to stdout if SMTP isn't configured -
// see internal/mailer) with a link to accept-invite, where the user sets their own password.
func (h *UserHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req createUserRequest
	if err := decodeJSON(r, &req); err != nil || req.Name == "" || req.Email == "" || !staffRoles[req.Role] {
		respondError(w, http.StatusBadRequest, "name, email dan role (valid) wajib diisi")
		return
	}

	var id int
	err := h.DB.QueryRow(r.Context(), `
		INSERT INTO users (name, email, password_hash, role_id, is_active)
		VALUES ($1,$2,NULL,(SELECT id FROM roles WHERE name=$3),false) RETURNING id`,
		req.Name, req.Email, req.Role).Scan(&id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create user (email mungkin sudah dipakai)")
		return
	}

	sendInvite(r.Context(), h.DB, h.Cfg, id, req.Email, req.Role)

	respondJSON(w, http.StatusCreated, map[string]any{
		"id": id, "invited": true,
	})
}

// sendInvite issues a fresh invite token (any previous unused invite tokens for this user are
// dropped first, so only the newest link is ever valid - old ones silently 404 at accept-invite
// instead of leaving multiple simultaneously-valid links floating around) and emails it. Shared
// by Create (first invite) and ResendInvite (item: "kirim email ulang").
func sendInvite(ctx context.Context, db *pgxpool.Pool, cfg config.Config, userID int, email, role string) {
	db.Exec(ctx, `DELETE FROM auth_tokens WHERE user_id=$1 AND purpose='invite'`, userID)

	raw, err := auth.NewRawToken()
	if err == nil {
		_, err = db.Exec(ctx, `
			INSERT INTO auth_tokens (user_id, token_hash, purpose, expires_at)
			VALUES ($1,$2,'invite', now() + interval '7 days')`, userID, auth.HashToken(raw))
	}
	if err == nil {
		link := fmt.Sprintf("%s/accept-invite?token=%s", cfg.AppBaseURL, raw)
		mailer.Send(cfg, email, "You've been invited",
			fmt.Sprintf("You've been invited to join as %s. Set your password here (valid 7 days):\n\n%s", role, link))
	}
}

type updateUserRequest struct {
	Role     *string `json:"role"`
	IsActive *bool   `json:"is_active"`
	Email    *string `json:"email"`
}

func (h *UserHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid user id")
		return
	}
	var req updateUserRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	claims := appmw.GetClaims(r)
	var actorID *int
	if claims != nil {
		actorID = &claims.UserID
	}
	if req.Role != nil {
		if !staffRoles[*req.Role] {
			respondError(w, http.StatusBadRequest, "invalid role")
			return
		}
		if _, err := h.DB.Exec(r.Context(), `
			UPDATE users SET role_id = (SELECT id FROM roles WHERE name=$1) WHERE id=$2`, *req.Role, id); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to update role")
			return
		}
		logActivity(r.Context(), h.DB, "user", id, "role_changed", actorID, fmt.Sprintf("role -> %s", *req.Role))
	}
	if req.IsActive != nil {
		if _, err := h.DB.Exec(r.Context(), `UPDATE users SET is_active=$1 WHERE id=$2`, *req.IsActive, id); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to update status")
			return
		}
		logActivity(r.Context(), h.DB, "user", id, "active_changed", actorID, fmt.Sprintf("is_active -> %v", *req.IsActive))
	}
	if req.Email != nil {
		email := strings.TrimSpace(*req.Email)
		if email == "" {
			respondError(w, http.StatusBadRequest, "email is required")
			return
		}
		if _, err := h.DB.Exec(r.Context(), `UPDATE users SET email=$1 WHERE id=$2`, email, id); err != nil {
			if isUniqueViolation(err) {
				respondError(w, http.StatusConflict, "email sudah dipakai oleh akun lain")
				return
			}
			respondError(w, http.StatusInternalServerError, "failed to update email")
			return
		}
		logActivity(r.Context(), h.DB, "user", id, "email_changed", actorID, fmt.Sprintf("email -> %s", email))
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

type setPasswordRequest struct {
	Password string `json:"password"`
}

// SetPassword lets an admin directly set a user's password, bypassing the email-link flow
// entirely - both a workaround for when invite/reset emails don't arrive, and a direct "change
// this person's password" tool. Also clears is_active=true, so it doubles as a way to unlock a
// still-pending invite (never accepted) without needing that invite email to ever arrive.
// isAdmin(r) is checked here specifically (not just the route's edit("roles") tab gate) since
// setting someone else's password is more sensitive than the other actions on this handler -
// same "real authorization boundary, not just a UI-level restriction" pattern used for
// DeleteVariant/product force-delete elsewhere in this codebase.
func (h *UserHandler) SetPassword(w http.ResponseWriter, r *http.Request) {
	if !isAdmin(r) {
		respondError(w, http.StatusForbidden, "only an admin can set another user's password")
		return
	}
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid user id")
		return
	}
	var req setPasswordRequest
	if err := decodeJSON(r, &req); err != nil || len(req.Password) < 6 {
		respondError(w, http.StatusBadRequest, "password must be at least 6 characters")
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to hash password")
		return
	}
	ct, err := h.DB.Exec(r.Context(), `UPDATE users SET password_hash=$1, is_active=true WHERE id=$2`, string(hash), id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to set password")
		return
	}
	if ct.RowsAffected() == 0 {
		respondError(w, http.StatusNotFound, "user not found")
		return
	}
	claims := appmw.GetClaims(r)
	var actorID *int
	if claims != nil {
		actorID = &claims.UserID
	}
	logActivity(r.Context(), h.DB, "user", id, "password_set_by_admin", actorID, "password diatur ulang oleh admin")
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ResendInvite re-sends the invite email for a still-pending account (is_active=false, no
// password set yet) - e.g. the first email never arrived because SMTP wasn't configured yet, or
// just got lost. Not meant for an already-active account; they use Forgot Password instead.
func (h *UserHandler) ResendInvite(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid user id")
		return
	}
	var email, roleName string
	var isActive bool
	if err := h.DB.QueryRow(r.Context(), `
		SELECT u.email, ro.name, u.is_active FROM users u JOIN roles ro ON ro.id = u.role_id WHERE u.id=$1`, id).
		Scan(&email, &roleName, &isActive); err != nil {
		respondError(w, http.StatusNotFound, "user not found")
		return
	}
	if isActive {
		respondError(w, http.StatusBadRequest, "this account is already active - use Forgot Password instead")
		return
	}
	sendInvite(r.Context(), h.DB, h.Cfg, id, email, roleName)
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// Delete permanently removes a staff account. Blocked for the caller's own account (can't delete
// yourself) and for the last active super_user (would lock everyone out of admin access). A
// user with real history (orders, activity log, etc.) can't be hard-deleted either - every FK
// from those tables to users.id is a plain REFERENCES with no cascade, so Postgres itself refuses
// with a foreign_key_violation; that's surfaced as a friendly message pointing at Deactivate
// instead, rather than a raw 500.
func (h *UserHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid user id")
		return
	}
	claims := appmw.GetClaims(r)
	if claims != nil && claims.UserID == id {
		respondError(w, http.StatusBadRequest, "you can't delete your own account")
		return
	}

	var roleName string
	if err := h.DB.QueryRow(r.Context(), `
		SELECT ro.name FROM users u JOIN roles ro ON ro.id = u.role_id WHERE u.id=$1`, id).Scan(&roleName); err != nil {
		respondError(w, http.StatusNotFound, "user not found")
		return
	}
	if roleName == "super_user" {
		var activeAdmins int
		h.DB.QueryRow(r.Context(), `
			SELECT COUNT(*) FROM users u JOIN roles ro ON ro.id = u.role_id
			WHERE ro.name = 'super_user' AND u.is_active = true`).Scan(&activeAdmins)
		if activeAdmins <= 1 {
			respondError(w, http.StatusBadRequest, "can't delete the last active super_user")
			return
		}
	}

	ct, err := h.DB.Exec(r.Context(), `DELETE FROM users WHERE id=$1`, id)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23503" {
			respondError(w, http.StatusBadRequest, "this user has order/activity history and can't be permanently deleted - use Deactivate instead")
			return
		}
		respondError(w, http.StatusInternalServerError, "failed to delete user")
		return
	}
	if ct.RowsAffected() == 0 {
		respondError(w, http.StatusNotFound, "user not found")
		return
	}

	claimsID := (*int)(nil)
	if claims != nil {
		claimsID = &claims.UserID
	}
	logActivity(r.Context(), h.DB, "user", id, "deleted", claimsID, "")
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
