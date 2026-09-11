package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// LiveSessionHandler provides minimal session bookkeeping for Panel Siaran - no real
// streaming integration, just start/end timestamps so orders and reports can attribute
// sales to a specific live-selling session per host.
type LiveSessionHandler struct {
	DB *pgxpool.Pool
}

type liveSessionView struct {
	ID        int        `json:"id"`
	HostID    int        `json:"host_id"`
	HostName  string     `json:"host_name"`
	Label     string     `json:"label"`
	StartedAt string     `json:"started_at"`
	EndedAt   *time.Time `json:"ended_at"`
}

// List returns recent sessions, optionally filtered by ?host_id= and ?active=true (still
// running, i.e. ended_at is null).
func (h *LiveSessionHandler) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	where := " WHERE 1=1 "
	args := []interface{}{}
	argN := 1
	if hostID := q.Get("host_id"); hostID != "" {
		where += " AND ls.host_id = $" + strconv.Itoa(argN)
		args = append(args, hostID)
		argN++
	}
	if q.Get("active") == "true" {
		where += " AND ls.ended_at IS NULL"
	}

	rows, err := h.DB.Query(r.Context(), `
		SELECT ls.id, ls.host_id, h.name, ls.label, ls.started_at, ls.ended_at
		FROM live_sessions ls JOIN hosts h ON h.id = ls.host_id`+where+`
		ORDER BY ls.started_at DESC LIMIT 50`, args...)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch live sessions")
		return
	}
	defer rows.Close()

	list := []liveSessionView{}
	for rows.Next() {
		var s liveSessionView
		var startedAt time.Time
		if err := rows.Scan(&s.ID, &s.HostID, &s.HostName, &s.Label, &startedAt, &s.EndedAt); err != nil {
			continue
		}
		s.StartedAt = startedAt.Format(time.RFC3339)
		list = append(list, s)
	}
	respondJSON(w, http.StatusOK, list)
}

type createLiveSessionRequest struct {
	HostID int    `json:"host_id"`
	Label  string `json:"label"`
}

func (h *LiveSessionHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req createLiveSessionRequest
	if err := decodeJSON(r, &req); err != nil || req.HostID == 0 || req.Label == "" {
		respondError(w, http.StatusBadRequest, "host_id and label are required")
		return
	}
	var id int
	if err := h.DB.QueryRow(r.Context(), `
		INSERT INTO live_sessions (host_id, label) VALUES ($1,$2) RETURNING id`,
		req.HostID, req.Label).Scan(&id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to start session")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]int{"id": id})
}

// End marks a session's ended_at as now.
func (h *LiveSessionHandler) End(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid session id")
		return
	}
	ct, err := h.DB.Exec(r.Context(), `UPDATE live_sessions SET ended_at=now() WHERE id=$1 AND ended_at IS NULL`, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to end session")
		return
	}
	if ct.RowsAffected() == 0 {
		respondError(w, http.StatusNotFound, "session not found or already ended")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
