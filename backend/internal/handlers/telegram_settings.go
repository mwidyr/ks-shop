package handlers

import (
	"context"
	"net/http"
	"strings"
	"time"

	"ordermgmt/internal/telegram"

	"github.com/jackc/pgx/v5/pgxpool"
)

// TelegramHandler serves the Telegram Settings page (Super Admin only): bot token, group chat ids
// (one Global Group + one per Location), the four notification configs, and test sends.
type TelegramHandler struct {
	DB    *pgxpool.Pool
	Store *telegram.Store
}

type telegramLocation struct {
	ID     int    `json:"id"`
	Name   string `json:"name"`
	ChatID string `json:"chat_id"`
}

type telegramSettingsView struct {
	BotToken string `json:"bot_token"` // shown in full on this Super Admin page, by design
	// TokenSource is "database", "environment" (TELEGRAM_BOT_TOKEN, never sent to the browser) or "none".
	TokenSource string             `json:"token_source"`
	Config      telegram.Config    `json:"config"`
	Locations   []telegramLocation `json:"locations"`
}

func (h *TelegramHandler) locations(ctx context.Context) []telegramLocation {
	out := []telegramLocation{}
	rows, err := h.DB.Query(ctx, `SELECT id, name, COALESCE(telegram_chat_id,'') FROM host_locations WHERE is_active = true ORDER BY name`)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var l telegramLocation
		if rows.Scan(&l.ID, &l.Name, &l.ChatID) == nil {
			out = append(out, l)
		}
	}
	return out
}

// Get returns the saved settings; Locations always lists every active Location (new ones appear
// automatically, with an empty chat id).
func (h *TelegramHandler) Get(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	token, source := h.Store.TokenWithSource(ctx)
	if source != "database" {
		token = ""
	}
	respondJSON(w, http.StatusOK, telegramSettingsView{
		BotToken:    token,
		TokenSource: source,
		Config:      h.Store.LoadConfig(ctx),
		Locations:   h.locations(ctx),
	})
}

// Save stores the token, the group chat ids and every notification setting in one go.
func (h *TelegramHandler) Save(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	// Start from what is saved so a field missing from the request keeps its value instead of
	// silently turning a notification off.
	req := telegramSettingsView{Config: h.Store.LoadConfig(ctx)}
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	token := strings.TrimSpace(req.BotToken)
	if token != "" && !strings.Contains(token, ":") {
		respondError(w, http.StatusBadRequest, "bot token looks invalid")
		return
	}
	req.Config.GlobalChatID = strings.TrimSpace(req.Config.GlobalChatID)
	if err := h.Store.SaveToken(ctx, token); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save bot token")
		return
	}
	if err := h.Store.SaveConfig(ctx, req.Config); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save settings")
		return
	}
	for _, l := range req.Locations {
		chat := strings.TrimSpace(l.ChatID)
		var v interface{} = chat
		if chat == "" {
			v = nil
		}
		if _, err := h.DB.Exec(ctx, `UPDATE host_locations SET telegram_chat_id=$1 WHERE id=$2`, v, l.ID); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to save location group")
			return
		}
	}
	h.Get(w, r)
}

type telegramCheckRequest struct {
	BotToken string `json:"bot_token"` // optional: check what is typed without saving it first
}

// Status reports whether the bot token connects (Connection Status).
func (h *TelegramHandler) Status(w http.ResponseWriter, r *http.Request) {
	var req telegramCheckRequest
	_ = decodeJSON(r, &req)
	token := strings.TrimSpace(req.BotToken)
	if token == "" {
		token = h.Store.Token(r.Context())
	}
	if token == "" {
		respondJSON(w, http.StatusOK, map[string]interface{}{"connected": false, "error": "no_token"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	info, err := telegram.CheckBot(ctx, token)
	if err != nil {
		respondJSON(w, http.StatusOK, map[string]interface{}{"connected": false, "error": err.Error()})
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"connected": true, "bot_username": info.Username, "bot_name": info.Name})
}

type telegramTestMessageRequest struct {
	BotToken string `json:"bot_token"`
	ChatID   string `json:"chat_id"`
	Label    string `json:"label"` // which group, shown in the test text
}

// TestMessage sends a plain test message to one chat id (Bot Connection & Group Settings).
func (h *TelegramHandler) TestMessage(w http.ResponseWriter, r *http.Request) {
	var req telegramTestMessageRequest
	if err := decodeJSON(r, &req); err != nil || strings.TrimSpace(req.ChatID) == "" {
		respondError(w, http.StatusBadRequest, "chat_id is required")
		return
	}
	token := strings.TrimSpace(req.BotToken)
	if token == "" {
		token = h.Store.Token(r.Context())
	}
	if token == "" {
		respondError(w, http.StatusBadRequest, "bot token is not set")
		return
	}
	text := "✅ Ralulu Hub – Telegram connection test"
	if l := strings.TrimSpace(req.Label); l != "" {
		text += " (" + l + ")"
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	if err := telegram.Send(ctx, token, req.ChatID, text); err != nil {
		respondError(w, http.StatusBadGateway, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "sent"})
}

type telegramTestNotificationRequest struct {
	BotToken string            `json:"bot_token"`
	ChatID   string            `json:"chat_id"`
	Type     string            `json:"type"`
	Template string            `json:"template"` // the template as currently edited (no need to save first)
	Emoji    string            `json:"emoji"`
	Vars     map[string]string `json:"vars"` // simulated host_name / location_name / milestone / qty / ...
}

// TestNotification renders the edited template with simulated values and sends exactly ONE
// message (never the official repetition). It touches no sales data and no notification log.
func (h *TelegramHandler) TestNotification(w http.ResponseWriter, r *http.Request) {
	var req telegramTestNotificationRequest
	if err := decodeJSON(r, &req); err != nil || strings.TrimSpace(req.ChatID) == "" || strings.TrimSpace(req.Template) == "" {
		respondError(w, http.StatusBadRequest, "chat_id and template are required")
		return
	}
	token := strings.TrimSpace(req.BotToken)
	if token == "" {
		token = h.Store.Token(r.Context())
	}
	if token == "" {
		respondError(w, http.StatusBadRequest, "bot token is not set")
		return
	}
	vars := map[string]string{}
	for k, v := range req.Vars {
		vars[k] = v
	}
	vars["host_name"] = telegram.HostName(vars["host_name"])
	vars["date"] = time.Now().In(businessTZ).Format("2006-01-02")
	if req.Type == telegram.TypeHostMilestone {
		m := 0
		for _, c := range vars["milestone"] {
			if c < '0' || c > '9' {
				m = 0
				break
			}
			m = m*10 + int(c-'0')
		}
		vars["celebration_effect"] = telegram.CelebrationEffect(req.Emoji, m)
	} else {
		vars["celebration_effect"] = ""
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	if err := telegram.Send(ctx, token, req.ChatID, telegram.Render(req.Template, vars)); err != nil {
		respondError(w, http.StatusBadGateway, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "sent"})
}
