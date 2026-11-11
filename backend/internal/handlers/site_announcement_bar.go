package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	appmw "ordermgmt/internal/middleware"
)

// Homepage announcement bar, typewriter version (Ralulu Marquee Spec v4). Marketing edits a draft; publishing
// (super_user) makes it live and is logged, rollback returns to the previous published version.

const (
	maxBarMessages = 6
	maxBarTextLen  = 200 // hard limit; the 28-character guideline is a warning in the admin, not a block
)

type barTiming struct {
	TypeMs  int `json:"typeMs"`
	HoldMs  int `json:"holdMs"`
	EraseMs int `json:"eraseMs"`
	PauseMs int `json:"pauseMs"`
}

type barStyle struct {
	Background string `json:"background"`
	Text       string `json:"text"`
	Accent     string `json:"accent"`
	ShowPrompt bool   `json:"showPrompt"`
	FontSize   int    `json:"fontSize"`
	Radius     int    `json:"radius"`
}

type barMessage struct {
	ID      string            `json:"id"`
	Emoji   string            `json:"emoji"`
	Text    map[string]string `json:"text"`
	URL     string            `json:"url"`
	Enabled bool              `json:"enabled"`
	From    *string           `json:"from"`
	Until   *string           `json:"until"`
}

type barConfig struct {
	Enabled  bool         `json:"enabled"`
	Preset   string       `json:"preset"`
	Timing   barTiming    `json:"timing"`
	Style    barStyle     `json:"style"`
	Messages []barMessage `json:"messages"`
}

func defaultBarConfig() barConfig {
	return barConfig{
		Enabled: true, Preset: "typewriter",
		Timing:   barTiming{TypeMs: 90, HoldMs: 2400, EraseMs: 45, PauseMs: 400},
		Style:    barStyle{Background: "#A0344F", Text: "#FFF5F7", Accent: "#F9C9D5", ShowPrompt: true, FontSize: 16, Radius: 10},
		Messages: []barMessage{},
	}
}

var hexColor = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)
var dateOnly = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

func hexLuminance(h string) float64 {
	ch := func(s string) float64 {
		v, _ := strconv.ParseUint(s, 16, 8)
		c := float64(v) / 255
		if c <= 0.03928 {
			return c / 12.92
		}
		return math.Pow((c+0.055)/1.055, 2.4)
	}
	return 0.2126*ch(h[1:3]) + 0.7152*ch(h[3:5]) + 0.0722*ch(h[5:7])
}

// contrastRatio is the WCAG contrast ratio between two #RRGGBB colours (1..21).
func contrastRatio(a, b string) float64 {
	la, lb := hexLuminance(a), hexLuminance(b)
	if la < lb {
		la, lb = lb, la
	}
	return (la + 0.05) / (lb + 0.05)
}

func inRange(v, lo, hi int) bool { return v >= lo && v <= hi }

// validateBarConfig returns the first problem of a config, or "" when it is fine. forPublish adds the rules
// that only matter for the live bar (an enabled bar needs a message; text must pass WCAG AA).
func validateBarConfig(c *barConfig, forPublish bool) string {
	if c.Preset != "typewriter" {
		return "preset: only typewriter is available"
	}
	t := c.Timing
	if !inRange(t.TypeMs, 40, 200) || !inRange(t.HoldMs, 1200, 6000) || !inRange(t.EraseMs, 20, 120) || !inRange(t.PauseMs, 0, 1000) {
		return "timing is out of range (type 40-200, hold 1200-6000, erase 20-120, pause 0-1000 ms)"
	}
	s := c.Style
	for _, col := range []string{s.Background, s.Text, s.Accent} {
		if !hexColor.MatchString(col) {
			return "colors must look like #RRGGBB"
		}
	}
	if !inRange(s.FontSize, 14, 18) || !inRange(s.Radius, 0, 16) {
		return "font size must be 14-18 and corner radius 0-16"
	}
	if len(c.Messages) > maxBarMessages {
		return "at most " + strconv.Itoa(maxBarMessages) + " messages"
	}
	for i := range c.Messages {
		m := &c.Messages[i]
		n := strconv.Itoa(i + 1)
		clean := map[string]string{}
		for _, l := range []string{"id", "en", "zh"} {
			v := strings.TrimSpace(m.Text[l])
			if len([]rune(v)) > maxBarTextLen {
				return "message " + n + ": the text is too long"
			}
			clean[l] = v
		}
		m.Text = clean
		if clean["id"] == "" && clean["en"] == "" && clean["zh"] == "" {
			return "message " + n + ": write the text in at least one language"
		}
		if m.ID == "" {
			m.ID = "m" + n
		}
		m.Emoji = strings.TrimSpace(m.Emoji)
		if len([]rune(m.Emoji)) > 8 {
			return "message " + n + ": emoji is too long"
		}
		m.URL = strings.TrimSpace(m.URL)
		if m.URL != "" {
			u, err := url.Parse(m.URL)
			okPath := strings.HasPrefix(m.URL, "/") && !strings.HasPrefix(m.URL, "//")
			if err != nil || (!okPath && u.Scheme != "http" && u.Scheme != "https") {
				return "message " + n + ": the link must start with http(s):// or /"
			}
		}
		for _, d := range []*string{m.From, m.Until} {
			if d != nil && *d != "" && !dateOnly.MatchString(*d) {
				return "message " + n + ": dates must look like YYYY-MM-DD"
			}
		}
		if m.From != nil && *m.From == "" {
			m.From = nil
		}
		if m.Until != nil && *m.Until == "" {
			m.Until = nil
		}
		if m.From != nil && m.Until != nil && *m.Until < *m.From {
			return "message " + n + ": the end date is before the start date"
		}
	}
	if forPublish {
		if c.Enabled && len(c.Messages) == 0 {
			return "Add at least one message."
		}
		if contrastRatio(s.Text, s.Background) < 4.5 {
			return "text and background do not reach WCAG AA contrast (4.5:1)"
		}
	}
	return ""
}

