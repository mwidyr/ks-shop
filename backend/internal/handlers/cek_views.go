package handlers

import (
	"context"
	"errors"
	"io"
	"log"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	appmw "ordermgmt/internal/middleware"
	"ordermgmt/internal/telegram"
)

// CekViewsHandler is CEK VIEWS: OPS enter each Host's TikTok LIVE views by hand and the report goes straight to the
// Telegram group; plus its settings (which TikTok account each Host reports for, and the voice reminder).
type CekViewsHandler struct {
	DB    *pgxpool.Pool
	Store *telegram.Store
	Voice *telegram.VoiceReminder
}

var reportZone = time.FixedZone("WIB", 7*60*60) // Asia/Jakarta, no daylight saving

const shiftOrderSQL = `CASE h.shift WHEN 'morning' THEN 0 WHEN 'middle' THEN 1 WHEN 'evening' THEN 2 ELSE 3 END`

// ---- Live Assignment (settings) -------------------------------------------------------------

type cekAssignmentRow struct {
	HostID    int     `json:"host_id"`
	HostName  string  `json:"host_name"`
	Shift     *string `json:"shift"`
	AccountID *int    `json:"tiktok_account_id"`
	IsOff     bool    `json:"is_off"`
}

type cekAccountOption struct {
	ID         int     `json:"id"`
	TikTokID   string  `json:"tiktok_id"`
	Status     string  `json:"status"`
	RoomName   *string `json:"room_name"`
	DeviceName *string `json:"device_name"`
}

// Assignments lists the active Hosts of one Location (Host + Shift come from Host Management) with their assigned
// TikTok account and OFF flag, and every TikTok account as an option (Room, Device and Status are derived from it).
func (h *CekViewsHandler) Assignments(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	locID, err := strconv.Atoi(r.URL.Query().Get("location_id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "location_id is required")
		return
	}
	rows, err := h.DB.Query(ctx, `
		SELECT h.id, h.name, h.shift, a.tiktok_account_id, COALESCE(a.is_off, false)
		FROM hosts h LEFT JOIN cek_views_assignments a ON a.host_id = h.id
		WHERE h.is_active = true AND h.location_id = $1
		ORDER BY `+shiftOrderSQL+`, h.name`, locID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load hosts")
		return
	}
	hosts := []cekAssignmentRow{}
	for rows.Next() {
		var a cekAssignmentRow
		if rows.Scan(&a.HostID, &a.HostName, &a.Shift, &a.AccountID, &a.IsOff) == nil {
			hosts = append(hosts, a)
		}
	}
	rows.Close()
	accounts := []cekAccountOption{}
	ar, err := h.DB.Query(ctx, `
		SELECT a.id, a.tiktok_id, a.status, rm.name, d.name
		FROM tiktok_accounts a
		LEFT JOIN tiktok_rooms rm ON rm.id = a.room_id
		LEFT JOIN tiktok_devices d ON d.id = a.device_id
		ORDER BY lower(a.tiktok_id)`)
	if err == nil {
		defer ar.Close()
		for ar.Next() {
			var o cekAccountOption
			if ar.Scan(&o.ID, &o.TikTokID, &o.Status, &o.RoomName, &o.DeviceName) == nil {
				accounts = append(accounts, o)
			}
		}
	}
	respondJSON(w, http.StatusOK, map[string]any{"hosts": hosts, "accounts": accounts})
}

// SaveAssignments stores the account and OFF flag of every listed Host in one transaction.
func (h *CekViewsHandler) SaveAssignments(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Items []struct {
			HostID    int  `json:"host_id"`
			AccountID *int `json:"tiktok_account_id"`
			IsOff     bool `json:"is_off"`
		} `json:"items"`
	}
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	ctx := r.Context()
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(ctx)
	for _, it := range req.Items {
		if _, err := tx.Exec(ctx, `
			INSERT INTO cek_views_assignments (host_id, tiktok_account_id, is_off) VALUES ($1,$2,$3)
			ON CONFLICT (host_id) DO UPDATE SET tiktok_account_id = EXCLUDED.tiktok_account_id, is_off = EXCLUDED.is_off, updated_at = now()`,
			it.HostID, it.AccountID, it.IsOff); err != nil {
			respondError(w, http.StatusBadRequest, "failed to save (unknown host or TikTok account?)")
			return
		}
	}
	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "db commit failed")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ---- Portal -----------------------------------------------------------------------------------

