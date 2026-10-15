package handlers

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

type siteContentCard struct {
	ID            int      `json:"id"`
	Type          string   `json:"type"`
	Slug          string   `json:"slug"`
	Lang          string   `json:"lang"`
	Path          string   `json:"path"`
	Title         string   `json:"title"`
	Summary       string   `json:"summary"`
	CategoryLabel string   `json:"category_label"`
	CoverURL      string   `json:"cover_url"`
	CoverAlt      string   `json:"cover_alt"`
	Author        string   `json:"author"`
	AuthorSlug    string   `json:"author_slug,omitempty"`
	ReadMinutes   *int     `json:"read_minutes"`
	PublishedAt   string   `json:"published_at"`
	Tags          []string `json:"tags"`
	Featured      bool     `json:"is_featured"`
}

// contentCards lists published pages matching the extra WHERE (written against alias c, args from $1).
func (h *SiteHandler) contentCards(ctx context.Context, lang, where string, args []interface{}, limit int) []siteContentCard {
	out := []siteContentCard{}
	sql := `
		SELECT c.id, c.type, c.slug, c.lang, c.title, c.summary, c.category_label, COALESCE(c.cover_url,''), c.cover_alt,
		       COALESCE(NULLIF(c.author_name,''), ah.name, ''), COALESCE(ah.slug,''), c.read_minutes, c.published_at, c.tags, c.is_featured
		FROM content_pages c LEFT JOIN hosts ah ON ah.id = c.author_host_id
		WHERE c.is_published AND (c.published_at IS NULL OR c.published_at <= now()) AND ` + where + `
		ORDER BY c.is_featured DESC, c.sort_order, c.published_at DESC NULLS LAST, c.id DESC LIMIT ` + strconv.Itoa(limit)
	rows, err := h.DB.Query(ctx, sql, args...)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var c siteContentCard
		var title, summary, label, alt map[string]string
		var published *time.Time
		if rows.Scan(&c.ID, &c.Type, &c.Slug, &c.Lang, &title, &summary, &label, &c.CoverURL, &alt, &c.Author, &c.AuthorSlug,
			&c.ReadMinutes, &published, &c.Tags, &c.Featured) != nil {
			continue
		}
		c.Title, c.Summary, c.CategoryLabel, c.CoverAlt = pickLang(title, c.Lang), pickLang(summary, c.Lang), pickLang(label, c.Lang), pickLang(alt, c.Lang)
		c.Path = contentPath(c.Lang, c.Type, c.Slug, c.AuthorSlug)
		if published != nil {
			c.PublishedAt = published.Format(time.RFC3339)
		}
		if c.Tags == nil {
			c.Tags = []string{}
		}
		out = append(out, c)
	}
	return out
}

// ContentList serves GET /public/store/content?type=topic|article&label=&limit= (Style journal).
func (h *SiteHandler) ContentList(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	lang := siteLang(r)
	where := `c.type <> 'host_article'`
	args := []interface{}{}
	if t := q.Get("type"); t == "topic" || t == "article" {
		args = append(args, t)
		where = `c.type = $1`
	}
	// lang_counts: published articles per language (the storefront defaults its language filter from it)
	langCounts := map[string]int{}
	if rows, err := h.DB.Query(r.Context(), `SELECT lang, COUNT(*) FROM content_pages c WHERE c.is_published AND (c.published_at IS NULL OR c.published_at <= now()) AND `+where+` GROUP BY lang`, args...); err == nil {
		for rows.Next() {
			var l string
			var n int
			if rows.Scan(&l, &n) == nil {
				langCounts[l] = n
			}
		}
		rows.Close()
	}
	if cl := strings.ToLower(strings.TrimSpace(q.Get("content_lang"))); validContentLang(cl) {
		args = append(args, cl)
		where += ` AND c.lang = $` + strconv.Itoa(len(args))
	}
	items := h.contentCards(r.Context(), lang, where, args, atoiDefault(q.Get("limit"), 24))
	// label chips (category_label values present) so the journal can offer filter chips
	labels := []string{}
	seen := map[string]bool{}
	for _, it := range items {
		if it.CategoryLabel != "" && !seen[it.CategoryLabel] {
			seen[it.CategoryLabel] = true
			labels = append(labels, it.CategoryLabel)
		}
	}
	if label := strings.TrimSpace(q.Get("label")); label != "" {
		filtered := items[:0]
		for _, it := range items {
			if it.CategoryLabel == label {
				filtered = append(filtered, it)
			}
		}
		items = filtered
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"items": items, "labels": labels, "lang_counts": langCounts})
}

