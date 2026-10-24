package handlers

import (
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
