package telegram

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"strings"
	"time"
)

var httpClient = &http.Client{Timeout: 15 * time.Second}

// APIBase is Telegram's Bot API root; TELEGRAM_API_BASE overrides it (local testing with a fake server).
var APIBase = func() string {
	if v := os.Getenv("TELEGRAM_API_BASE"); v != "" {
		return strings.TrimRight(v, "/")
	}
	return "https://api.telegram.org"
}()

type apiResponse struct {
	OK          bool            `json:"ok"`
	Description string          `json:"description"`
	Result      json.RawMessage `json:"result"`
}

func call(ctx context.Context, token, method string, payload interface{}) (*apiResponse, error) {
	if !strings.Contains(token, ":") {
		return nil, errors.New("invalid bot token")
	}
	var body io.Reader
	if payload != nil {
		b, _ := json.Marshal(payload)
		body = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, APIBase+"/bot"+token+"/"+method, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, errors.New("cannot reach Telegram")
	}
	defer resp.Body.Close()
	var out apiResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, fmt.Errorf("unexpected Telegram response (HTTP %d)", resp.StatusCode)
	}
	if !out.OK {
		if out.Description == "" {
			out.Description = fmt.Sprintf("HTTP %d", resp.StatusCode)
		}
		return &out, errors.New(out.Description)
	}
	return &out, nil
}

// BotInfo is the result of getMe.
type BotInfo struct {
	Username string `json:"username"`
	Name     string `json:"first_name"`
}

// CheckBot verifies the token (Connection Status).
func CheckBot(ctx context.Context, token string) (*BotInfo, error) {
	res, err := call(ctx, token, "getMe", nil)
	if err != nil {
		return nil, err
	}
	var info BotInfo
	_ = json.Unmarshal(res.Result, &info)
	return &info, nil
}

// Send posts one plain-text message (emojis and line breaks go through as typed).
func Send(ctx context.Context, token, chatID, text string) error {
	if strings.TrimSpace(chatID) == "" {
		return errors.New("no chat id")
	}
	_, err := call(ctx, token, "sendMessage", map[string]interface{}{"chat_id": strings.TrimSpace(chatID), "text": text})
	return err
}

// SendRepeated sends the same message n times with a short pause (Telegram rate-limits a group).
func SendRepeated(ctx context.Context, token, chatID, text string, n int) error {
	for i := 0; i < n; i++ {
		if i > 0 {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(350 * time.Millisecond):
			}
		}
		if err := Send(ctx, token, chatID, text); err != nil {
			return err
		}
	}
	return nil
}

// SendHTML posts one HTML-formatted message (links, bold) to a chat, inside the forum topic threadID
// when it is above 0 (a group with Topics enabled).
func SendHTML(ctx context.Context, token, chatID string, threadID int, html string) error {
	if strings.TrimSpace(chatID) == "" {
		return errors.New("no chat id")
	}
	payload := map[string]interface{}{
		"chat_id": strings.TrimSpace(chatID), "text": html, "parse_mode": "HTML", "disable_web_page_preview": true,
	}
	if threadID > 0 {
		payload["message_thread_id"] = threadID
	}
	_, err := call(ctx, token, "sendMessage", payload)
	return err
}

// SendVoice uploads an OGG/Opus recording as a voice message, in the forum topic threadID when above 0.
func SendVoice(ctx context.Context, token, chatID string, threadID int, filename string, data []byte) error {
	if !strings.Contains(token, ":") {
		return errors.New("invalid bot token")
	}
	if strings.TrimSpace(chatID) == "" {
		return errors.New("no chat id")
	}
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	_ = mw.WriteField("chat_id", strings.TrimSpace(chatID))
	if threadID > 0 {
		_ = mw.WriteField("message_thread_id", fmt.Sprint(threadID))
	}
	if filename == "" {
		filename = "voice.ogg"
	}
	part, err := mw.CreateFormFile("voice", filename)
	if err != nil {
		return err
	}
	if _, err := part.Write(data); err != nil {
		return err
	}
	if err := mw.Close(); err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, APIBase+"/bot"+token+"/sendVoice", &buf)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", mw.FormDataContentType())
	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return errors.New("cannot reach Telegram")
	}
	defer resp.Body.Close()
	var out apiResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return fmt.Errorf("unexpected Telegram response (HTTP %d)", resp.StatusCode)
	}
	if !out.OK {
		if out.Description == "" {
			out.Description = fmt.Sprintf("HTTP %d", resp.StatusCode)
		}
		return errors.New(out.Description)
	}
	return nil
}