type cekShiftCounts struct {
	Morning int `json:"morning"`
	Middle  int `json:"middle"`
	Evening int `json:"evening"`
}

type cekPortalLocation struct {
	ID     int            `json:"id"`
	Name   string         `json:"name"`
	Shifts cekShiftCounts `json:"shifts"`
}

// assignable = an active Host with a TikTok account that is not switched OFF
const assignableSQL = `h.is_active = true AND a.tiktok_account_id IS NOT NULL AND a.is_off = false`

// PortalOverview feeds the first two portal screens: every Location with how many Hosts report per Shift.
func (h *CekViewsHandler) PortalOverview(w http.ResponseWriter, r *http.Request) {
	rows, err := h.DB.Query(r.Context(), `
		SELECT l.id, l.name,
		       count(*) FILTER (WHERE h.shift = 'morning'), count(*) FILTER (WHERE h.shift = 'middle'), count(*) FILTER (WHERE h.shift = 'evening')
		FROM host_locations l
		LEFT JOIN hosts h ON h.location_id = l.id
		LEFT JOIN cek_views_assignments a ON a.host_id = h.id AND `+assignableSQL+`
		WHERE l.is_active = true
		GROUP BY l.id, l.name, l.sort_order ORDER BY l.sort_order, l.name`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load locations")
		return
	}
	defer rows.Close()
	out := []cekPortalLocation{}
	for rows.Next() {
		var l cekPortalLocation
		if rows.Scan(&l.ID, &l.Name, &l.Shifts.Morning, &l.Shifts.Middle, &l.Shifts.Evening) == nil {
			out = append(out, l)
		}
	}
	respondJSON(w, http.StatusOK, out)
}

type cekPortalHost struct {
	HostID   int    `json:"host_id"`
	HostName string `json:"host_name"`
	TikTokID string `json:"tiktok_id"`
	Room     string `json:"room"`
	Device   string `json:"device"`
}

func (h *CekViewsHandler) portalHosts(ctx context.Context, q pgx.Tx, locID int, shift string, hostIDs []int) ([]cekPortalHost, error) {
	sql := `
		SELECT h.id, h.name, t.tiktok_id, COALESCE(rm.name,''), COALESCE(d.name,'')
		FROM hosts h
		JOIN cek_views_assignments a ON a.host_id = h.id AND ` + assignableSQL + `
		JOIN tiktok_accounts t ON t.id = a.tiktok_account_id
		LEFT JOIN tiktok_rooms rm ON rm.id = t.room_id
		LEFT JOIN tiktok_devices d ON d.id = t.device_id
		WHERE h.location_id = $1 AND h.shift = $2`
	args := []any{locID, shift}
	if hostIDs != nil {
		sql += ` AND h.id = ANY($3)`
		args = append(args, hostIDs)
	}
	sql += ` ORDER BY h.name`
	var rows pgx.Rows
	var err error
	if q != nil {
		rows, err = q.Query(ctx, sql, args...)
	} else {
		rows, err = h.DB.Query(ctx, sql, args...)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []cekPortalHost{}
	for rows.Next() {
		var p cekPortalHost
		if rows.Scan(&p.HostID, &p.HostName, &p.TikTokID, &p.Room, &p.Device) == nil {
			out = append(out, p)
		}
	}
	return out, nil
}

// PortalHosts lists the Hosts OPS enter views for in one Location + Shift (Room, Device, TikTok ID come from Live Assignment).
func (h *CekViewsHandler) PortalHosts(w http.ResponseWriter, r *http.Request) {
	locID, err := strconv.Atoi(r.URL.Query().Get("location_id"))
	shift := r.URL.Query().Get("shift")
	if err != nil || !validShifts[shift] {
		respondError(w, http.StatusBadRequest, "location_id and shift are required")
		return
	}
	hosts, err := h.portalHosts(r.Context(), nil, locID, shift, nil)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load hosts")
		return
	}
	respondJSON(w, http.StatusOK, hosts)
}

