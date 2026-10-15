package handlers

import (
	"encoding/xml"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type sitemapURL struct {
	Loc     string `xml:"loc"`
	LastMod string `xml:"lastmod,omitempty"`
}

// Sitemap serves GET /public/store/sitemap.xml (the storefront nginx exposes it as /sitemap.xml):
// the home and list pages, products, categories, public hosts and every published, indexable
// article under its own-language URL (/{lang}/style/{slug}).
func (h *SiteHandler) Sitemap(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	base := publicBaseURL(r)
	urls := []sitemapURL{}
	add := func(path string, mod *time.Time) {
		u := sitemapURL{Loc: base + path}
		if mod != nil {
			u.LastMod = mod.UTC().Format("2006-01-02")
		}
		urls = append(urls, u)
	}
	for _, p := range []string{"/", "/categories", "/hosts", "/style", "/live", "/service"} {
		add(p, nil)
	}
	for _, id := range h.idList(ctx, `SELECT id FROM products WHERE is_active AND deleted_at IS NULL ORDER BY id DESC LIMIT 5000`) {
		add("/p/"+strconv.Itoa(id), nil)
	}
	if rows, err := h.DB.Query(ctx, `SELECT DISTINCT category FROM products WHERE is_active AND deleted_at IS NULL AND COALESCE(category,'') <> ''`); err == nil {
		for rows.Next() {
			var c string
			if rows.Scan(&c) == nil {
				add("/c/"+url.PathEscape(c), nil)
			}
		}
		rows.Close()
	}
	if rows, err := h.DB.Query(ctx, `SELECT slug FROM hosts WHERE is_active AND is_public AND slug IS NOT NULL AND slug <> ''`); err == nil {
		for rows.Next() {
			var s string
			if rows.Scan(&s) == nil {
				add("/hosts/"+s, nil)
			}
		}
		rows.Close()
	}
	if rows, err := h.DB.Query(ctx, `
		SELECT c.type, c.lang, c.slug, COALESCE(ah.slug,''), c.updated_at
		FROM content_pages c LEFT JOIN hosts ah ON ah.id = c.author_host_id
		WHERE c.is_published AND c.is_indexed AND (c.published_at IS NULL OR c.published_at <= now())
		ORDER BY c.published_at DESC NULLS LAST, c.id DESC LIMIT 5000`); err == nil {
		for rows.Next() {
			var typ, lang, slug, authorSlug string
			var upd time.Time
			if rows.Scan(&typ, &lang, &slug, &authorSlug, &upd) != nil {
				continue
			}
			if typ == "host_article" && authorSlug == "" {
				continue
			}
			add(contentPath(lang, typ, slug, authorSlug), &upd)
		}
		rows.Close()
	}

	var b strings.Builder
	b.WriteString(xml.Header)
	b.WriteString(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` + "\n")
	for _, u := range urls {
		b.WriteString("  <url><loc>")
		_ = xml.EscapeText(&b, []byte(u.Loc))
		b.WriteString("</loc>")
		if u.LastMod != "" {
			b.WriteString("<lastmod>" + u.LastMod + "</lastmod>")
		}
		b.WriteString("</url>\n")
	}
	b.WriteString("</urlset>\n")
	w.Header().Set("Content-Type", "application/xml; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=600")
	_, _ = w.Write([]byte(b.String()))
}
