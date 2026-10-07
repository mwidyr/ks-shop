package handlers

import (
	"encoding/json"
	"net/http"
	"regexp"
	"sort"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// langCodeRe is deliberately strict: a validated code is the ONLY thing ever interpolated into
// SQL (see productNameSQL), so it must not be able to contain a quote or any other metacharacter.
var langCodeRe = regexp.MustCompile(`^[a-z]{2,3}(-[a-z0-9]{2,8})?$`)

// requestLang returns the UI language the client asked for via the X-Lang header, or "" (use the
// canonical Chinese name) when absent, invalid or "zh".
func requestLang(r *http.Request) string {
	l := strings.ToLower(strings.TrimSpace(r.Header.Get("X-Lang")))
	if l == "zh" || !langCodeRe.MatchString(l) {
		return ""
	}
	return l
}

// productNameSQL is the SQL expression for a product's display name in the request's language,
// falling back to the canonical products.name when that language has no translation. alias is
// the products table alias in the caller's query.
func productNameSQL(r *http.Request, alias string) string {
	l := requestLang(r)
	if l == "" {
		return alias + ".name"
	}
	return "COALESCE(NULLIF(" + alias + ".names->>'" + l + "',''), " + alias + ".name)"
}

// namesSearchText joins every non-empty name value into the searchable names_search column.
func namesSearchText(names map[string]string) string {
	keys := make([]string, 0, len(names))
	for k := range names {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	parts := []string{}
	for _, k := range keys {
		if v := strings.TrimSpace(names[k]); v != "" {
			parts = append(parts, v)
		}
	}
	return strings.Join(parts, " ")
}

// parseNames decodes the products.names JSONB column; always returns a non-nil map.
func parseNames(raw []byte) map[string]string {
	out := map[string]string{}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &out)
	}
	return out
}

// encodeNames sanitizes a client-supplied names map (valid non-zh language codes, trimmed,
// non-empty values only) and returns the JSON for products.names plus the names_search text.
func encodeNames(in map[string]string) (string, string) {
	clean := map[string]string{}
	for code, v := range in {
		code = strings.ToLower(strings.TrimSpace(code))
		v = strings.TrimSpace(v)
		if code != "zh" && langCodeRe.MatchString(code) && v != "" {
			clean[code] = v
		}
	}
	b, _ := json.Marshal(clean)
	return string(b), namesSearchText(clean)
}

type LanguageHandler struct {
	DB *pgxpool.Pool
}

type language struct {
	Code      string `json:"code"`
	Label     string `json:"label"`
	IsActive  bool   `json:"is_active"`
	SortOrder int    `json:"sort_order"`
}

// List returns languages (active only unless ?include_inactive=true).
func (h *LanguageHandler) List(w http.ResponseWriter, r *http.Request) {
	q := `SELECT code, label, is_active, sort_order FROM languages`
	if r.URL.Query().Get("include_inactive") != "true" {
		q += ` WHERE is_active`
	}
	rows, err := h.DB.Query(r.Context(), q+` ORDER BY sort_order, code`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch languages")
		return
	}
	defer rows.Close()
	out := []language{}
	for rows.Next() {
		var l language
		if rows.Scan(&l.Code, &l.Label, &l.IsActive, &l.SortOrder) == nil {
			out = append(out, l)
		}
	}
	respondJSON(w, http.StatusOK, out)
}

func (h *LanguageHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req language
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Code = strings.ToLower(strings.TrimSpace(req.Code))
	req.Label = strings.TrimSpace(req.Label)
	if !langCodeRe.MatchString(req.Code) || req.Label == "" {
		respondError(w, http.StatusBadRequest, "code (e.g. vi, fil) and label are required")
		return
	}
	_, err := h.DB.Exec(r.Context(), `
		INSERT INTO languages (code, label, sort_order)
		VALUES ($1, $2, COALESCE((SELECT MAX(sort_order)+1 FROM languages), 0))`, req.Code, req.Label)
	if err != nil {
		respondError(w, http.StatusConflict, "language code already exists")
		return
	}
	respondJSON(w, http.StatusCreated, map[string]string{"code": req.Code})
}

// Update renames or (de)activates a language. Chinese is the canonical name language and can't
// be deactivated.
func (h *LanguageHandler) Update(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")
	var req struct {
		Label    *string `json:"label"`
		IsActive *bool   `json:"is_active"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if code == "zh" && req.IsActive != nil && !*req.IsActive {
		respondError(w, http.StatusBadRequest, "Chinese is the canonical language and can't be deactivated")
		return
	}
	ct, err := h.DB.Exec(r.Context(), `
		UPDATE languages SET label = COALESCE(NULLIF($2,''), label), is_active = COALESCE($3, is_active)
		WHERE code=$1`, code, derefStr(req.Label), req.IsActive)
	if err != nil || ct.RowsAffected() == 0 {
		respondError(w, http.StatusNotFound, "language not found")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"code": code})
}

func derefStr(s *string) string {
	if s == nil {
		return ""
	}
	return strings.TrimSpace(*s)
}
