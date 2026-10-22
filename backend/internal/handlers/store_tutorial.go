package handlers

import (
	"net/http"
	"regexp"
	"strings"
)

// Store-number tutorial (the popup in checkout that shows where the store number is on a convenience
// store receipt): the instructions and the example picture are edited in Ralulu Hub so a change of
// receipt format needs no developer. Empty values make the website fall back to its built-in tutorial.
const (
	tutorialImageKey = "store_tutorial_image"
	tutorialMaxHTML  = 6000
	defaultLineID    = "@ohlalashop888"
)

var (
	tutorialLangs = []string{"id", "en", "zh"}
	lineIDPattern = regexp.MustCompile(`^@[A-Za-z0-9._-]{2,40}$`)
)

func tutorialKey(lang string) string { return "store_tutorial_" + lang }

// normalizeLineID returns the LINE Official Account ID with a leading "@" ("" clears it).
func normalizeLineID(v string) (string, bool) {
	v = strings.ReplaceAll(strings.TrimSpace(v), " ", "")
	if v == "" {
		return "", true
	}
	if !strings.HasPrefix(v, "@") {
		v = "@" + v
	}
	return v, lineIDPattern.MatchString(v)
}

type tutorialPayload struct {
	Image string            `json:"image_url"`
	HTML  map[string]string `json:"html"`
}

func (h *SiteHandler) loadTutorial(r *http.Request) tutorialPayload {
	ctx := r.Context()
	out := tutorialPayload{Image: h.setting(ctx, tutorialImageKey, ""), HTML: map[string]string{}}
	for _, l := range tutorialLangs {
		out.HTML[l] = h.setting(ctx, tutorialKey(l), "")
	}
	return out
}

// GetTutorial serves GET /admin/store-tutorial.
func (h *SiteAdminHandler) GetTutorial(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, (&SiteHandler{DB: h.DB}).loadTutorial(r))
}

// SaveTutorial serves PUT /admin/store-tutorial. The text is sanitised like article text (bold,
// italic, underline, links, lists); the image must be an uploaded file or an http(s) URL.
func (h *SiteAdminHandler) SaveTutorial(w http.ResponseWriter, r *http.Request) {
	var req tutorialPayload
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Image = strings.TrimSpace(req.Image)
	if !validLogoURL(req.Image) {
		respondError(w, http.StatusBadRequest, "gambar tidak valid")
		return
	}
	clean := map[string]string{}
	for _, l := range tutorialLangs {
		v := sanitizeRichHTML(req.HTML[l])
		if len(v) > tutorialMaxHTML {
			respondError(w, http.StatusBadRequest, "teks tutorial terlalu panjang")
			return
		}
		// an editor with no text still produces "<p></p>"
		if strings.TrimSpace(htmlTagRe.ReplaceAllString(v, "")) == "" {
			v = ""
		}
		clean[l] = v
	}
	save := func(k, v string) bool {
		_, err := h.DB.Exec(r.Context(), `INSERT INTO store_settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, k, v)
		return err == nil
	}
	ok := save(tutorialImageKey, req.Image)
	for _, l := range tutorialLangs {
		ok = save(tutorialKey(l), clean[l]) && ok
	}
	if !ok {
		respondError(w, http.StatusInternalServerError, "failed to save")
		return
	}
	h.GetTutorial(w, r)
}