// summarizeBarChange is the "before and after" line of the publish log.
func summarizeBarChange(before *barConfig, after barConfig) string {
	if before == nil {
		return fmt.Sprintf("first version: %d messages, enabled=%t", len(after.Messages), after.Enabled)
	}
	var parts []string
	if before.Enabled != after.Enabled {
		parts = append(parts, fmt.Sprintf("enabled %t→%t", before.Enabled, after.Enabled))
	}
	if len(before.Messages) != len(after.Messages) {
		parts = append(parts, fmt.Sprintf("messages %d→%d", len(before.Messages), len(after.Messages)))
	} else if a, b := mustJSON(before.Messages), mustJSON(after.Messages); a != b {
		parts = append(parts, "messages edited")
	}
	if before.Timing != after.Timing {
		parts = append(parts, "timing changed")
	}
	if before.Style != after.Style {
		parts = append(parts, "appearance changed")
	}
	if len(parts) == 0 {
		return "no changes"
	}
	return strings.Join(parts, ", ")
}

func mustJSON(v interface{}) string { b, _ := json.Marshal(v); return string(b) }

func parseBarConfig(raw []byte) *barConfig {
	c := defaultBarConfig()
	if json.Unmarshal(raw, &c) != nil {
		return nil
	}
	if c.Messages == nil {
		c.Messages = []barMessage{}
	}
	return &c
}

// latestPublishedBar returns the live config (nil when none was ever published).
func latestPublishedBar(ctx context.Context, q interface {
	QueryRow(context.Context, string, ...interface{}) pgx.Row
}) (*barConfig, int) {
	var raw []byte
	var id int
	if q.QueryRow(ctx, `SELECT id, config FROM announcement_bar_versions WHERE status='published' ORDER BY id DESC LIMIT 1`).Scan(&id, &raw) != nil {
		return nil, 0
	}
	return parseBarConfig(raw), id
}

type barLogDTO struct {
	Action    string    `json:"action"`
	Editor    string    `json:"editor"`
	Summary   string    `json:"summary"`
	CreatedAt time.Time `json:"created_at"`
}

func (h *SiteAdminHandler) barState(ctx context.Context) map[string]interface{} {
	published, _ := latestPublishedBar(ctx, h.DB)
	draft := published
	hasDraft := false
	var raw []byte
	if h.DB.QueryRow(ctx, `SELECT config FROM announcement_bar_versions WHERE status='draft' ORDER BY id DESC LIMIT 1`).Scan(&raw) == nil {
		if c := parseBarConfig(raw); c != nil {
			draft, hasDraft = c, true
		}
	}
	if draft == nil {
		d := defaultBarConfig()
		draft = &d
	}
	var published2 int
	_ = h.DB.QueryRow(ctx, `SELECT COUNT(*) FROM announcement_bar_versions WHERE status='published'`).Scan(&published2)
	logs := []barLogDTO{}
	if rows, err := h.DB.Query(ctx, `SELECT action, editor_name, summary, created_at FROM announcement_bar_log ORDER BY id DESC LIMIT 30`); err == nil {
		defer rows.Close()
		for rows.Next() {
			var l barLogDTO
			if rows.Scan(&l.Action, &l.Editor, &l.Summary, &l.CreatedAt) == nil {
				logs = append(logs, l)
			}
		}
	}
	return map[string]interface{}{"draft": draft, "published": published, "has_draft": hasDraft, "can_rollback": published2 > 1, "log": logs}
}

// AnnouncementBar serves GET /admin/announcement-bar.
func (h *SiteAdminHandler) AnnouncementBar(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, h.barState(r.Context()))
}

// SaveAnnouncementBarDraft serves PUT /admin/announcement-bar/draft: saves the draft; the live site is untouched.
func (h *SiteAdminHandler) SaveAnnouncementBarDraft(w http.ResponseWriter, r *http.Request) {
	var c barConfig
	if err := decodeJSON(r, &c); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if msg := validateBarConfig(&c, false); msg != "" {
		respondError(w, http.StatusBadRequest, msg)
		return
	}
	ctx := r.Context()
	claims := appmw.GetClaims(r)
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `DELETE FROM announcement_bar_versions WHERE status='draft'`); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save")
		return
	}
	if _, err := tx.Exec(ctx, `INSERT INTO announcement_bar_versions (status, config, created_by) VALUES ('draft', $1, $2)`, mustJSON(c), claims.UserID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save")
		return
	}
	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save")
		return
	}
	h.AnnouncementBar(w, r)
}

