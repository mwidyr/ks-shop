package handlers

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	appmw "ordermgmt/internal/middleware"
)

// LiveSessionScreenshotHandler (item 003) replaces the old trivial "Broadcast Console" card with
// storage for host-uploaded TikTok LIVE screenshots. Upload itself reuses the existing
// /uploads/image endpoint (uploads.go) exactly like product photos do - this handler only
// persists the resulting URL against a session. recognized_data/status are unused placeholders
// this round (no AI vision call wired yet, per the confirmed scope for this build).
type LiveSessionScreenshotHandler struct {
	DB *pgxpool.Pool
}

type liveSessionScreenshotView struct {
	ID        int    `json:"id"`
	ImageURL  string `json:"image_url"`
	Status    string `json:"status"`
	CreatedAt string `json:"created_at"`
}

func (h *LiveSessionScreenshotHandler) List(w http.ResponseWriter, r *http.Request) {
	sessionID, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid session id")
		return
	}
	rows, err := h.DB.Query(r.Context(), `
		SELECT id, image_url, status, created_at::text
		FROM live_session_screenshots WHERE session_id=$1 ORDER BY created_at DESC`, sessionID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch screenshots")
		return
	}
	defer rows.Close()

	list := []liveSessionScreenshotView{}
	for rows.Next() {
		var s liveSessionScreenshotView
		if err := rows.Scan(&s.ID, &s.ImageURL, &s.Status, &s.CreatedAt); err != nil {
			continue
		}
		list = append(list, s)
	}
	respondJSON(w, http.StatusOK, list)
}

type createScreenshotRequest struct {
	ImageURL string `json:"image_url"`
}

func (h *LiveSessionScreenshotHandler) Create(w http.ResponseWriter, r *http.Request) {
	sessionID, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid session id")
		return
	}
	var req createScreenshotRequest
	if err := decodeJSON(r, &req); err != nil || req.ImageURL == "" {
		respondError(w, http.StatusBadRequest, "image_url is required")
		return
	}
	claims := appmw.GetClaims(r)

	var id int
	if err := h.DB.QueryRow(r.Context(), `
		INSERT INTO live_session_screenshots (session_id, image_url, uploaded_by)
		VALUES ($1,$2,$3) RETURNING id`, sessionID, req.ImageURL, claims.UserID).Scan(&id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save screenshot")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]int{"id": id})
}
