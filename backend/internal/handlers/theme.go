package handlers

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	appmw "ordermgmt/internal/middleware"
)

// ThemeHandler is the brand theme system (Theme_Spec): tokens are stored in the database as
// versions (draft -> published -> archived), validated for WCAG contrast on the server before
// anything goes live, and published atomically. The storefront reads only the published version.
type ThemeHandler struct {
	DB *pgxpool.Pool
}

// themeKeys is the ordered token list; the value in the JSON/DB is camelCase, the CSS variable kebab-case.
var themeKeys = []string{
	"primary", "onPrimary", "primaryHover", "primaryStrong", "primarySoft", "secondary",
	"bg", "bgSoft", "surface", "text", "text2", "text3", "disabled", "border", "borderStrong",
	"success", "warning", "error", "info", "live",
}

var themeCSSNames = map[string]string{
	"primary": "primary", "onPrimary": "on-primary", "primaryHover": "primary-hover", "primaryStrong": "primary-strong",
	"primarySoft": "primary-soft", "secondary": "secondary", "bg": "bg", "bgSoft": "bg-soft", "surface": "surface",
	"text": "text", "text2": "text-2", "text3": "text-3", "disabled": "disabled", "border": "border",
	"borderStrong": "border-strong", "success": "success", "warning": "warning", "error": "error", "info": "info", "live": "live",
}

var peachTokens = map[string]string{
	"primary": "#FF8C69", "onPrimary": "#2B2B2E", "primaryHover": "#F7795A", "primaryStrong": "#B8432D", "primarySoft": "#FFEDE6",
	"secondary": "#FFC9B8", "bg": "#FFFFFF", "bgSoft": "#F7F7F8", "surface": "#FFFFFF", "text": "#2B2B2E", "text2": "#5F6168",
	"text3": "#6B6E76", "disabled": "#9AA0A6", "border": "#ECEDEF", "borderStrong": "#8C9098", "success": "#2E7D52",
	"warning": "#9A5B00", "error": "#C62828", "info": "#2F6FA3", "live": "#D32F2F",
}

func withOverrides(base map[string]string, over map[string]string) map[string]string {
	out := map[string]string{}
	for k, v := range base {
		out[k] = v
	}
	for k, v := range over {
		out[k] = v
	}
	return out
}

type themePreset struct {
	Key    string            `json:"key"`
	Name   string            `json:"name"`
	Tokens map[string]string `json:"tokens"`
}

var themePresets = []themePreset{
	{"peach", "Peach + Putih", peachTokens},
	{"sky", "Biru muda + Putih", withOverrides(peachTokens, map[string]string{
		"primary": "#7DB9E8", "onPrimary": "#1B2733", "primaryHover": "#68AAE0", "primaryStrong": "#1F5F99", "primarySoft": "#E8F3FC", "secondary": "#BBD9F2",
	})},
	{"mint", "Hijau muda + Putih", withOverrides(peachTokens, map[string]string{
		"primary": "#6FCF97", "onPrimary": "#17321F", "primaryHover": "#5CC287", "primaryStrong": "#1E7A45", "primarySoft": "#E6F7EE", "secondary": "#BFEBD2",
	})},
	{"gray", "Abu minimalis", withOverrides(peachTokens, map[string]string{
		"primary": "#2B2B2E", "onPrimary": "#FFFFFF", "primaryHover": "#444448", "primaryStrong": "#2B2B2E", "primarySoft": "#F0F0F2", "secondary": "#C9CACD",
	})},
}

// ---- colour maths (WCAG 2.x) ----

func parseHex(s string) (r, g, b float64, ok bool) {
	s = strings.TrimPrefix(strings.TrimSpace(s), "#")
	if len(s) == 3 {
		s = string([]byte{s[0], s[0], s[1], s[1], s[2], s[2]})
	}
	if len(s) != 6 {
		return 0, 0, 0, false
	}
	v, err := strconv.ParseUint(s, 16, 32)
	if err != nil {
		return 0, 0, 0, false
	}
	return float64(v >> 16 & 255), float64(v >> 8 & 255), float64(v & 255), true
}