// ContentGet serves GET /public/store/content/{slug}: one topic / article / host article.
func (h *SiteHandler) ContentGet(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	lang := siteLang(r)
	slug := chi.URLParam(r, "slug")
	cards := h.contentCards(ctx, lang, `c.slug = $1`, []interface{}{slug}, 1)
	if len(cards) == 0 {
		respondError(w, http.StatusNotFound, "content not found")
		return
	}
	card := cards[0]

	var body map[string][]map[string]interface{}
	var seoTitle, seoDesc map[string]string
	var canonical string
	var indexed bool
	var authorHost *int
	h.DB.QueryRow(ctx, `SELECT body, seo_title, seo_description, COALESCE(canonical_url,''), is_indexed, author_host_id FROM content_pages WHERE id=$1`, card.ID).
		Scan(&body, &seoTitle, &seoDesc, &canonical, &indexed, &authorHost)
	blocks := body[card.Lang]
	if len(blocks) == 0 {
		for _, l := range []string{"id", "en", "zh", "vi"} {
			if len(body[l]) > 0 {
				blocks = body[l]
				break
			}
		}
	}
	if blocks == nil {
		blocks = []map[string]interface{}{}
	}

	products := h.cards(ctx, r, h.idList(ctx, `SELECT product_id FROM content_page_products WHERE page_id=$1 ORDER BY sort_order, product_id`, card.ID))

	type cat struct {
		Name    string `json:"name"`
		Display string `json:"display"`
	}
	cats := []cat{}
	if rows, err := h.DB.Query(ctx, `
		SELECT c.name, `+storeCategorySQL(r, "c.name")+`
		FROM content_page_categories cc JOIN categories c ON c.id = cc.category_id WHERE cc.page_id=$1 ORDER BY c.sort_order, c.id`, card.ID); err == nil {
		for rows.Next() {
			var c cat
			if rows.Scan(&c.Name, &c.Display) == nil {
				cats = append(cats, c)
			}
		}
		rows.Close()
	}

	hostIDs := h.idList(ctx, `SELECT host_id FROM content_page_hosts WHERE page_id=$1`, card.ID)
	if authorHost != nil && card.Type == "host_article" {
		hostIDs = append(hostIDs, *authorHost)
	}
	hosts := []siteHostCard{}
	if len(hostIDs) > 0 {
		ids32 := make([]int32, len(hostIDs))
		for i, v := range hostIDs {
			ids32[i] = int32(v)
		}
		hosts = h.scanHostCards(ctx, hostCardSelect+` AND h.id = ANY($1)`+hostOrder, ids32)
	}

	related := h.contentCards(ctx, lang, `c.id <> $1 AND c.type = $2`, []interface{}{card.ID, card.Type}, 4)
	if card.Type == "host_article" && authorHost != nil {
		related = h.contentCards(ctx, lang, `c.id <> $1 AND c.type = 'host_article' AND c.author_host_id = $2`, []interface{}{card.ID, *authorHost}, 4)
	}

	var authorHeight *int
	if authorHost != nil {
		h.DB.QueryRow(ctx, `SELECT height_cm FROM hosts WHERE id=$1`, *authorHost).Scan(&authorHeight)
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"author_height_cm": authorHeight, "page": card, "blocks": blocks, "products": products, "categories": cats, "hosts": hosts, "related": related,
		"seo": map[string]interface{}{
			"title": pickLang(seoTitle, card.Lang), "description": pickLang(seoDesc, card.Lang), "canonical": canonical, "index": indexed,
		},
	})
}
