package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

// UserHandler manages internal staff accounts (Manajemen Pengguna) - real CRUD on top of the
// existing JWT+bcrypt auth system (no new auth provider). super_user only.
type UserHandler struct {
	DB *pgxpool.Pool
}

var staffRoles = map[string]bool{"super_user": true, "management": true, "spv": true, "sales": true}

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

func generateTempPassword() (string, error) {
	b := make([]byte, 6)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// Create directly provisions a new staff account (name/email/role) with a generated temp
// password returned once in the response - there's no outbound-email infra in this app to
// send a real invite, so this is the internal-tool-equivalent of "Undang Staf".
func (h *UserHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req createUserRequest
	if err := decodeJSON(r, &req); err != nil || req.Name == "" || req.Email == "" || !staffRoles[req.Role] {
		respondError(w, http.StatusBadRequest, "name, email dan role (valid) wajib diisi")
		return
	}
	tempPassword, err := generateTempPassword()
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to generate password")
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(tempPassword), bcrypt.DefaultCost)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to hash password")
		return
	}

	var id int
	err = h.DB.QueryRow(r.Context(), `
		INSERT INTO users (name, email, password_hash, role_id, is_active)
		VALUES ($1,$2,$3,(SELECT id FROM roles WHERE name=$4),true) RETURNING id`,
		req.Name, req.Email, string(hash), req.Role).Scan(&id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create user (email mungkin sudah dipakai)")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]interface{}{
		"id": id, "temp_password": tempPassword,
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
	}
	if req.IsActive != nil {
		if _, err := h.DB.Exec(r.Context(), `UPDATE users SET is_active=$1 WHERE id=$2`, *req.IsActive, id); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to update status")
			return
		}
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
