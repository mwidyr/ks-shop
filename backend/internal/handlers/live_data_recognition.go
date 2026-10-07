package handlers

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	_ "image/jpeg"
	"image/png"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// LiveDataHandler implements the public "LIVE Data Upload" wizard - a no-login replacement for
// the client's old Google Form. Hosts pick Location + Host, upload 3 TikTok LIVE screenshots,
// get AI-recognized values to review/correct, then submit; submitting creates a new live_sessions
// row directly (this flow never requires a Panel Siaran Go-Live/End cycle first).
type LiveDataHandler struct {
	DB                   *pgxpool.Pool
	OpenAIAPIKey         string
	OpenAIVisionModel    string
	LiveDataAccessSecret string
}

// ---- Rotating access code ----
//
// Deterministic (no DB row, no shared state): any instance - and the authenticated CurrentCode
// endpoint the Admin UI polls - computes the same 6-digit code from the secret + the current
// hour. VerifyCode accepts the current OR previous hour's code (a small grace window so a code
// that just rotated doesn't reject someone mid-keystroke).

func accessCodeForHour(secret string, hourBucket int64) string {
	mac := hmac.New(sha256.New, []byte(secret))
	fmt.Fprintf(mac, "%d", hourBucket)
	sum := mac.Sum(nil)
	// First 4 bytes as a uint, mod down to 6 digits - plenty of entropy for an hourly code
	// that's only ever meant to deter casual/automated abuse of a public link, not real auth.
	n := uint32(sum[0])<<24 | uint32(sum[1])<<16 | uint32(sum[2])<<8 | uint32(sum[3])
	return fmt.Sprintf("%06d", n%1000000)
}

func currentAccessCode(secret string, t time.Time) string {
	return accessCodeForHour(secret, t.Unix()/3600)
}

func validAccessCodes(secret string, t time.Time) []string {
	hour := t.Unix() / 3600
	return []string{accessCodeForHour(secret, hour), accessCodeForHour(secret, hour-1)}
}

// ---- Session token ----
//
// Issued once a host passes the code gate; decoupled from the rotating code entirely after
// that, so a code rotation mid-upload never interrupts someone already past Step 0. Signed with
// LiveDataAccessSecret (never JWTSecret - this token carries no staff identity, just "this
// browser passed the code gate recently").

const liveDataTokenPurpose = "live_data_upload"
const liveDataTokenTTL = 4 * time.Hour

type liveDataClaims struct {
	Purpose string `json:"purpose"`
	jwt.RegisteredClaims
}

func generateLiveDataToken(secret string) (string, error) {
	claims := liveDataClaims{
		Purpose: liveDataTokenPurpose,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(liveDataTokenTTL)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

func requireLiveDataToken(r *http.Request, secret string) error {
	header := r.Header.Get("Authorization")
	raw := strings.TrimPrefix(header, "Bearer ")
	if raw == "" || raw == header {
		return errors.New("missing session token")
	}
	claims := &liveDataClaims{}
	token, err := jwt.ParseWithClaims(raw, claims, func(t *jwt.Token) (interface{}, error) {
		return []byte(secret), nil
	})
	if err != nil || !token.Valid || claims.Purpose != liveDataTokenPurpose {
		return errors.New("invalid or expired session token")
	}
	return nil
}

func (h *LiveDataHandler) VerifyCode(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Code string `json:"code"`
	}
	if err := decodeJSON(r, &req); err != nil || strings.TrimSpace(req.Code) == "" {
		respondError(w, http.StatusBadRequest, "code is required")
		return
	}
	valid := false
	for _, c := range validAccessCodes(h.LiveDataAccessSecret, time.Now()) {
		if c == strings.TrimSpace(req.Code) {
			valid = true
			break
		}
	}
	if !valid {
		respondError(w, http.StatusUnauthorized, "kode tidak valid atau sudah kedaluwarsa")
		return
	}
	token, err := generateLiveDataToken(h.LiveDataAccessSecret)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to issue session")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"token": token})
}

// CurrentCode is registered inside the authenticated route group (staff only) - the Admin-side
// "here's today's code" display on Panel Siaran polls this.
func (h *LiveDataHandler) CurrentCode(w http.ResponseWriter, r *http.Request) {
	now := time.Now()
	nextRotation := time.Unix((now.Unix()/3600+1)*3600, 0)
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"code":                 currentAccessCode(h.LiveDataAccessSecret, now),
		"minutes_until_rotate": int(time.Until(nextRotation).Minutes()) + 1,
	})
}