func toHex(r, g, b float64) string {
	c := func(x float64) int { return int(math.Max(0, math.Min(255, math.Round(x)))) }
	return fmt.Sprintf("#%02X%02X%02X", c(r), c(g), c(b))
}

func luminance(hex string) float64 {
	r, g, b, ok := parseHex(hex)
	if !ok {
		return 0
	}
	lin := func(c float64) float64 {
		c /= 255
		if c <= 0.03928 {
			return c / 12.92
		}
		return math.Pow((c+0.055)/1.055, 2.4)
	}
	return 0.2126*lin(r) + 0.7152*lin(g) + 0.0722*lin(b)
}

// ContrastRatio is the WCAG contrast ratio of two hex colours (1..21).
func ContrastRatio(a, b string) float64 {
	la, lb := luminance(a), luminance(b)
	if la < lb {
		la, lb = lb, la
	}
	return (la + 0.05) / (lb + 0.05)
}

// mixHex blends colour a toward b by t (0..1).
func mixHex(a, b string, t float64) string {
	r1, g1, b1, _ := parseHex(a)
	r2, g2, b2, _ := parseHex(b)
	return toHex(r1+(r2-r1)*t, g1+(g2-g1)*t, b1+(b2-b1)*t)
}

type themeIssue struct {
	Pair       string  `json:"pair"`
	Ratio      float64 `json:"ratio"`
	Min        float64 `json:"min"`
	Suggestion string  `json:"suggestion,omitempty"`
}

type themeValidation struct {
	Passed bool               `json:"passed"`
	Issues []themeIssue       `json:"issues"`
	Ratios map[string]float64 `json:"ratios"`
}

func themeRound1(f float64) float64 { return math.Round(f*10) / 10 }

// ValidateTheme checks every colour pair of Theme_Spec. mode "soft" puts text on the soft background.
func ValidateTheme(tokens map[string]string) themeValidation {
	v := themeValidation{Passed: true, Issues: []themeIssue{}, Ratios: map[string]float64{}}
	for _, k := range themeKeys {
		if _, _, _, ok := parseHex(tokens[k]); !ok {
			v.Passed = false
			v.Issues = append(v.Issues, themeIssue{Pair: k + " (HEX)", Ratio: 0, Min: 0, Suggestion: "format HEX tidak valid"})
		}
	}
	if !v.Passed {
		return v
	}
	check := func(pair, fg, bg string, min float64) {
		ratio := themeRound1(ContrastRatio(tokens[fg], bg))
		v.Ratios[pair] = ratio
		if ratio < min {
			v.Passed = false
			is := themeIssue{Pair: pair, Ratio: ratio, Min: min}
			if fg == "onPrimary" {
				dark, white := "#2B2B2E", "#FFFFFF"
				best := dark
				if ContrastRatio(white, tokens["primary"]) > ContrastRatio(dark, tokens["primary"]) {
					best = white
				}
				is.Suggestion = fmt.Sprintf("pakai %s (%.1f:1)", best, themeRound1(ContrastRatio(best, tokens["primary"])))
			}
			v.Issues = append(v.Issues, is)
		}
	}
	for _, t := range []string{"text", "text2", "text3"} {
		for _, bg := range []string{"bg", "surface", "bgSoft"} {
			check(t+"/"+bg, t, tokens[bg], 4.5)
		}
	}
	check("onPrimary/primary", "onPrimary", tokens["primary"], 4.5)
	check("primaryStrong/surface", "primaryStrong", tokens["surface"], 4.5)
	check("borderStrong/surface", "borderStrong", tokens["surface"], 3)
	for _, s := range []string{"success", "warning", "error", "info", "live"} {
		check(s+"/surface", s, tokens["surface"], 4.5)
		ratio := themeRound1(ContrastRatio("#FFFFFF", tokens[s]))
		v.Ratios[s+"/white"] = ratio
		if ratio < 4.5 {
			v.Passed = false
			v.Issues = append(v.Issues, themeIssue{Pair: s + "/white", Ratio: ratio, Min: 4.5})
		}
	}
	sort.Slice(v.Issues, func(i, j int) bool { return v.Issues[i].Pair < v.Issues[j].Pair })
	return v
}

