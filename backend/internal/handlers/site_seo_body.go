package handlers

import (
	"html"
	"net/http"
	"strings"
)

// articleSlugFromPath finds the article slug in a storefront path (already split on "/"):
// /{lang}/style/{slug}, /{lang}/hosts/{host}/journal/{slug} and the old unprefixed forms.
func articleSlugFromPath(parts []string) string {
	switch {
	case len(parts) == 3 && validContentLang(parts[0]) && parts[1] == "style":
		return parts[2]
	case len(parts) == 5 && validContentLang(parts[0]) && parts[1] == "hosts" && parts[3] == "journal":
		return parts[4]
	case len(parts) == 2 && parts[0] == "style":
		return parts[1]
	case len(parts) == 4 && parts[0] == "hosts" && parts[2] == "journal":
		return parts[3]
	}
	return ""
}

// articleCrawlHTML is the article as plain semantic html (h1, intro, h2/h3, paragraphs, lists, image alt) for
// crawlers that do not run JavaScript. The storefront is a single-page app, so nginx pulls this into the page
// root (SSI); React replaces it as soon as the page loads. All text is escaped; the stored rich html was
// sanitised on save and is passed through sanitizeRichHTML again.
func articleCrawlHTML(title, introHTML, introText string, blocks []map[string]interface{}) string {
	var b strings.Builder
	esc := html.EscapeString
	str := func(m map[string]interface{}, k string) string { v, _ := m[k].(string); return v }
	b.WriteString("<article><h1>" + esc(title) + "</h1>")
	switch {
	case strings.TrimSpace(introHTML) != "":
		b.WriteString("<div>" + sanitizeRichHTML(introHTML) + "</div>")
	case strings.TrimSpace(introText) != "":
		b.WriteString("<p>" + esc(introText) + "</p>")
	}
	for _, bl := range blocks {
		switch str(bl, "type") {
		case "h2", "h3":
			tag := str(bl, "type")
			inner := esc(str(bl, "text"))
			if h := str(bl, "html"); h != "" {
				inner = sanitizeInlineHTML(h)
			}
			b.WriteString("<" + tag + ">" + inner + "</" + tag + ">")
		case "p", "":
			if h := str(bl, "html"); h != "" {
				b.WriteString("<div>" + sanitizeRichHTML(h) + "</div>")
			} else if t := str(bl, "text"); strings.TrimSpace(t) != "" {
				b.WriteString("<p>" + esc(t) + "</p>")
			}
		case "list", "olist":
			tag := "ul"
			if str(bl, "type") == "olist" {
				tag = "ol"
			}
			b.WriteString("<" + tag + ">")
			if items, ok := bl["items"].([]interface{}); ok {
				for _, it := range items {
					t, _ := it.(string)
					b.WriteString("<li>" + esc(t) + "</li>")
				}
			}
			b.WriteString("</" + tag + ">")
		case "image":
			if alt := str(bl, "alt"); alt != "" {
				b.WriteString("<p>" + esc(alt) + "</p>")
			}
		}
	}
	b.WriteString("</article>")
	out := b.String()
	if len(out) > 200000 { // never a huge fragment in the page
		out = out[:200000]
	}
	return out
}

// SEOBody serves GET /public/store/seo-body?path=: the crawlable article body (see articleCrawlHTML), empty for any
// other path or an article that is not public.
func (h *SiteHandler) SEOBody(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=60")
	// These fragments are pulled into index.html by nginx SSI, which cannot decompress a subrequest's answer: an
	// explicit Content-Encoding makes the compression middleware leave the body alone (gzip bytes would show up as junk).
	w.Header().Set("Content-Encoding", "identity")
	path := r.URL.Query().Get("path")
	if i := strings.Index(path, "?"); i >= 0 {
		path = path[:i]
	}
	slug := articleSlugFromPath(strings.Split(strings.Trim(path, "/"), "/"))
	if slug == "" {
		return
	}
	var lang string
	var title, summary, introHTML map[string]string
	var body map[string][]map[string]interface{}
	if err := h.DB.QueryRow(r.Context(), `
		SELECT lang, title, summary, intro_html, body FROM content_pages
		WHERE slug=$1 AND is_published AND is_indexed AND (published_at IS NULL OR published_at <= now())`, slug).
		Scan(&lang, &title, &summary, &introHTML, &body); err != nil {
		return
	}
	_, _ = w.Write([]byte(articleCrawlHTML(pickLang(title, lang), pickLang(introHTML, lang), pickLang(summary, lang), body[lang])))
}