// ---- Image stitching ----
//
// The client's real screenshots overlap (two of the three are the same scrollable panel at
// different scroll positions) rather than being 3 distinct pages - rather than risk the model
// double-counting or getting confused by repeated rows, stack all 3 into one tall image before
// recognition. No attempt at smart crop-matching of the overlap: every row is independently
// text-labeled ("Penonton unik", "Suka", ...), so a duplicated row just reads the same value
// twice, which is harmless given the host reviews everything anyway.
func stitchImages(images []image.Image) []byte {
	maxWidth, totalHeight := 0, 0
	for _, img := range images {
		b := img.Bounds()
		if b.Dx() > maxWidth {
			maxWidth = b.Dx()
		}
		totalHeight += b.Dy()
	}
	canvas := image.NewRGBA(image.Rect(0, 0, maxWidth, totalHeight))
	draw.Draw(canvas, canvas.Bounds(), &image.Uniform{C: color.White}, image.Point{}, draw.Src)
	y := 0
	for _, img := range images {
		b := img.Bounds()
		draw.Draw(canvas, image.Rect(0, y, b.Dx(), y+b.Dy()), img, b.Min, draw.Src)
		y += b.Dy()
	}
	var buf bytes.Buffer
	_ = png.Encode(&buf, canvas)
	return buf.Bytes()
}

func downloadAndDecodeImage(url string) (image.Image, error) {
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return nil, fmt.Errorf("download: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("download returned %d", resp.StatusCode)
	}
	img, _, err := image.Decode(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("decode: %w", err)
	}
	return img, nil
}

// ---- OpenAI vision recognition ----

type recognizedLiveData struct {
	Views               *int     `json:"views"`
	UV                  *int     `json:"uv"`
	ActiveViewers       *int     `json:"active_viewers"`
	AWTSeconds          *int     `json:"awt_seconds"`
	PCU                 *int     `json:"pcu"`
	ACU                 *float64 `json:"acu"`
	Follows             *int     `json:"follows"`
	Chats               *int     `json:"chats"`
	Shares              *int     `json:"shares"`
	Likes               *int     `json:"likes"`
	LiveDurationSeconds *int     `json:"live_duration_seconds"`
}

const visionPrompt = `You are reading a combined screenshot of a TikTok LIVE analytics summary (Indonesian UI, labels like "Tayangan", "Penonton unik", "Rata-rata durasi menonton", "Suka", etc). Extract these fields and respond with ONLY a JSON object, no other text:
- views (Tayangan)
- uv (Penonton unik)
- active_viewers (Penonton aktif)
- awt_seconds (Rata-rata durasi menonton, convert from its MM:SS-like display to total seconds)
- pcu (Jumlah penonton serentak tertinggi)
- acu (Rata-rata penonton serentak)
- follows (Pengikut baru)
- chats (Komentar)
- shares (Berbagi)
- likes (Suka - if shown like "1K", convert to a number, e.g. 1000)
- live_duration_seconds (total LIVE duration if shown anywhere, e.g. "1 jam 9 menit" -> 4140, else null)
Use null for any field you can't find. Respond with raw JSON only, matching exactly these keys.`