// ThemeCSS renders the :root{...} block for tokens (+ derived tints) in light or soft mode.
func ThemeCSS(tokens map[string]string, mode string) string {
	t := map[string]string{}
	for k, v := range peachTokens { // a missing token falls back to the default so the site never loses a colour
		t[k] = v
	}
	for k, v := range tokens {
		if _, _, _, ok := parseHex(v); ok {
			t[k] = strings.ToUpper(v)
		}
	}
	if mode == "soft" {
		t["bg"] = t["bgSoft"]
	}
	var b strings.Builder
	b.WriteString(":root{")
	for _, k := range themeKeys {
		b.WriteString("--color-" + themeCSSNames[k] + ":" + t[k] + ";")
	}
	b.WriteString("--color-success-bg:" + mixHex(t["success"], "#FFFFFF", 0.9) + ";")
	b.WriteString("--color-warning-bg:" + mixHex(t["warning"], "#FFFFFF", 0.9) + ";")
	b.WriteString("--color-error-bg:" + mixHex(t["error"], "#FFFFFF", 0.92) + ";")
	b.WriteString("--color-live-soft:" + mixHex(t["live"], "#FFFFFF", 0.8) + ";")
	b.WriteString("--color-coupon-bg:" + mixHex(t["primary"], "#FFFFFF", 0.93) + ";")
	b.WriteString("}")
	return b.String()
}

// ---- storage helpers ----

type themeVersion struct {
	ID          int               `json:"id"`
	Status      string            `json:"status"`
	PresetKey   string            `json:"preset_key"`
	Name        string            `json:"name"`
	Tokens      map[string]string `json:"tokens"`
	Mode        string            `json:"mode"`
	Validation  themeValidation   `json:"validation"`
	BasedOn     *int              `json:"based_on"`
	CreatedBy   string            `json:"created_by"`
	CreatedAt   time.Time         `json:"created_at"`
	PublishedAt *time.Time        `json:"published_at"`
}

const themeSelect = `
	SELECT v.id, v.status, COALESCE(v.preset_key,''), v.name, v.tokens, v.mode, v.validation, v.based_on,
	       COALESCE(u.name,''), v.created_at, v.published_at
	FROM theme_versions v LEFT JOIN users u ON u.id = v.created_by`

func (h *ThemeHandler) scanVersions(ctx context.Context, where string, args ...interface{}) []themeVersion {
	out := []themeVersion{}
	rows, err := h.DB.Query(ctx, themeSelect+" "+where, args...)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var v themeVersion
		if rows.Scan(&v.ID, &v.Status, &v.PresetKey, &v.Name, &v.Tokens, &v.Mode, &v.Validation, &v.BasedOn, &v.CreatedBy, &v.CreatedAt, &v.PublishedAt) == nil {
			out = append(out, v)
		}
	}
	return out
}

// PublishedTheme returns the live theme (falls back to the built-in Peach theme if the table is empty).
func (h *ThemeHandler) PublishedTheme(ctx context.Context) themeVersion {
	if vs := h.scanVersions(ctx, "WHERE v.status='published' LIMIT 1"); len(vs) > 0 {
		return vs[0]
	}
	return themeVersion{ID: 0, Status: "published", PresetKey: "peach", Name: "Peach + Putih", Tokens: peachTokens, Mode: "light"}
}

// Published serves GET /theme/published (public, cacheable).
func (h *ThemeHandler) Published(w http.ResponseWriter, r *http.Request) {
	t := h.PublishedTheme(r.Context())
	w.Header().Set("Cache-Control", "public, max-age=60")
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"id": t.ID, "name": t.Name, "mode": t.Mode, "tokens": t.Tokens, "css": ThemeCSS(t.Tokens, t.Mode),
	})
}

// PublishedCSS serves GET /theme/published.css (render-blocking <link> so the page never flashes).
func (h *ThemeHandler) PublishedCSS(w http.ResponseWriter, r *http.Request) {
	t := h.PublishedTheme(r.Context())
	w.Header().Set("Content-Type", "text/css; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=60")
	_, _ = w.Write([]byte(ThemeCSS(t.Tokens, t.Mode)))
}

