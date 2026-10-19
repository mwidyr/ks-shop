package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	appmw "ordermgmt/internal/middleware"
)

// Admin helpers of the Style Content editor: slug check, tag suggestions, content types and templates.

// ContentSlugCheck serves GET /admin/content/slug-check?slug=&exclude_id= -> {available, valid}.
func (h *SiteAdminHandler) ContentSlugCheck(w http.ResponseWriter, r *http.Request) {
	slug := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("slug")))
	if !slugRe.MatchString(slug) || len(slug) > 120 {
		respondJSON(w, http.StatusOK, map[string]bool{"valid": false, "available": false})
		return
	}
	exclude, _ := strconv.Atoi(r.URL.Query().Get("exclude_id"))
	var taken bool
	if err := h.DB.QueryRow(r.Context(), `SELECT EXISTS (SELECT 1 FROM content_pages WHERE slug=$1 AND id<>$2)`, slug, exclude).Scan(&taken); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to check slug")
		return
	}
	respondJSON(w, http.StatusOK, map[string]bool{"valid": true, "available": !taken})
}

// ContentTags serves GET /admin/content/tags?q=: the tags already used by articles (most used first),
// for the tag input's suggestions. Tags themselves stay free text.
func (h *SiteAdminHandler) ContentTags(w http.ResponseWriter, r *http.Request) {
	like := likePattern(r.URL.Query().Get("q"))
	if like == "" {
		like = "%"
	}
	rows, err := h.DB.Query(r.Context(), `
		SELECT tag FROM (SELECT unnest(tags) AS tag FROM content_pages) t
		WHERE tag <> '' AND tag ILIKE $1 GROUP BY tag ORDER BY COUNT(*) DESC, tag LIMIT 20`, like)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load tags")
		return
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var t string
		if rows.Scan(&t) == nil {
			out = append(out, t)
		}
	}
	respondJSON(w, http.StatusOK, out)
}

// ---------------------------------------------------------------- content types

type contentTypeDTO struct {
	ID        int               `json:"id"`
	Slug      string            `json:"slug"`
	Names     map[string]string `json:"names"`
	IsSystem  bool              `json:"is_system"`
	SortOrder int               `json:"sort_order"`
	UsedCount int               `json:"used_count"`
}

// cleanTypeNames keeps the known languages, trimmed and capped; at least one name is required.
func cleanTypeNames(in map[string]string) map[string]string {
	out := map[string]string{}
	for _, l := range contentLangs {
		if v := strings.TrimSpace(in[l]); v != "" {
			if r := []rune(v); len(r) > 60 {
				v = string(r[:60])
			}
			out[l] = v
		}
	}
	return out
}

// typeSlugFromName makes a URL-safe slug for a new type from its first name ("Outfit Guide" -> "outfit-guide").
func typeSlugFromName(name string) string {
	var b strings.Builder
	dash := false
	for _, r := range strings.ToLower(strings.TrimSpace(name)) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			dash = false
		default:
			if b.Len() > 0 && !dash {
				b.WriteByte('-')
				dash = true
			}
		}
	}
	return strings.Trim(b.String(), "-")
}

// ContentTypes serves GET /admin/content-types.
func (h *SiteAdminHandler) ContentTypes(w http.ResponseWriter, r *http.Request) {
	rows, err := h.DB.Query(r.Context(), `
		SELECT t.id, t.slug, t.names, t.is_system, t.sort_order, (SELECT COUNT(*) FROM content_pages c WHERE c.type = t.slug)
		FROM content_types t ORDER BY t.sort_order, t.id`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load types")
		return
	}
	defer rows.Close()
	out := []contentTypeDTO{}
	for rows.Next() {
		var t contentTypeDTO
		if rows.Scan(&t.ID, &t.Slug, &t.Names, &t.IsSystem, &t.SortOrder, &t.UsedCount) == nil {
			out = append(out, t)
		}
	}
	respondJSON(w, http.StatusOK, out)
}

// ContentTypeCreate serves POST /admin/content-types {names}. The slug is made from the first name.
func (h *SiteAdminHandler) ContentTypeCreate(w http.ResponseWriter, r *http.Request) {
	var req contentTypeDTO
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	names := cleanTypeNames(req.Names)
	if len(names) == 0 {
		respondError(w, http.StatusBadRequest, "nama tipe wajib diisi")
		return
	}
	slug := ""
	for _, l := range contentLangs { // first name that gives a usable slug (a Chinese-only name falls back to "type-N")
		if slug = typeSlugFromName(names[l]); slug != "" {
			break
		}
	}
	if slug == "" {
		slug = "type"
	}
	if len(slug) > 30 {
		slug = strings.Trim(slug[:30], "-")
	}
	var id int
	for n := 0; n < 20; n++ {
		cand := slug
		if n > 0 {
			cand = slug + "-" + strconv.Itoa(n+1)
		}
		err := h.DB.QueryRow(r.Context(), `
			INSERT INTO content_types (slug, names, sort_order) VALUES ($1,$2,(SELECT COALESCE(MAX(sort_order),0)+1 FROM content_types))
			ON CONFLICT (slug) DO NOTHING RETURNING id`, cand, names).Scan(&id)
		if err == nil {
			respondJSON(w, http.StatusOK, map[string]interface{}{"id": id, "slug": cand})
			return
		}
	}
	respondError(w, http.StatusConflict, "tipe sudah ada")
}

