package telegram

import (
	"context"
	"encoding/json"
	"os"
	"strings"
)

const (
	keyCekViewsToken  = "cek_views_bot_token" // AES-GCM encrypted, base64 - a bot of its own, never the main bot's token
	keyCekViewsConfig = "cek_views_telegram"  // JSON of CekViewsConfig
)

// CekViewsConfig is where CEK VIEWS reports and voice reminders go: the group (and optional forum topic) and an on/off switch.
type CekViewsConfig struct {
	ChatID      string `json:"chat_id"`
	ThreadID    int    `json:"thread_id"`
	SendEnabled bool   `json:"send_enabled"`
}

// CekViewsToken is the CEK VIEWS bot's own token: the one saved in CEK VIEWS Settings, else TELEGRAM_CEK_VIEWS_BOT_TOKEN.
// There is deliberately no fallback to the main Telegram bot. The second value is "database", "environment" or "none".
func (s *Store) CekViewsToken(ctx context.Context) (string, string) {
	if enc := s.get(ctx, keyCekViewsToken); enc != "" {
		if t, err := s.decrypt(enc); err == nil && t != "" {
			return t, "database"
		}
	}
	if t := strings.TrimSpace(os.Getenv("TELEGRAM_CEK_VIEWS_BOT_TOKEN")); t != "" {
		return t, "environment"
	}
	return "", "none"
}

// SaveCekViewsToken stores (or clears, with "") the CEK VIEWS bot token.
func (s *Store) SaveCekViewsToken(ctx context.Context, token string) error {
	if token == "" {
		return s.set(ctx, keyCekViewsToken, "")
	}
	enc, err := s.encrypt(token)
	if err != nil {
		return err
	}
	return s.set(ctx, keyCekViewsToken, enc)
}

// LoadCekViewsConfig returns the saved CEK VIEWS group settings. Before anything is saved there, the group that an
// earlier version kept in the main Telegram config (and its send switch) is used, so nothing is lost on upgrade.
func (s *Store) LoadCekViewsConfig(ctx context.Context) CekViewsConfig {
	if raw := s.get(ctx, keyCekViewsConfig); raw != "" {
		var c CekViewsConfig
		if json.Unmarshal([]byte(raw), &c) == nil {
			c.ChatID = strings.TrimSpace(c.ChatID)
			return c
		}
	}
	legacy := s.LoadConfig(ctx)
	return CekViewsConfig{ChatID: legacy.CekViewsChatID, ThreadID: legacy.CekViewsThreadID, SendEnabled: legacy.SendEnabled}
}

func (s *Store) SaveCekViewsConfig(ctx context.Context, c CekViewsConfig) error {
	c.ChatID = strings.TrimSpace(c.ChatID)
	if c.ThreadID < 0 {
		c.ThreadID = 0
	}
	b, _ := json.Marshal(c)
	return s.set(ctx, keyCekViewsConfig, string(b))
}
