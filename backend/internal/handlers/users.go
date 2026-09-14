package handlers

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

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

	raw, err := auth.NewRawToken()
	if err == nil {
		_, err = h.DB.Exec(r.Context(), `
			INSERT INTO auth_tokens (user_id, token_hash, purpose, expires_at)
			VALUES ($1,$2,'invite', now() + interval '7 days')`, id, auth.HashToken(raw))
	}
	if err == nil {
		link := fmt.Sprintf("%s/accept-invite?token=%s", h.Cfg.AppBaseURL, raw)
		mailer.Send(h.Cfg, req.Email, "You've been invited",
			fmt.Sprintf("You've been invited to join as %s. Set your password here (valid 7 days):\n\n%s", req.Role, link))
	}

	respondJSON(w, http.StatusCreated, map[string]any{
		"id": id, "invited": true,
	})
}

type updateUserRequest struct {
	Role     *string `json:"role"`
	IsActive *bool   `json:"is_active"`
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
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
