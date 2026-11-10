package handlers

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSiteNoIndexSwitch(t *testing.T) {
	h := &SiteHandler{}
	get := func() string {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest("GET", "/public/store/robots.txt", nil)
		req.Header.Set("X-Forwarded-Host", "ralulu.com")
		h.Robots(rec, req)
		return rec.Body.String()
	}
	t.Setenv("SITE_NOINDEX", "true")
	if got := get(); !strings.Contains(got, "Disallow: /\n") || strings.Contains(got, "Sitemap") {
		t.Fatalf("pre-launch robots.txt must block everything: %q", got)
	}
	rec := httptest.NewRecorder()
	h.Sitemap(rec, httptest.NewRequest("GET", "/public/store/sitemap.xml", nil))
	if strings.Contains(rec.Body.String(), "<url>") {
		t.Fatalf("pre-launch sitemap must be empty: %s", rec.Body.String())
	}
	t.Setenv("SITE_NOINDEX", "")
	if got := get(); !strings.Contains(got, "Allow: /") || !strings.Contains(got, "https://ralulu.com/sitemap.xml") {
		t.Fatalf("launched robots.txt must allow crawling and point to the sitemap: %q", got)
	}
}