// ContentTypeUpdate serves PUT /admin/content-types/{id}: renames a type (its slug, and so every article's type, never changes).
func (h *SiteAdminHandler) ContentTypeUpdate(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req contentTypeDTO
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	names := cleanTypeNames(req.Names)
	if len(names) == 0 {
		respondError(w, http.StatusBadRequest, "nama tipe wajib diisi")
		return
	}
	res, err := h.DB.Exec(r.Context(), `UPDATE content_types SET names=$2 WHERE id=$1`, id, names)
	if err != nil || res.RowsAffected() == 0 {
		respondError(w, http.StatusNotFound, "tipe tidak ditemukan")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ContentTypeDelete serves DELETE /admin/content-types/{id}: system types and types that articles use cannot be deleted.
func (h *SiteAdminHandler) ContentTypeDelete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var slug string
	var system bool
	var used int
	if err := h.DB.QueryRow(r.Context(), `SELECT slug, is_system, (SELECT COUNT(*) FROM content_pages c WHERE c.type = t.slug) FROM content_types t WHERE id=$1`, id).Scan(&slug, &system, &used); err != nil {
		respondError(w, http.StatusNotFound, "tipe tidak ditemukan")
		return
	}
	if system {
		respondError(w, http.StatusConflict, "tipe bawaan tidak bisa dihapus")
		return
	}
	if used > 0 {
		respondError(w, http.StatusConflict, "tipe dipakai "+strconv.Itoa(used)+" artikel")
		return
	}
	if _, err := h.DB.Exec(r.Context(), `DELETE FROM content_types WHERE id=$1`, id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to delete")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ---------------------------------------------------------------- templates

type contentTemplateDTO struct {
	ID         int             `json:"id"`
	Name       string          `json:"name"`
	Blocks     json.RawMessage `json:"blocks,omitempty"`
	BlockCount int             `json:"block_count"`
	UpdatedAt  string          `json:"updated_at"`
}

// ContentTemplates serves GET /admin/content-templates (without the blocks); one template: GET .../{id}.
func (h *SiteAdminHandler) ContentTemplates(w http.ResponseWriter, r *http.Request) {
	rows, err := h.DB.Query(r.Context(), `SELECT id, name, jsonb_array_length(blocks), to_char(updated_at,'YYYY-MM-DD"T"HH24:MI:SSOF') FROM content_templates ORDER BY name, id`)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load templates")
		return
	}
	defer rows.Close()
	out := []contentTemplateDTO{}
	for rows.Next() {
		var t contentTemplateDTO
		if rows.Scan(&t.ID, &t.Name, &t.BlockCount, &t.UpdatedAt) == nil {
			out = append(out, t)
		}
	}
	respondJSON(w, http.StatusOK, out)
}

// ContentTemplateGet serves GET /admin/content-templates/{id}.
func (h *SiteAdminHandler) ContentTemplateGet(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var t contentTemplateDTO
	if err := h.DB.QueryRow(r.Context(), `SELECT id, name, blocks, jsonb_array_length(blocks), to_char(updated_at,'YYYY-MM-DD"T"HH24:MI:SSOF') FROM content_templates WHERE id=$1`, id).
		Scan(&t.ID, &t.Name, &t.Blocks, &t.BlockCount, &t.UpdatedAt); err != nil {
		respondError(w, http.StatusNotFound, "template tidak ditemukan")
		return
	}
	respondJSON(w, http.StatusOK, t)
}

func readTemplate(r *http.Request) (string, json.RawMessage, string) {
	var req contentTemplateDTO
	if err := decodeJSON(r, &req); err != nil {
		return "", nil, "invalid request body"
	}
	name := strings.TrimSpace(req.Name)
	if name == "" || len([]rune(name)) > 120 {
		return "", nil, "nama template wajib diisi (maks 120 karakter)"
	}
	blocks, err := cleanBodyBlocks(req.Blocks) // same checks and sanitising as an article body
	if err != nil {
		return "", nil, err.Error()
	}
	return name, blocks, ""
}

// ContentTemplateCreate serves POST /admin/content-templates {name, blocks}.
func (h *SiteAdminHandler) ContentTemplateCreate(w http.ResponseWriter, r *http.Request) {
	name, blocks, msg := readTemplate(r)
	if msg != "" {
		respondError(w, http.StatusBadRequest, msg)
		return
	}
	var by *int
	if c := appmw.GetClaims(r); c != nil {
		by = &c.UserID
	}
	var id int
	if err := h.DB.QueryRow(r.Context(), `INSERT INTO content_templates (name, blocks, created_by) VALUES ($1,$2,$3) RETURNING id`, name, blocks, by).Scan(&id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save template")
		return
	}
	respondJSON(w, http.StatusOK, map[string]int{"id": id})
}

// ContentTemplateUpdate serves PUT /admin/content-templates/{id}. Articles made from the template are never touched.
func (h *SiteAdminHandler) ContentTemplateUpdate(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid id")
		return
	}
	name, blocks, msg := readTemplate(r)
	if msg != "" {
		respondError(w, http.StatusBadRequest, msg)
		return
	}
	res, err := h.DB.Exec(r.Context(), `UPDATE content_templates SET name=$2, blocks=$3, updated_at=now() WHERE id=$1`, id, name, blocks)
	if err != nil || res.RowsAffected() == 0 {
		respondError(w, http.StatusNotFound, "template tidak ditemukan")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ContentTemplateDelete serves DELETE /admin/content-templates/{id}.
func (h *SiteAdminHandler) ContentTemplateDelete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid id")
		return
	}
	if _, err := h.DB.Exec(r.Context(), `DELETE FROM content_templates WHERE id=$1`, id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to delete")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ContentDraftDiscard serves DELETE /admin/content/{id}/draft: drops the unpublished draft of a published article.
func (h *SiteAdminHandler) ContentDraftDiscard(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid id")
		return
	}
	if _, err := h.DB.Exec(r.Context(), `UPDATE content_pages SET draft=NULL, draft_saved_at=NULL WHERE id=$1`, id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to discard draft")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