// PublishAnnouncementBar serves POST /admin/announcement-bar/publish: the posted config becomes the live bar.
func (h *SiteAdminHandler) PublishAnnouncementBar(w http.ResponseWriter, r *http.Request) {
	var c barConfig
	if err := decodeJSON(r, &c); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if msg := validateBarConfig(&c, true); msg != "" {
		respondError(w, http.StatusBadRequest, msg)
		return
	}
	ctx := r.Context()
	claims := appmw.GetClaims(r)
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(ctx)
	before, _ := latestPublishedBar(ctx, tx)
	var vid int
	if err := tx.QueryRow(ctx, `INSERT INTO announcement_bar_versions (status, config, created_by, published_at) VALUES ('published', $1, $2, now()) RETURNING id`, mustJSON(c), claims.UserID).Scan(&vid); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to publish")
		return
	}
	if _, err := tx.Exec(ctx, `DELETE FROM announcement_bar_versions WHERE status='draft'`); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to publish")
		return
	}
	if _, err := tx.Exec(ctx, `INSERT INTO announcement_bar_log (action, editor_id, editor_name, summary, version_id) VALUES ('publish', $1, $2, $3, $4)`,
		claims.UserID, claims.Name, summarizeBarChange(before, c), vid); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to publish")
		return
	}
	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to publish")
		return
	}
	h.AnnouncementBar(w, r)
}

// RollbackAnnouncementBar serves POST /admin/announcement-bar/rollback: the previous published version is live again.
func (h *SiteAdminHandler) RollbackAnnouncementBar(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := appmw.GetClaims(r)
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(ctx)
	rows, err := tx.Query(ctx, `SELECT id, config FROM announcement_bar_versions WHERE status='published' ORDER BY id DESC LIMIT 2`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	var ids []int
	var cfgs []*barConfig
	for rows.Next() {
		var id int
		var raw []byte
		if rows.Scan(&id, &raw) == nil {
			ids = append(ids, id)
			cfgs = append(cfgs, parseBarConfig(raw))
		}
	}
	rows.Close()
	if len(ids) < 2 || cfgs[0] == nil || cfgs[1] == nil {
		respondError(w, http.StatusConflict, "there is no earlier published version to return to")
		return
	}
	if _, err := tx.Exec(ctx, `UPDATE announcement_bar_versions SET status='rolled_back' WHERE id=$1`, ids[0]); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to roll back")
		return
	}
	if _, err := tx.Exec(ctx, `INSERT INTO announcement_bar_log (action, editor_id, editor_name, summary, version_id) VALUES ('rollback', $1, $2, $3, $4)`,
		claims.UserID, claims.Name, summarizeBarChange(cfgs[0], *cfgs[1]), ids[1]); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to roll back")
		return
	}
	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to roll back")
		return
	}
	h.AnnouncementBar(w, r)
}

type publicBarMessage struct {
	Text string `json:"text"`
	URL  string `json:"url,omitempty"`
}

type publicBar struct {
	Preset   string             `json:"preset"`
	Timing   barTiming          `json:"timing"`
	Style    barStyle           `json:"style"`
	Messages []publicBarMessage `json:"messages"`
}

// activeBarMessages keeps the enabled messages whose date window (Taipei calendar day) contains today.
func activeBarMessages(c *barConfig, lang string, now time.Time) []publicBarMessage {
	today := now.In(taipeiLoc()).Format("2006-01-02")
	out := []publicBarMessage{}
	for _, m := range c.Messages {
		if !m.Enabled || (m.From != nil && today < *m.From) || (m.Until != nil && today > *m.Until) {
			continue
		}
		text := pickLang(m.Text, lang)
		if text == "" {
			continue
		}
		if m.Emoji != "" {
			text = m.Emoji + " " + text
		}
		out = append(out, publicBarMessage{Text: text, URL: m.URL})
	}
	return out
}

func taipeiLoc() *time.Location {
	if l, err := time.LoadLocation("Asia/Taipei"); err == nil {
		return l
	}
	return time.FixedZone("Asia/Taipei", 8*3600)
}

// announcementBar: the live bar for the visitor, or nil when it is off or has no active message (the bar is then not drawn).
func (h *SiteHandler) announcementBar(ctx context.Context, lang string) *publicBar {
	c, _ := latestPublishedBar(ctx, h.DB)
	if c == nil || !c.Enabled {
		return nil
	}
	msgs := activeBarMessages(c, lang, time.Now())
	if len(msgs) == 0 {
		return nil
	}
	return &publicBar{Preset: c.Preset, Timing: c.Timing, Style: c.Style, Messages: msgs}
}
