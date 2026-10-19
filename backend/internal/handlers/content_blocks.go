package handlers

import (
	"encoding/json"
	"fmt"
	"html"
	"regexp"
	"strings"
)

// Article languages. The storefront UI only speaks id / en / zh, but staff may also write in vi.
var contentLangs = []string{"id", "en", "zh", "vi"}

func validContentLang(l string) bool {
	for _, s := range contentLangs {
		if s == l {
			return true
		}
	}
	return false
}

// contentPath is the public URL of an article: /{lang}/style/{slug}, or the host journal variant.
func contentPath(lang, typ, slug, authorSlug string) string {
	if typ == "host_article" && authorSlug != "" {
		return "/" + lang + "/hosts/" + authorSlug + "/journal/" + slug
	}
	return "/" + lang + "/style/" + slug
}

var allowedBlockTypes = map[string]bool{
	"h2": true, "h3": true, "p": true, "list": true, "olist": true, "image": true, "product": true, "products": true, "tags": true,
}

var (
	htmlTagRe  = regexp.MustCompile(`(?s)<(/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>`)
	hrefAttrRe = regexp.MustCompile(`(?i)\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))`)
	dropWhole  = regexp.MustCompile(`(?is)<(script|style|iframe|object|embed)\b.*?</(script|style|iframe|object|embed)\s*>`)
)

func safeHref(raw string) string {
	u := strings.TrimSpace(html.UnescapeString(raw))
	l := strings.ToLower(u)
	switch {
	case strings.HasPrefix(l, "http://"), strings.HasPrefix(l, "https://"), strings.HasPrefix(l, "mailto:"), strings.HasPrefix(l, "tel:"):
		return u
	case strings.HasPrefix(u, "/") && !strings.HasPrefix(u, "//"):
		return u
	}
	return ""
}

// sanitizeInlineHTML keeps only <strong>, <em>, <u>, <br> and <a href> (http/https/mailto/tel/relative); every
// other tag is dropped (its text stays, script/style content goes) and text is re-escaped.
func sanitizeInlineHTML(in string) string { return sanitizeHTML(in, false) }

// sanitizeRichHTML is sanitizeInlineHTML plus the block tags of a Text block: <p>, <ul>, <ol>, <li>.
func sanitizeRichHTML(in string) string { return sanitizeHTML(in, true) }

func sanitizeHTML(in string, blocks bool) string {
	in = dropWhole.ReplaceAllString(in, "")
	var b strings.Builder
	last := 0
	emit := func(text string) {
		if text != "" {
			b.WriteString(html.EscapeString(html.UnescapeString(text)))
		}
	}
	openLinks := 0
	for _, m := range htmlTagRe.FindAllStringSubmatchIndex(in, -1) {
		emit(in[last:m[0]])
		last = m[1]
		closing := in[m[2]:m[3]] == "/"
		tag := strings.ToLower(in[m[4]:m[5]])
		attrs := in[m[6]:m[7]]
		switch tag {
		case "strong", "b":
			if closing {
				b.WriteString("</strong>")
			} else {
				b.WriteString("<strong>")
			}
		case "em", "i":
			if closing {
				b.WriteString("</em>")
			} else {
				b.WriteString("<em>")
			}
		case "u":
			if closing {
				b.WriteString("</u>")
			} else {
				b.WriteString("<u>")
			}
		case "br":
			if !closing {
				b.WriteString("<br>")
			}
		case "p", "ul", "ol", "li":
			if blocks {
				if closing {
					b.WriteString("</" + tag + ">")
				} else {
					b.WriteString("<" + tag + ">")
				}
			}
		case "a":
			if closing {
				if openLinks > 0 {
					openLinks--
					b.WriteString("</a>")
				}
				continue
			}
			am := hrefAttrRe.FindStringSubmatch(attrs)
			href := ""
			if am != nil {
				href = safeHref(firstNonEmpty(am[2], am[3], am[4]))
			}
			if href != "" {
				openLinks++
				fmt.Fprintf(&b, `<a href="%s" rel="noopener">`, html.EscapeString(href))
			}
		}
	}
	emit(in[last:])
	for ; openLinks > 0; openLinks-- {
		b.WriteString("</a>")
	}
	return b.String()
}

// cleanBodyBlocks validates one language's block array: known block types only, inline html sanitised.
func cleanBodyBlocks(raw json.RawMessage) (json.RawMessage, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return json.RawMessage("[]"), nil
	}
	var blocks []map[string]interface{}
	if err := json.Unmarshal(raw, &blocks); err != nil {
		return nil, fmt.Errorf("isi artikel tidak valid")
	}
	for _, b := range blocks {
		typ, _ := b["type"].(string)
		if typ == "" {
			typ = "p"
			b["type"] = typ
		}
		if !allowedBlockTypes[typ] {
			return nil, fmt.Errorf("tipe blok tidak dikenal: %s", typ)
		}
		if s, ok := b["html"].(string); ok {
			if typ == "p" { // a Text block may hold paragraphs and lists; headings only inline formatting
				b["html"] = sanitizeRichHTML(s)
			} else {
				b["html"] = sanitizeInlineHTML(s)
			}
		}
		if items, ok := b["items_html"].([]interface{}); ok {
			for i, it := range items {
				if s, ok := it.(string); ok {
					items[i] = sanitizeInlineHTML(s)
				}
			}
		}
	}
	out, err := json.Marshal(blocks)
	return out, err
}

// onlyKey keeps just the given language's entry of a per-language text map.
func onlyKey(m map[string]string, lang string) map[string]string {
	out := map[string]string{}
	if v := strings.TrimSpace(m[lang]); v != "" {
		out[lang] = v
	}
	return out
}
