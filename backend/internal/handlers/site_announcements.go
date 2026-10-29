package handlers

import (
	"context"
	"net/http"
	"strconv"
	"strings"
)

// Homepage announcement bar (WEB ADJ 035): short messages in id / en / zh, shown one after another.

const (
	maxAnnouncements   = 20
	maxAnnouncementLen = 200
)

type announcementDTO struct {
	ID       int    `json:"id,omitempty"`
	TextID   string `json:"text_id"`
	TextEN   string `json:"text_en"`
	TextZH   string `json:"text_zh"`
	IsActive bool   `json:"is_active"`
}

// HomeAnnouncements serves GET /admin/home-announcements: every message in display order.
func (h *SiteAdminHandler) HomeAnnouncements(w http.ResponseWriter, r *http.Request) {
	rows, err := h.DB.Query(r.Context(), `SELECT id, text_id, text_en, text_zh, is_active FROM home_announcements ORDER BY sort_order, id`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load announcements")
		return
	}
	defer rows.Close()
	out := []announcementDTO{}
	for rows.Next() {
		var a announcementDTO
		if rows.Scan(&a.ID, &a.TextID, &a.TextEN, &a.TextZH, &a.IsActive) == nil {
			out = append(out, a)
		}
	}
	respondJSON(w, http.StatusOK, out)
}

// SaveHomeAnnouncements serves PUT /admin/home-announcements: the whole list in its new order.
func (h *SiteAdminHandler) SaveHomeAnnouncements(w http.ResponseWriter, r *http.Request) {
	var req []announcementDTO
	if err := decodeJSON(r, &req); err != nil || len(req) > maxAnnouncements {
		respondError(w, http.StatusBadRequest, "invalid request body (at most "+strconv.Itoa(maxAnnouncements)+" messages)")
		return
	}
	for i := range req {
		a := &req[i]
		a.TextID, a.TextEN, a.TextZH = strings.TrimSpace(a.TextID), strings.TrimSpace(a.TextEN), strings.TrimSpace(a.TextZH)
		if a.TextID == "" && a.TextEN == "" && a.TextZH == "" {
			respondError(w, http.StatusBadRequest, "message "+strconv.Itoa(i+1)+": write the text in at least one language")
			return
		}
		for _, t := range []string{a.TextID, a.TextEN, a.TextZH} {
			if len([]rune(t)) > maxAnnouncementLen {
				respondError(w, http.StatusBadRequest, "message "+strconv.Itoa(i+1)+": the text is too long")
				return
			}
		}
	}
	ctx := r.Context()
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `DELETE FROM home_announcements`); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save")
		return
	}
	for i, a := range req {
		if _, err := tx.Exec(ctx, `INSERT INTO home_announcements (text_id, text_en, text_zh, is_active, sort_order) VALUES ($1,$2,$3,$4,$5)`,
			a.TextID, a.TextEN, a.TextZH, a.IsActive, i+1); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to save")
			return
		}
	}
	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save")
		return
	}
	h.HomeAnnouncements(w, r)
}

// homeAnnouncements: the active messages in the visitor's language (a language without text falls back to the others).
func (h *SiteHandler) homeAnnouncements(ctx context.Context, lang string) []string {
	out := []string{}
	rows, err := h.DB.Query(ctx, `SELECT text_id, text_en, text_zh FROM home_announcements WHERE is_active ORDER BY sort_order, id`)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var id, en, zh string
		if rows.Scan(&id, &en, &zh) != nil {
			continue
		}
		if t := pickLang(map[string]string{"id": id, "en": en, "zh": zh}, lang); t != "" {
			out = append(out, t)
		}
	}
	return out
}
