package handlers

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAbsoluteURL(t *testing.T) {
	cases := map[string]string{
		"":                           "",
		"/uploads/a.jpg":             "https://shop.test/uploads/a.jpg",
		"uploads/a.jpg":              "https://shop.test/uploads/a.jpg",
		"https://cdn.test/a.jpg":     "https://cdn.test/a.jpg",
		"//cdn.test/a.jpg":           "https://cdn.test/a.jpg",
		"  /uploads/with space.jpg ": "https://shop.test/uploads/with space.jpg",
	}
	for in, want := range cases {
		if got := absoluteURL("https://shop.test/", in); got != want {
			t.Errorf("absoluteURL(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestOneLine(t *testing.T) {
	if got := oneLine("Line one\n\n  line   two\t"); got != "Line one line two" {
		t.Fatalf("got %q", got)
	}
}

// A product page's head carries every Open Graph tag a link preview needs (image absolute, one-line description).
func TestProductOpenGraphTags(t *testing.T) {
	m := seoMeta{
		Title: "Bra Backless", Description: "Backless bra with wide open back", Canonical: "https://shop.test/p/12", Index: true,
		Image: absoluteURL("https://shop.test", "/uploads/bra.jpg"), OGType: "product", PriceAmount: 190, Currency: "TWD",
	}
	out := m.render("id")
	for _, want := range []string{
		`<meta property="og:title" content="Bra Backless | ralulu">`,
		`<meta property="og:description" content="Backless bra with wide open back">`,
		`<meta property="og:url" content="https://shop.test/p/12">`,
		`<meta property="og:image" content="https://shop.test/uploads/bra.jpg">`,
		`<meta property="og:type" content="product">`,
		`<meta name="twitter:card" content="summary_large_image">`,
		`<meta property="product:price:amount" content="190.00">`,
	} {
		if !strings.Contains(out, want) {
			t.Errorf("missing %s in:\n%s", want, out)
		}
	}
}

// Absolute links follow the address the visitor used: production (https, domain behind the TLS proxy) and
// the IP-only staging VPS (http, with its port).
func TestPublicBaseURL(t *testing.T) {
	mk := func(host string, hdr map[string]string) *http.Request {
		r := httptest.NewRequest("GET", "/api/public/store/seo", nil)
		r.Host = host
		for k, v := range hdr {
			r.Header.Set(k, v)
		}
		return r
	}
	cases := []struct {
		name string
		r    *http.Request
		want string
	}{
		{"production behind TLS proxy", mk("ralulu.com", map[string]string{"X-Forwarded-Proto": "https"}), "https://ralulu.com"},
		{"staging IP with port", mk("116.193.191.197:8082", map[string]string{"X-Forwarded-Proto": "http"}), "http://116.193.191.197:8082"},
		{"forwarded host wins", mk("backend:8080", map[string]string{"X-Forwarded-Proto": "https", "X-Forwarded-Host": "ralulu.com"}), "https://ralulu.com"},
		{"local dev", mk("localhost:8080", nil), "http://localhost:8080"},
	}
	for _, c := range cases {
		if got := publicBaseURL(c.r); got != c.want {
			t.Errorf("%s: got %q, want %q", c.name, got, c.want)
		}
	}
}