type cekSubmitRequest struct {
	LocationID int    `json:"location_id"`
	Shift      string `json:"shift"`
	Entries    []struct {
		HostID int `json:"host_id"`
		Views  int `json:"views"`
	} `json:"entries"`
}

// Submit saves one report (a log row per host, with the TikTok account / room / device as they were) and sends it to Telegram.
// The Telegram result never undoes the save: the response says whether it went out.
func (h *CekViewsHandler) Submit(w http.ResponseWriter, r *http.Request) {
	var req cekSubmitRequest
	if err := decodeJSON(r, &req); err != nil || req.LocationID == 0 || !validShifts[req.Shift] || len(req.Entries) == 0 {
		respondError(w, http.StatusBadRequest, "location, shift and at least one host's views are required")
		return
	}
	viewsByHost := map[int]int{}
	ids := []int{}
	for _, e := range req.Entries {
		if e.Views < 0 {
			respondError(w, http.StatusBadRequest, "views cannot be negative")
			return
		}
		if _, dup := viewsByHost[e.HostID]; !dup {
			ids = append(ids, e.HostID)
		}
		viewsByHost[e.HostID] = e.Views
	}
	ctx := r.Context()
	claims := appmw.GetClaims(r)
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(ctx)

	hosts, err := h.portalHosts(ctx, tx, req.LocationID, req.Shift, ids)
	if err != nil || len(hosts) == 0 {
		respondError(w, http.StatusBadRequest, "none of these hosts reports views in this location / shift")
		return
	}
	var locName string
	_ = tx.QueryRow(ctx, `SELECT name FROM host_locations WHERE id=$1`, req.LocationID).Scan(&locName)

	at := time.Now()
	entries := make([]viewsEntry, 0, len(hosts))
	for _, p := range hosts {
		views := viewsByHost[p.HostID]
		var prev *int
		var last int
		err := tx.QueryRow(ctx, `SELECT views FROM cek_views_log WHERE host_id=$1 ORDER BY submitted_at DESC, id DESC LIMIT 1`, p.HostID).Scan(&last)
		if err == nil {
			prev = &last
		} else if !errors.Is(err, pgx.ErrNoRows) {
			respondError(w, http.StatusInternalServerError, "failed to read the previous views")
			return
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO cek_views_log (host_id, host_name, location_id, location_name, shift, tiktok_id, room, device, views, submitted_by, submitted_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
			p.HostID, p.HostName, req.LocationID, locName, req.Shift, p.TikTokID, p.Room, p.Device, views, claims.UserID, at); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to save views")
			return
		}
		entries = append(entries, viewsEntry{Host: p.HostName, Room: p.Room, Device: p.Device, TikTokID: p.TikTokID, Views: views, Increase: viewsIncrease(views, prev)})
	}
	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "db commit failed")
		return
	}

	sent, sendErr := h.sendReport(ctx, buildViewsMessage(entries, at, locName, reportZone))
	res := map[string]any{"saved": len(entries), "telegram_sent": sent}
	if sendErr != "" {
		res["telegram_error"] = sendErr
		log.Printf("cek views telegram: %s", sendErr)
	}
	respondJSON(w, http.StatusOK, res)
}

// sendReport posts the report to the CEK VIEWS group / topic; the second value is a short reason when it was not sent.
func (h *CekViewsHandler) sendReport(ctx context.Context, html string) (bool, string) {
	token, _ := h.Store.CekViewsToken(ctx)
	cfg := h.Store.LoadCekViewsConfig(ctx)
	switch {
	case token == "":
		return false, "the CEK VIEWS bot token is not set (CEK VIEWS Settings > Telegram Bot)"
	case cfg.ChatID == "":
		return false, "the CEK VIEWS chat id is not set (CEK VIEWS Settings > Telegram Bot)"
	case !cfg.SendEnabled:
		return false, "sending is switched off (CEK VIEWS Settings > Telegram Bot)"
	}
	if err := telegram.SendHTML(ctx, token, cfg.ChatID, cfg.ThreadID, html); err != nil {
		return false, err.Error()
	}
	return true, ""
}

