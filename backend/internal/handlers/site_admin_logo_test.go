package handlers

import "testing"

func TestValidLogoURL(t *testing.T) {
	ok := []string{"", "/uploads/123_logo.png", "https://cdn.example.com/logo.webp", "http://example.com/a.png"}
	bad := []string{"javascript:alert(1)", "data:image/png;base64,AAA", "//evil.com/x.png", "/uploads/../etc/passwd", "/static/logo.png", "/uploads/a b.png", "https://x.com/a\"onload=1", "ftp://x.com/a.png"}
	for _, v := range ok {
		if !validLogoURL(v) {
			t.Errorf("%q should be accepted", v)
		}
	}
	for _, v := range bad {
		if validLogoURL(v) {
			t.Errorf("%q should be rejected", v)
		}
	}
}
