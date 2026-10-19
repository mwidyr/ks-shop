package handlers

import (
	"strings"
	"testing"
	"time"
)

func TestContentDateRange(t *testing.T) {
	now := time.Date(2026, 10, 19, 15, 0, 0, 0, businessTZ)
	if lo, hi := contentDateRange("all", "", "", now); lo != nil || hi != nil {
		t.Errorf("all must not filter")
	}
	lo, hi := contentDateRange("last_month", "", "", now)
	if lo == nil || hi == nil || lo.Format("2006-01-02") != "2026-09-01" || hi.Format("2006-01-02") != "2026-10-01" {
		t.Errorf("last_month = %v %v", lo, hi)
	}
	// January looks back into December of the previous year
	lo, hi = contentDateRange("last_month", "", "", time.Date(2026, 1, 5, 10, 0, 0, 0, businessTZ))
	if lo.Format("2006-01-02") != "2025-12-01" || hi.Format("2006-01-02") != "2026-01-01" {
		t.Errorf("january = %v %v", lo, hi)
	}
	lo, hi = contentDateRange("7d", "", "", now)
	if lo.Format("2006-01-02") != "2026-10-12" || !hi.After(now) {
		t.Errorf("7d = %v %v", lo, hi)
	}
	lo, hi = contentDateRange("custom", "2026-09-10", "2026-09-12", now)
	if lo.Format("2006-01-02") != "2026-09-10" || hi.Format("2006-01-02") != "2026-09-13" {
		t.Errorf("custom = %v %v (to is inclusive)", lo, hi)
	}
	if lo, hi = contentDateRange("custom", "", "2026-09-12", now); lo != nil || hi == nil {
		t.Errorf("open-ended custom = %v %v", lo, hi)
	}
}

func TestTypeSlugFromName(t *testing.T) {
	for in, want := range map[string]string{"Outfit Guide": "outfit-guide", "  Panduan  Outfit! ": "panduan-outfit", "主題": "", "Q&A 2026": "q-a-2026"} {
		if got := typeSlugFromName(in); got != want {
			t.Errorf("typeSlugFromName(%q) = %q, want %q", in, got, want)
		}
	}
	n := cleanTypeNames(map[string]string{"en": " A ", "xx": "ignored", "id": ""})
	if len(n) != 1 || n["en"] != "A" {
		t.Errorf("cleanTypeNames = %v", n)
	}
}

func TestMetaDescriptionAndCrawlHTML(t *testing.T) {
	long := "Temukan inspirasi outfit simpel dan nyaman untuk aktivitas sehari hari. " + strings.Repeat("kata ", 40)
	d := metaDescription(long, 150)
	if r := []rune(d); len(r) > 151 || !strings.HasSuffix(d, "…") || strings.Contains(d, "kata…kata") {
		t.Errorf("description = %q (%d)", d, len([]rune(d)))
	}
	if metaDescription("  short   text ", 150) != "short text" {
		t.Errorf("short text must stay as is")
	}
	if cn := metaDescription(strings.Repeat("穿", 200), 150); len([]rune(cn)) != 151 {
		t.Errorf("cjk cut = %d", len([]rune(cn)))
	}
	if got := articleMetaDescription("", []map[string]interface{}{{"type": "h2", "text": "x"}, {"type": "p", "text": "First paragraph"}}); got != "First paragraph" {
		t.Errorf("fallback = %q", got)
	}
	out := articleCrawlHTML("A <b> title", "<p>intro <u>x</u></p><script>1</script>", "", []map[string]interface{}{
		{"type": "h2", "text": "Part & one"}, {"type": "p", "text": "plain <x>"}, {"type": "p", "html": "<ul><li>a</li></ul>", "text": "a"}, {"type": "image", "alt": "alt text"},
	})
	for _, want := range []string{"<h1>A &lt;b&gt; title</h1>", "<p>intro <u>x</u></p>", "<h2>Part &amp; one</h2>", "<p>plain &lt;x&gt;</p>", "<ul><li>a</li></ul>", "alt text"} {
		if !strings.Contains(out, want) {
			t.Errorf("crawl html misses %q: %s", want, out)
		}
	}
	if strings.Contains(out, "<script") {
		t.Errorf("script leaked: %s", out)
	}
}

func TestArticleSlugFromPath(t *testing.T) {
	for path, want := range map[string]string{"/id/style/a-b": "a-b", "/en/hosts/amy/journal/x": "x", "/style/old": "old", "/hosts/amy/journal/y": "y", "/p/12": "", "/": ""} {
		if got := articleSlugFromPath(strings.Split(strings.Trim(path, "/"), "/")); got != want {
			t.Errorf("%s -> %q, want %q", path, got, want)
		}
	}
}