// ---- Voice reminder -----------------------------------------------------------------------------

const maxVoiceBytes = 10 << 20 // Telegram accepts voice up to 50 MB; reminders are short

type voiceSettingsView struct {
	telegram.VoiceSchedule
	Timezone  string  `json:"timezone"`
	HasFile   bool    `json:"has_file"`
	Filename  string  `json:"filename"`
	SizeBytes int     `json:"size_bytes"`
	UpdatedAt *string `json:"updated_at"`
}

func (h *CekViewsHandler) voiceView(ctx context.Context) voiceSettingsView {
	v := voiceSettingsView{VoiceSchedule: h.Store.LoadVoiceSchedule(ctx), Timezone: "Asia/Jakarta (GMT+7)"}
	err := h.DB.QueryRow(ctx, `SELECT filename, octet_length(data), updated_at::text FROM cek_views_voice_file WHERE id=1`).Scan(&v.Filename, &v.SizeBytes, &v.UpdatedAt)
	v.HasFile = err == nil
	return v
}

func (h *CekViewsHandler) GetVoice(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, h.voiceView(r.Context()))
}

func (h *CekViewsHandler) SaveVoice(w http.ResponseWriter, r *http.Request) {
	var req telegram.VoiceSchedule
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := h.Store.SaveVoiceSchedule(r.Context(), req); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, h.voiceView(r.Context()))
}

// UploadVoice stores (or replaces) the voice recording: multipart field "file", an OGG/Opus, MP3 or M4A file.
func (h *CekViewsHandler) UploadVoice(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxVoiceBytes+(1<<20))
	file, header, err := r.FormFile("file")
	if err != nil {
		respondError(w, http.StatusBadRequest, "choose a voice file (max 10 MB)")
		return
	}
	defer file.Close()
	ext := strings.ToLower(filepath.Ext(header.Filename))
	mimes := map[string]string{".ogg": "audio/ogg", ".oga": "audio/ogg", ".opus": "audio/ogg", ".mp3": "audio/mpeg", ".m4a": "audio/mp4"}
	mime, ok := mimes[ext]
	if !ok {
		respondError(w, http.StatusBadRequest, "the voice file must be .ogg (Opus), .mp3 or .m4a")
		return
	}
	data, err := io.ReadAll(io.LimitReader(file, maxVoiceBytes+1))
	if err != nil || len(data) == 0 || len(data) > maxVoiceBytes {
		respondError(w, http.StatusBadRequest, "the voice file must be between 1 byte and 10 MB")
		return
	}
	if _, err := h.DB.Exec(r.Context(), `
		INSERT INTO cek_views_voice_file (id, filename, mime, data) VALUES (1,$1,$2,$3)
		ON CONFLICT (id) DO UPDATE SET filename=EXCLUDED.filename, mime=EXCLUDED.mime, data=EXCLUDED.data, updated_at=now()`,
		filepath.Base(header.Filename), mime, data); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save the voice file")
		return
	}
	respondJSON(w, http.StatusOK, h.voiceView(r.Context()))
}

// VoiceFile streams the saved recording (for the preview player).
func (h *CekViewsHandler) VoiceFile(w http.ResponseWriter, r *http.Request) {
	var mime string
	var data []byte
	if err := h.DB.QueryRow(r.Context(), `SELECT mime, data FROM cek_views_voice_file WHERE id=1`).Scan(&mime, &data); err != nil {
		respondError(w, http.StatusNotFound, "no voice file uploaded")
		return
	}
	w.Header().Set("Content-Type", mime)
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write(data)
}

