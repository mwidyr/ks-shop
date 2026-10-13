package handlers

import (
	"encoding/json"
	"fmt"
	"html"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

// SEO serves GET /public/store/seo?path=/p/12: the <head> fragment (title, description, canonical,
// robots, Open Graph, JSON-LD) for a storefront URL. The storefront's nginx pulls it into index.html
// with an SSI include, so crawlers and link previews see real tags without running JavaScript; the
// SPA then keeps them current on navigation (src/lib/seo.js). Pages that must not be indexed
// (search, cart, checkout, account, filtered lists) get noindex.
func (h *SiteHandler) SEO(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=60")

	q := r.URL.Query()
	path := q.Get("path")
	extraParams := false
	for k := range q {
		if k != "path" && k != "lang" {
			extraParams = true
		}
	}
	if i := strings.Index(path, "?"); i >= 0 {
		path, extraParams = path[:i], true
	}
	if path == "" {
		path = "/"
	}
	lang := siteLang(r)
	if q.Get("lang") == "" {
		al := strings.ToLower(r.Header.Get("Accept-Language"))
		switch {
		case strings.HasPrefix(al, "zh"):
			lang = "zh"
		case strings.HasPrefix(al, "en"):
			lang = "en"
		}
	}
	base := publicBaseURL(r)
	m := seoMeta{Title: "ralulu", Description: seoDefaultDesc[lang], Canonical: base + path, Index: !extraParams}
	ctx := r.Context()

	parts := strings.Split(strings.Trim(path, "/"), "/")
	switch {
	case path == "/":
		m.Title = ""
	case parts[0] == "p" && len(parts) == 2:
		id, _ := strconv.Atoi(parts[1])
		var name, desc, image, sku string
		var price float64
		var inStock bool
		err := h.DB.QueryRow(ctx, `
			SELECT p.name, COALESCE(p.description,''), COALESCE((SELECT url FROM product_images WHERE product_id=p.id ORDER BY sort_order LIMIT 1),''), COALESCE(p.sku,''),
			       COALESCE((SELECT MIN(v.price) FROM product_variants v WHERE v.product_id=p.id AND v.is_active),0),
			       EXISTS (SELECT 1 FROM product_variants pv JOIN stock_buckets sb ON sb.variant_id=pv.id WHERE pv.product_id=p.id AND pv.is_active AND `+sellableSQL+` > 0)
			FROM products p WHERE p.id=$1 AND p.is_active AND p.deleted_at IS NULL`, id).Scan(&name, &desc, &image, &sku, &price, &inStock)
		if err != nil {
			m.Index = false
			m.Title = "404"
			break
		}
		// localized name via the same SQL helper as the API
		_ = h.DB.QueryRow(ctx, `SELECT `+productNameSQLLang(lang, "p")+` FROM products p WHERE p.id=$1`, id).Scan(&name)
		m.Title = name
		m.Description = firstNonEmpty(truncateRunes(desc, 160), fmt.Sprintf("%s · NT$%.0f", name, price))
		m.Image = image
		avail := "https://schema.org/OutOfStock"
		if inStock {
			avail = "https://schema.org/InStock"
		}
		m.JSONLD = append(m.JSONLD, map[string]interface{}{
			"@context": "https://schema.org", "@type": "Product", "name": name, "sku": sku, "image": nonEmptyList(image), "description": m.Description,
			"offers": map[string]interface{}{"@type": "Offer", "priceCurrency": "TWD", "price": price, "availability": avail, "url": m.Canonical},
		}, breadcrumb(base, []crumb{{"Home", "/"}, {name, path}}))
	case parts[0] == "hosts" && len(parts) == 2:
		var name, bio, avatar, seoT, seoD string
		if err := h.DB.QueryRow(ctx, `SELECT name, COALESCE(bio,''), COALESCE(avatar_url,''), COALESCE(seo_title,''), COALESCE(seo_description,'') FROM hosts WHERE lower(slug)=$1 AND is_active AND is_public`, strings.ToLower(parts[1])).Scan(&name, &bio, &avatar, &seoT, &seoD); err != nil {
			m.Index = false
			m.Title = "404"
			break
		}
		m.Title = firstNonEmpty(seoT, name)
		m.Description = firstNonEmpty(seoD, truncateRunes(bio, 160), name)
		m.Image = avatar
		m.JSONLD = append(m.JSONLD, map[string]interface{}{"@context": "https://schema.org", "@type": "Person", "name": name, "description": bio, "image": avatar, "url": m.Canonical},
			breadcrumb(base, []crumb{{"Home", "/"}, {"Hosts", "/hosts"}, {name, path}}))
	case (parts[0] == "style" && len(parts) == 2) || (parts[0] == "hosts" && len(parts) == 4 && parts[2] == "journal"):
		slug := parts[len(parts)-1]
		var typ string
		var title, summary, seoT, seoD map[string]string
		var cover, canonical, author string
		var indexed bool
		var published *string
		if err := h.DB.QueryRow(ctx, `
			SELECT c.type, c.title, c.summary, c.seo_title, c.seo_description, COALESCE(c.cover_url,''), COALESCE(c.canonical_url,''), c.is_indexed,
			       COALESCE(NULLIF(c.author_name,''), ah.name, ''), to_char(c.published_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
			FROM content_pages c LEFT JOIN hosts ah ON ah.id = c.author_host_id
			WHERE c.slug=$1 AND c.is_published AND (c.published_at IS NULL OR c.published_at <= now())`, slug).
			Scan(&typ, &title, &summary, &seoT, &seoD, &cover, &canonical, &indexed, &author, &published); err != nil {
			m.Index = false
			m.Title = "404"
			break
		}
		m.Title = firstNonEmpty(pickLang(seoT, lang), pickLang(title, lang))
		m.Description = firstNonEmpty(pickLang(seoD, lang), pickLang(summary, lang))
		m.Image = cover
		if canonical != "" {
			m.Canonical = canonical
		}
		m.Index = m.Index && indexed
		art := map[string]interface{}{"@context": "https://schema.org", "@type": "Article", "headline": pickLang(title, lang), "description": pickLang(summary, lang), "image": nonEmptyList(cover), "author": map[string]interface{}{"@type": "Person", "name": author}}
		if published != nil {
			art["datePublished"] = *published
		}
		m.JSONLD = append(m.JSONLD, art, breadcrumb(base, []crumb{{"Home", "/"}, {"Style", "/style"}, {pickLang(title, lang), path}}))
	case parts[0] == "c" && len(parts) == 2:
		name, _ := url.PathUnescape(parts[1])
		var display string
		if err := h.DB.QueryRow(ctx, `SELECT `+categoryDisplaySQL(lang)+` FROM categories c WHERE c.name=$1`, name).Scan(&display); err != nil {
			m.Index = false
			m.Title = "404"
			break
		}
		m.Title = display
		m.Description = display + " · ralulu"
		ids := h.idList(ctx, `SELECT id FROM products WHERE category=$1 AND is_active AND deleted_at IS NULL ORDER BY id DESC LIMIT 10`, name)
		var items []map[string]interface{}
		for i, id := range ids {
			items = append(items, map[string]interface{}{"@type": "ListItem", "position": i + 1, "url": fmt.Sprintf("%s/p/%d", base, id)})
		}
		if len(items) > 0 {
			m.JSONLD = append(m.JSONLD, map[string]interface{}{"@context": "https://schema.org", "@type": "ItemList", "itemListElement": items})
		}
	case path == "/categories", path == "/hosts", path == "/style", path == "/live", path == "/service", path == "/products":
		m.Title = seoStatic[lang][strings.Trim(path, "/")]
	case parts[0] == "info":
		if len(parts) > 1 {
			m.Title = strings.ToUpper(parts[1][:1]) + parts[1][1:]
		}
	default:
		// search, cart, checkout, account pages, language chooser, unknown routes
		m.Index = false
		m.Title = ""
	}
	if path == "/products" && extraParams {
		m.Index = false
	}
	_, _ = w.Write([]byte(m.render(lang)))
}

type crumb struct{ Name, Path string }

func breadcrumb(base string, cs []crumb) map[string]interface{} {
	var items []map[string]interface{}
	for i, c := range cs {
		items = append(items, map[string]interface{}{"@type": "ListItem", "position": i + 1, "name": c.Name, "item": base + c.Path})
	}
	return map[string]interface{}{"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": items}
}

type seoMeta struct {
	Title, Description, Canonical, Image string
	Index                                bool
	JSONLD                               []map[string]interface{}
}

var seoDefaultDesc = map[string]string{
	"id": "ralulu - yang dipakai host, bisa dibeli di sini. Belanja outfit dari live, ambil di 7-ELEVEN / FamilyMart.",
	"en": "ralulu - worn by hosts on live, shop it here. Pick up at 7-ELEVEN / FamilyMart.",
	"zh": "ralulu - 主播直播穿搭，這裡就能買。可到 7-ELEVEN / 全家取貨。",
}

var seoStatic = map[string]map[string]string{
	"id": {"categories": "Semua kategori", "hosts": "Semua host", "style": "Inspirasi gaya", "live": "Ruang live", "service": "Pusat CS", "products": "Semua produk"},
	"en": {"categories": "All categories", "hosts": "All hosts", "style": "Style inspiration", "live": "Live room", "service": "CS center", "products": "All products"},
	"zh": {"categories": "所有分類", "hosts": "全部主播", "style": "穿搭靈感", "live": "直播間", "service": "客服中心", "products": "全部商品"},
}

func (m seoMeta) render(lang string) string {
	var b strings.Builder
	title := "ralulu"
	if m.Title != "" {
		title = m.Title + " | ralulu"
	}
	esc := html.EscapeString
	fmt.Fprintf(&b, "<title>%s</title>\n", esc(title))
	if m.Description != "" {
		fmt.Fprintf(&b, "<meta name=\"description\" content=\"%s\">\n", esc(m.Description))
	}
	if m.Index {
		fmt.Fprintf(&b, "<link rel=\"canonical\" href=\"%s\">\n", esc(m.Canonical))
	} else {
		b.WriteString("<meta name=\"robots\" content=\"noindex,nofollow\">\n")
	}
	fmt.Fprintf(&b, "<meta property=\"og:title\" content=\"%s\">\n<meta property=\"og:type\" content=\"website\">\n<meta property=\"og:url\" content=\"%s\">\n<meta property=\"og:locale\" content=\"%s\">\n", esc(title), esc(m.Canonical), map[string]string{"id": "id_ID", "en": "en_US", "zh": "zh_TW"}[lang])
	if m.Description != "" {
		fmt.Fprintf(&b, "<meta property=\"og:description\" content=\"%s\">\n", esc(m.Description))
	}
	if m.Image != "" {
		fmt.Fprintf(&b, "<meta property=\"og:image\" content=\"%s\">\n", esc(m.Image))
	}
	if m.Index {
		for _, ld := range m.JSONLD {
			raw, err := json.Marshal(ld)
			if err == nil {
				// "</" would end the script tag early
				fmt.Fprintf(&b, "<script type=\"application/ld+json\" data-ld=\"1\">%s</script>\n", strings.ReplaceAll(string(raw), "</", "<\\/"))
				break // the client keeps one JSON-LD block current; the first (primary entity) is enough here
			}
		}
	}
	return b.String()
}

func publicBaseURL(r *http.Request) string {
	scheme := "https"
	if p := r.Header.Get("X-Forwarded-Proto"); p != "" {
		scheme = p
	} else if r.TLS == nil && strings.HasPrefix(r.Host, "localhost") {
		scheme = "http"
	}
	host := r.Header.Get("X-Forwarded-Host")
	if host == "" {
		host = r.Host
	}
	return scheme + "://" + host
}

func firstNonEmpty(vs ...string) string {
	for _, v := range vs {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

func truncateRunes(s string, n int) string {
	r := []rune(strings.TrimSpace(s))
	if len(r) <= n {
		return string(r)
	}
	return string(r[:n-1]) + "…"
}

func nonEmptyList(s string) []string {
	if s == "" {
		return nil
	}
	return []string{s}
}

// productNameSQLLang / categoryDisplaySQL are productNameSQL / storeCategorySQL for an explicit language.
func productNameSQLLang(lang, alias string) string {
	if lang == "id" || lang == "" {
		return alias + ".name"
	}
	return "COALESCE(NULLIF(" + alias + ".names->>'" + lang + "',''), " + alias + ".name)"
}

func categoryDisplaySQL(lang string) string {
	switch lang {
	case "zh":
		return "COALESCE(NULLIF(c.name_zh,''), c.name)"
	case "id":
		return "COALESCE(NULLIF(c.name_id,''), c.name)"
	}
	return "c.name"
}
