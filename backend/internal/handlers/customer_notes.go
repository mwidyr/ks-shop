package handlers

import (
	"context"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	appmw "ordermgmt/internal/middleware"
)

// Customer notes (#138, 108_notes_size_chart_oversell_limit.sql): internal staff notes on a
// customer profile, added one by one and editable / deletable afterwards - the same log pattern as
// Supplier Profile and Purchase Requisition notes. A profile groups every customer row with the same
// phone number (phoneGroupIDs), so its notes are those of the whole group.

type customerNoteView struct {
	ID            int    `json:"id"`
	Note          string `json:"note"`
	CreatedByName string `json:"created_by_name"`
	CreatedAt     string `json:"created_at"`
	UpdatedAt     string `json:"updated_at"`
}

func (h *CustomerHandler) loadNotes(ctx context.Context, customerIDs []int) []customerNoteView {
	notes := []customerNoteView{}
	rows, err := h.DB.Query(ctx, `
		SELECT n.id, n.note, COALESCE(u.name,'-'), n.created_at::text, n.updated_at::text
		FROM customer_notes n LEFT JOIN users u ON u.id = n.created_by
		WHERE n.customer_id = ANY($1) ORDER BY n.created_at DESC, n.id DESC`, customerIDs)
	if err != nil {
		return notes
	}
	defer rows.Close()
	for rows.Next() {
		var n customerNoteView
		if rows.Scan(&n.ID, &n.Note, &n.CreatedByName, &n.CreatedAt, &n.UpdatedAt) == nil {
			notes = append(notes, n)
		}
	}
	return notes
}

type customerNoteRequest struct {
	Note string `json:"note"`
}

// AddNote handles POST /customers/{id}/notes.
func (h *CustomerHandler) AddNote(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	var req customerNoteRequest
	if err != nil || decodeJSON(r, &req) != nil || strings.TrimSpace(req.Note) == "" {
		respondError(w, http.StatusBadRequest, "note is required")
		return
	}
	claims := appmw.GetClaims(r)
	var noteID int
	if err := h.DB.QueryRow(r.Context(), `
		INSERT INTO customer_notes (customer_id, note, created_by)
		SELECT $1, $2, $3 WHERE EXISTS (SELECT 1 FROM customers WHERE id=$1) RETURNING id`,
		id, strings.TrimSpace(req.Note), claims.UserID).Scan(&noteID); err != nil {
		respondError(w, http.StatusNotFound, "customer not found")
		return
	}
	logActivity(r.Context(), h.DB, "customer", id, "note_added", &claims.UserID, "")
	respondJSON(w, http.StatusCreated, map[string]int{"id": noteID})
}

// UpdateNote handles PATCH /customers/notes/{noteId}.
func (h *CustomerHandler) UpdateNote(w http.ResponseWriter, r *http.Request) {
	noteID, err := strconv.Atoi(chi.URLParam(r, "noteId"))
	var req customerNoteRequest
	if err != nil || decodeJSON(r, &req) != nil || strings.TrimSpace(req.Note) == "" {
		respondError(w, http.StatusBadRequest, "note is required")
		return
	}
	ct, err := h.DB.Exec(r.Context(), `UPDATE customer_notes SET note=$1, updated_at=now() WHERE id=$2`, strings.TrimSpace(req.Note), noteID)
	if err != nil || ct.RowsAffected() == 0 {
		respondError(w, http.StatusNotFound, "note not found")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// DeleteNote handles DELETE /customers/notes/{noteId}.
func (h *CustomerHandler) DeleteNote(w http.ResponseWriter, r *http.Request) {
	noteID, err := strconv.Atoi(chi.URLParam(r, "noteId"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid note id")
		return
	}
	ct, err := h.DB.Exec(r.Context(), `DELETE FROM customer_notes WHERE id=$1`, noteID)
	if err != nil || ct.RowsAffected() == 0 {
		respondError(w, http.StatusNotFound, "note not found")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