// TestVoice sends the recording right now, ignoring the schedule.
func (h *CekViewsHandler) TestVoice(w http.ResponseWriter, r *http.Request) {
	if err := h.Voice.SendNow(r.Context()); err != nil {
		respondError(w, http.StatusBadGateway, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "sent"})
}

// ---- Telegram bot (its own bot, separate from the main Telegram bot) -----------------------------

type cekTelegramView struct {
	BotTokenSet bool   `json:"bot_token_set"`
	TokenHint   string `json:"token_hint"`   // the last 4 characters; the token itself is never sent back
	TokenSource string `json:"token_source"` // database | environment | none
	ChatID      string `json:"chat_id"`
	ThreadID    int    `json:"thread_id"`
	SendEnabled bool   `json:"send_enabled"`
}

func (h *CekViewsHandler) telegramView(ctx context.Context) cekTelegramView {
	token, source := h.Store.CekViewsToken(ctx)
	cfg := h.Store.LoadCekViewsConfig(ctx)
	v := cekTelegramView{BotTokenSet: token != "", TokenSource: source, ChatID: cfg.ChatID, ThreadID: cfg.ThreadID, SendEnabled: cfg.SendEnabled}
	if len(token) >= 4 {
		v.TokenHint = token[len(token)-4:]
	}
	return v
}

func (h *CekViewsHandler) GetTelegram(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, h.telegramView(r.Context()))
}

// SaveTelegram stores the CEK VIEWS bot token (only when a new one is sent; empty keeps the saved one, clear_token removes
// it) together with the group, topic and send switch.
func (h *CekViewsHandler) SaveTelegram(w http.ResponseWriter, r *http.Request) {
	var req struct {
		BotToken    string `json:"bot_token"`
		ClearToken  bool   `json:"clear_token"`
		ChatID      string `json:"chat_id"`
		ThreadID    int    `json:"thread_id"`
		SendEnabled bool   `json:"send_enabled"`
	}
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	ctx := r.Context()
	token := strings.TrimSpace(req.BotToken)
	if token != "" && !strings.Contains(token, ":") {
		respondError(w, http.StatusBadRequest, "the bot token looks invalid")
		return
	}
	if token != "" || req.ClearToken {
		if err := h.Store.SaveCekViewsToken(ctx, token); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to save the bot token")
			return
		}
	}
	if err := h.Store.SaveCekViewsConfig(ctx, telegram.CekViewsConfig{ChatID: req.ChatID, ThreadID: req.ThreadID, SendEnabled: req.SendEnabled}); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save the settings")
		return
	}
	respondJSON(w, http.StatusOK, h.telegramView(ctx))
}

// TelegramStatus checks that the CEK VIEWS bot token connects (the typed one if given, else the saved one).
func (h *CekViewsHandler) TelegramStatus(w http.ResponseWriter, r *http.Request) {
	var req struct {
		BotToken string `json:"bot_token"`
	}
	_ = decodeJSON(r, &req)
	token := strings.TrimSpace(req.BotToken)
	if token == "" {
		token, _ = h.Store.CekViewsToken(r.Context())
	}
	if token == "" {
		respondJSON(w, http.StatusOK, map[string]any{"connected": false, "error": "no_token"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	info, err := telegram.CheckBot(ctx, token)
	if err != nil {
		respondJSON(w, http.StatusOK, map[string]any{"connected": false, "error": err.Error()})
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"connected": true, "bot_username": info.Username, "bot_name": info.Name})
}

// TelegramTest sends a short test message to the saved CEK VIEWS group / topic with the CEK VIEWS bot.
func (h *CekViewsHandler) TelegramTest(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	token, _ := h.Store.CekViewsToken(ctx)
	cfg := h.Store.LoadCekViewsConfig(ctx)
	if token == "" || cfg.ChatID == "" {
		respondError(w, http.StatusBadRequest, "save the bot token and the chat id first")
		return
	}
	if err := telegram.SendHTML(ctx, token, cfg.ChatID, cfg.ThreadID, "✅ Ralulu Hub – CEK VIEWS connection test"); err != nil {
		respondError(w, http.StatusBadGateway, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "sent"})
}
