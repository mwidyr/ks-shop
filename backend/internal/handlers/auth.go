package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"ordermgmt/internal/auth"
)

type AuthHandler struct {
	DB        *pgxpool.Pool
	JWTSecret string
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
