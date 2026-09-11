package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	appmw "ordermgmt/internal/middleware"
)

// PickupLinkHandler manages Manajemen Logistik's "Tautan Pickup": a labeled shareable link
// staff generate (e.g. per host-live session) resolving to a simple public status page.
type PickupLinkHandler struct {
	DB *pgxpool.Pool
}

type pickupLinkView struct {
	ID        int        `json:"id"`
	Token     string     `json:"token"`
	Label     string     `json:"label"`
	Status    string     `json:"status"`
	CreatedAt string     `json:"created_at"`
	ExpiresAt *time.Time `json:"expires_at"`
}

func generateToken() (string, error) {
	b := make([]byte, 12)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// List returns pickup links, optionally filtered by ?status= and searched by ?q= (label).
func (h *PickupLinkHandler) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	query := `SELECT id, token, label, status, created_at, expires_at FROM pickup_links WHERE 1=1`
	args := []interface{}{}
	argN := 1
	if status := q.Get("status"); status != "" {
		query += ` AND status = $` + strconv.Itoa(argN)
		args = append(args, status)
		argN++
	}
	if search := q.Get("q"); search != "" {
		query += ` AND label ILIKE $` + strconv.Itoa(argN)
		args = append(args, "%"+search+"%")
		argN++
	}
	query += ` ORDER BY created_at DESC`

	rows, err := h.DB.Query(r.Context(), query, args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch pickup links")
		return
	}
	defer rows.Close()

	list := []pickupLinkView{}
	for rows.Next() {
		var l pickupLinkView
		var createdAt time.Time
		if err := rows.Scan(&l.ID, &l.Token, &l.Label, &l.Status, &createdAt, &l.ExpiresAt); err != nil {
			continue
		}
		l.CreatedAt = createdAt.Format(time.RFC3339)
		list = append(list, l)
	}
	respondJSON(w, http.StatusOK, list)
}

type createPickupLinkRequest struct {
	Label        string `json:"label"`
	ExpiresInDay int    `json:"expires_in_days"`
}

func (h *PickupLinkHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req createPickupLinkRequest
	if err := decodeJSON(r, &req); err != nil || req.Label == "" {
		respondError(w, http.StatusBadRequest, "label is required")
		return
	}
	token, err := generateToken()
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}
	claims := appmw.GetClaims(r)
	var expiresAt *time.Time
	if req.ExpiresInDay > 0 {
		t := time.Now().AddDate(0, 0, req.ExpiresInDay)
		expiresAt = &t
	}

	var id int
	if err := h.DB.QueryRow(r.Context(), `
		INSERT INTO pickup_links (token, label, created_by, expires_at) VALUES ($1,$2,$3,$4) RETURNING id`,
		token, req.Label, claims.UserID, expiresAt).Scan(&id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create pickup link")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]interface{}{"id": id, "token": token})
}

type updatePickupLinkRequest struct {
	Status string `json:"status"`
}

func (h *PickupLinkHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid pickup link id")
		return
	}
	var req updatePickupLinkRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	allowed := map[string]bool{"perlu_diproses": true, "menunggu_pilih": true, "selesai": true, "batal": true}
	if !allowed[req.Status] {
		respondError(w, http.StatusBadRequest, "invalid status")
		return
	}
	ct, err := h.DB.Exec(r.Context(), `UPDATE pickup_links SET status=$1 WHERE id=$2`, req.Status, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to update pickup link")
		return
	}
	if ct.RowsAffected() == 0 {
		respondError(w, http.StatusNotFound, "pickup link not found")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// PublicGet resolves a pickup link token for the (unauthenticated) recipient of the link.
func (h *PickupLinkHandler) PublicGet(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	var l pickupLinkView
	var createdAt time.Time
	err := h.DB.QueryRow(r.Context(), `
		SELECT label, status, created_at, expires_at FROM pickup_links WHERE token=$1`, token).
		Scan(&l.Label, &l.Status, &createdAt, &l.ExpiresAt)
	if err != nil {
		respondError(w, http.StatusNotFound, "tautan tidak ditemukan")
		return
	}
	if l.ExpiresAt != nil && l.ExpiresAt.Before(time.Now()) {
		l.Status = "kedaluwarsa"
	}
	l.CreatedAt = createdAt.Format(time.RFC3339)
	l.Token = token
	respondJSON(w, http.StatusOK, l)
}