// Preview serves GET /theme/preview/{token}: the tokens behind a time-boxed preview link (noindex).
func (h *ThemeHandler) Preview(w http.ResponseWriter, r *http.Request) {
	var tokens map[string]string
	var mode string
	err := h.DB.QueryRow(r.Context(), `SELECT tokens, mode FROM theme_preview_links WHERE token=$1 AND expires_at > now()`, chi.URLParam(r, "token")).Scan(&tokens, &mode)
	if err != nil {
		respondError(w, http.StatusNotFound, "preview link expired")
		return
	}
	w.Header().Set("X-Robots-Tag", "noindex")
	respondJSON(w, http.StatusOK, map[string]interface{}{"tokens": tokens, "mode": mode, "css": ThemeCSS(tokens, mode)})
}

type themeDraftRequest struct {
	Name      string            `json:"name"`
	PresetKey string            `json:"preset_key"`
	Tokens    map[string]string `json:"tokens"`
	Mode      string            `json:"mode"`
}

func normalizeTokens(in map[string]string) map[string]string {
	out := map[string]string{}
	for _, k := range themeKeys {
		v := strings.ToUpper(strings.TrimSpace(in[k]))
		if v == "" {
			v = peachTokens[k]
		}
		if !strings.HasPrefix(v, "#") {
			v = "#" + v
		}
		out[k] = v
	}
	return out
}

// GetDraft serves GET /admin/theme/draft: the current draft, or a fresh copy of the published theme.
func (h *ThemeHandler) GetDraft(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	draft := h.scanVersions(ctx, "WHERE v.status='draft' LIMIT 1")
	pub := h.PublishedTheme(ctx)
	var d themeVersion
	if len(draft) > 0 {
		d = draft[0]
	} else {
		d = themeVersion{Status: "draft", PresetKey: pub.PresetKey, Name: pub.Name, Tokens: pub.Tokens, Mode: pub.Mode}
		d.BasedOn = &pub.ID
	}
	d.Validation = ValidateTheme(d.Tokens)
	respondJSON(w, http.StatusOK, map[string]interface{}{"draft": d, "published": pub, "has_saved_draft": len(draft) > 0})
}

// PutDraft serves PUT /admin/theme/draft (auto-save): validates (never blocks saving a draft).
func (h *ThemeHandler) PutDraft(w http.ResponseWriter, r *http.Request) {
	var req themeDraftRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Mode != "soft" {
		req.Mode = "light"
	}
	if strings.TrimSpace(req.Name) == "" {
		req.Name = "Draft"
	}
	tokens := normalizeTokens(req.Tokens)
	val := ValidateTheme(tokens)
	claims := appmw.GetClaims(r)
	ctx := r.Context()
	pub := h.PublishedTheme(ctx)
	_, err := h.DB.Exec(ctx, `
		INSERT INTO theme_versions (status, preset_key, name, tokens, mode, validation, based_on, created_by)
		VALUES ('draft', NULLIF($1,''), $2, $3, $4, $5, NULLIF($6,0), $7)
		ON CONFLICT ((true)) WHERE status = 'draft' DO UPDATE SET
		  preset_key = EXCLUDED.preset_key, name = EXCLUDED.name, tokens = EXCLUDED.tokens, mode = EXCLUDED.mode,
		  validation = EXCLUDED.validation, created_by = EXCLUDED.created_by`,
		req.PresetKey, req.Name, tokens, req.Mode, val, pub.ID, claims.UserID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save draft")
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"validation": val})
}

// Validate serves POST /admin/theme/validate {tokens}: ratios + fix suggestions (no storage).
func (h *ThemeHandler) Validate(w http.ResponseWriter, r *http.Request) {
	var req themeDraftRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	respondJSON(w, http.StatusOK, ValidateTheme(normalizeTokens(req.Tokens)))
}

// PreviewLink serves POST /admin/theme/preview-link: a 24h, noindex test link for the saved draft.
func (h *ThemeHandler) PreviewLink(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	drafts := h.scanVersions(ctx, "WHERE v.status='draft' LIMIT 1")
	if len(drafts) == 0 {
		respondError(w, http.StatusBadRequest, "simpan draf dulu")
		return
	}
	buf := make([]byte, 16)
	_, _ = rand.Read(buf)
	token := hex.EncodeToString(buf)
	if _, err := h.DB.Exec(ctx, `INSERT INTO theme_preview_links (token, tokens, mode, expires_at) VALUES ($1,$2,$3, now() + interval '24 hours')`,
		token, drafts[0].Tokens, drafts[0].Mode); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create link")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]string{"token": token, "path": "/?theme_preview=" + token})
}