func callOpenAIVision(ctx context.Context, apiKey, model string, stitchedImage []byte) (*recognizedLiveData, error) {
	if apiKey == "" {
		return nil, errors.New("AI recognition is not configured yet (OPENAI_API_KEY not set)")
	}
	dataURI := "data:image/png;base64," + base64.StdEncoding.EncodeToString(stitchedImage)

	payload := map[string]interface{}{
		"model": model,
		"messages": []map[string]interface{}{
			{
				"role": "user",
				"content": []map[string]interface{}{
					{"type": "text", "text": visionPrompt},
					{"type": "image_url", "image_url": map[string]string{"url": dataURI}},
				},
			},
		},
		"response_format": map[string]string{"type": "json_object"},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("encode payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.openai.com/v1/chat/completions", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 45 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("openai returned %d: %s", resp.StatusCode, respBody)
	}

	var parsed struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(respBody, &parsed); err != nil || len(parsed.Choices) == 0 {
		return nil, fmt.Errorf("unexpected openai response: %s", respBody)
	}

	var result recognizedLiveData
	if err := json.Unmarshal([]byte(parsed.Choices[0].Message.Content), &result); err != nil {
		return nil, fmt.Errorf("failed to parse recognized fields: %w", err)
	}
	return &result, nil
}

func (h *LiveDataHandler) Recognize(w http.ResponseWriter, r *http.Request) {
	if err := requireLiveDataToken(r, h.LiveDataAccessSecret); err != nil {
		respondError(w, http.StatusUnauthorized, err.Error())
		return
	}
	var req struct {
		ImageURLs []string `json:"image_urls"`
	}
	if err := decodeJSON(r, &req); err != nil || len(req.ImageURLs) == 0 {
		respondError(w, http.StatusBadRequest, "image_urls is required")
		return
	}

	images := make([]image.Image, 0, len(req.ImageURLs))
	for _, url := range req.ImageURLs {
		img, err := downloadAndDecodeImage(url)
		if err != nil {
			respondError(w, http.StatusBadRequest, "failed to read screenshot: "+err.Error())
			return
		}
		images = append(images, img)
	}
	stitched := stitchImages(images)

	result, err := callOpenAIVision(r.Context(), h.OpenAIAPIKey, h.OpenAIVisionModel, stitched)
	if err != nil {
		respondError(w, http.StatusBadGateway, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, result)
}

// ---- Submit ----

type submitPublicLiveDataRequest struct {
	HostID              int      `json:"host_id"`
	LocationID          int      `json:"location_id"`
	Views               int      `json:"views"`
	UV                  int      `json:"uv"`
	ActiveViewers       int      `json:"active_viewers"`
	AWTSeconds          int      `json:"awt_seconds"`
	PCU                 int      `json:"pcu"`
	ACU                 float64  `json:"acu"`
	Follows             int      `json:"follows"`
	Chats               int      `json:"chats"`
	Shares              int      `json:"shares"`
	Likes               int      `json:"likes"`
	LiveDurationSeconds int             `json:"live_duration_seconds"`
	ImageURLs           []string        `json:"image_urls"`
	RecognizedData      json.RawMessage `json:"recognized_data"` // the raw AI output from Recognize, passed back through unchanged - stored for staff to audit what the AI actually read vs. what the host corrected it to
}

// Submit creates a brand new live_sessions row directly (status 'ended', already carrying
// live_data_recorded_at) rather than requiring the host to have gone live through Panel Siaran
// first - this flow is a standalone replacement for the old Google Form, not an extension of the
// broadcast-console flow. started_at/ended_at are synthesized from the host-confirmed LIVE
// Duration (now() and now()-duration) purely so this session participates correctly in the
// dashboard's ACU weighted-average-by-duration calculation, same as any other session.
func (h *LiveDataHandler) Submit(w http.ResponseWriter, r *http.Request) {
	if err := requireLiveDataToken(r, h.LiveDataAccessSecret); err != nil {
		respondError(w, http.StatusUnauthorized, err.Error())
		return
	}
	var req submitPublicLiveDataRequest
	if err := decodeJSON(r, &req); err != nil || req.HostID == 0 || len(req.ImageURLs) == 0 {
		respondError(w, http.StatusBadRequest, "host_id and image_urls are required")
		return
	}

	ctx := r.Context()
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(ctx)

	// live_sessions.label is NOT NULL with no default (every other creation path - Panel
	// Siaran's createLiveSession - always supplies one) - build the same "LIVE <host name>"
	// convention here from the host's name, same as PanelSiaran.jsx's own `Live ${host.name}`.
	var hostName string
	if err := tx.QueryRow(ctx, `SELECT name FROM hosts WHERE id=$1`, req.HostID).Scan(&hostName); err != nil {
		respondError(w, http.StatusBadRequest, "host not found")
		return
	}
	label := fmt.Sprintf("LIVE %s - %s", hostName, time.Now().Format("2 Jan 2006 15:04"))

	duration := time.Duration(req.LiveDurationSeconds) * time.Second
	endedAt := time.Now()
	startedAt := endedAt.Add(-duration)

	var sessionID int
	err = tx.QueryRow(ctx, `
		INSERT INTO live_sessions (host_id, location_id, label, status, started_at, ended_at,
			views, uv, active_viewers, awt_seconds, pcu, acu, follows, chats, shares, likes, live_data_recorded_at)
		VALUES ($1,$2,$3,'ended',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now())
		RETURNING id`,
		req.HostID, nullableID(req.LocationID), label, startedAt, endedAt,
		req.Views, req.UV, req.ActiveViewers, req.AWTSeconds, req.PCU, req.ACU,
		req.Follows, req.Chats, req.Shares, req.Likes).Scan(&sessionID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save LIVE session")
		return
	}

	// The same recognized_data snapshot is attached to all 3 screenshot rows (they were
	// recognized together as one stitched image, not individually) - lets staff later see
	// exactly what the AI read for this batch vs. what the host ended up submitting.
	recognizedSnapshot := req.RecognizedData
	if len(recognizedSnapshot) == 0 {
		recognizedSnapshot = json.RawMessage("null")
	}
	for _, url := range req.ImageURLs {
		if _, err := tx.Exec(ctx, `
			INSERT INTO live_session_screenshots (session_id, image_url, status, recognized_data)
			VALUES ($1,$2,'processed',$3)`, sessionID, url, recognizedSnapshot); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to save screenshots")
			return
		}
	}

	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save LIVE session")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func nullableID(id int) interface{} {
	if id == 0 {
		return nil
	}
	return id
}
