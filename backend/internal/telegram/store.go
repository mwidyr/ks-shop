package telegram

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"os"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	keyToken  = "telegram_bot_token" // AES-GCM encrypted, base64
	keyConfig = "telegram_config"    // JSON of Config
)

// Store keeps the bot token (encrypted at rest) and the notification config in store_settings,
// and the per-Location chat ids on host_locations.
type Store struct {
	DB     *pgxpool.Pool
	Secret string // encryption key material (TELEGRAM_ENCRYPTION_KEY, else the JWT secret)
}

func (s *Store) gcm() (cipher.AEAD, error) {
	sum := sha256.Sum256([]byte("ralulu-telegram:" + s.Secret))
	block, err := aes.NewCipher(sum[:])
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

func (s *Store) encrypt(plain string) (string, error) {
	g, err := s.gcm()
	if err != nil {
		return "", err
	}
	nonce := make([]byte, g.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(g.Seal(nonce, nonce, []byte(plain), nil)), nil
}

func (s *Store) decrypt(enc string) (string, error) {
	raw, err := base64.StdEncoding.DecodeString(enc)
	if err != nil {
		return "", err
	}
	g, err := s.gcm()
	if err != nil {
		return "", err
	}
	if len(raw) < g.NonceSize() {
		return "", errors.New("bad ciphertext")
	}
	plain, err := g.Open(nil, raw[:g.NonceSize()], raw[g.NonceSize():], nil)
	return string(plain), err
}

func (s *Store) get(ctx context.Context, key string) string {
	var v string
	_ = s.DB.QueryRow(ctx, `SELECT value FROM store_settings WHERE key=$1`, key).Scan(&v)
	return v
}

func (s *Store) set(ctx context.Context, key, value string) error {
	_, err := s.DB.Exec(ctx, `INSERT INTO store_settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, key, value)
	return err
}

// Token returns the bot token: the one saved on the settings page, else TELEGRAM_BOT_TOKEN
// from the server environment ("" when neither is set).
func (s *Store) Token(ctx context.Context) string {
	t, _ := s.TokenWithSource(ctx)
	return t
}

// TokenWithSource also says where the token came from: "database", "environment" or "none".
func (s *Store) TokenWithSource(ctx context.Context) (string, string) {
	if enc := s.get(ctx, keyToken); enc != "" {
		if t, err := s.decrypt(enc); err == nil && t != "" {
			return t, "database"
		}
	}
	if t := strings.TrimSpace(os.Getenv("TELEGRAM_BOT_TOKEN")); t != "" {
		return t, "environment"
	}
	return "", "none"
}

// SaveToken stores (or clears, with "") the bot token.
func (s *Store) SaveToken(ctx context.Context, token string) error {
	if token == "" {
		return s.set(ctx, keyToken, "")
	}
	enc, err := s.encrypt(token)
	if err != nil {
		return err
	}
	return s.set(ctx, keyToken, enc)
}

// LoadConfig returns the saved config merged over the defaults.
func (s *Store) LoadConfig(ctx context.Context) Config {
	cfg := DefaultConfig()
	if raw := s.get(ctx, keyConfig); raw != "" {
		_ = json.Unmarshal([]byte(raw), &cfg)
	}
	return cfg.Normalize()
}

func (s *Store) SaveConfig(ctx context.Context, cfg Config) error {
	b, err := json.Marshal(cfg.Normalize())
	if err != nil {
		return err
	}
	return s.set(ctx, keyConfig, string(b))
}