// Publish serves POST /admin/theme/publish: re-validates on the server and swaps the live version
// atomically. Any failure leaves the previous published version untouched.
func (h *ThemeHandler) Publish(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := appmw.GetClaims(r)
	drafts := h.scanVersions(ctx, "WHERE v.status='draft' LIMIT 1")
	if len(drafts) == 0 {
		respondError(w, http.StatusBadRequest, "tidak ada draf untuk dipublikasikan")
		return
	}
	d := drafts[0]
	val := ValidateTheme(d.Tokens)
	if !val.Passed {
		h.logPublish(ctx, d.ID, "publish", false, "validation failed", claims.UserID)
		respondJSON(w, http.StatusUnprocessableEntity, map[string]interface{}{"error": "kontras kurang, tidak bisa dipublikasikan", "validation": val})
		return
	}
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `UPDATE theme_versions SET status='archived' WHERE status='published'`); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to publish")
		return
	}
	if _, err := tx.Exec(ctx, `UPDATE theme_versions SET status='published', published_at=now(), validation=$2 WHERE id=$1`, d.ID, val); err != nil {
		h.logPublish(ctx, d.ID, "publish", false, err.Error(), claims.UserID)
		respondError(w, http.StatusInternalServerError, "failed to publish")
		return
	}
	if _, err := tx.Exec(ctx, `INSERT INTO theme_publish_log (version_id, action, ok, message, by_user) VALUES ($1,'publish',true,'',$2)`, d.ID, claims.UserID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to publish")
		return
	}
	if err := tx.Commit(ctx); err != nil {
		h.logPublish(ctx, d.ID, "publish", false, err.Error(), claims.UserID)
		respondError(w, http.StatusInternalServerError, "failed to publish")
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"version": d.ID, "status": "published"})
}

func (h *ThemeHandler) logPublish(ctx context.Context, id int, action string, ok bool, msg string, user int) {
	_, _ = h.DB.Exec(ctx, `INSERT INTO theme_publish_log (version_id, action, ok, message, by_user) VALUES ($1,$2,$3,$4,$5)`, id, action, ok, msg, user)
}

// Versions serves GET /admin/theme/versions.
func (h *ThemeHandler) Versions(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, h.scanVersions(r.Context(), "ORDER BY v.id DESC LIMIT 30"))
}

// Restore serves POST /admin/theme/versions/{id}/restore: copies an old version into the draft
// (it still has to pass the normal publish flow).
func (h *ThemeHandler) Restore(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid id")
		return
	}
	vs := h.scanVersions(r.Context(), "WHERE v.id=$1", id)
	if len(vs) == 0 {
		respondError(w, http.StatusNotFound, "version not found")
		return
	}
	v := vs[0]
	claims := appmw.GetClaims(r)
	val := ValidateTheme(v.Tokens)
	if _, err := h.DB.Exec(r.Context(), `
		INSERT INTO theme_versions (status, preset_key, name, tokens, mode, validation, based_on, created_by)
		VALUES ('draft', NULLIF($1,''), $2, $3, $4, $5, $6, $7)
		ON CONFLICT ((true)) WHERE status = 'draft' DO UPDATE SET
		  preset_key = EXCLUDED.preset_key, name = EXCLUDED.name, tokens = EXCLUDED.tokens, mode = EXCLUDED.mode,
		  validation = EXCLUDED.validation, based_on = EXCLUDED.based_on, created_by = EXCLUDED.created_by`,
		v.PresetKey, v.Name, v.Tokens, v.Mode, val, id, claims.UserID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to restore")
		return
	}
	h.logPublish(r.Context(), id, "restore", true, "", claims.UserID)
	respondJSON(w, http.StatusOK, map[string]string{"status": "draft"})
}

// Presets serves GET /admin/theme/presets.
func (h *ThemeHandler) Presets(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, themePresets)
}
