package handlers

import "testing"

func TestNormalizeLineID(t *testing.T) {
	cases := []struct {
		in   string
		want string
		ok   bool
	}{
		{"@ohlalashop888", "@ohlalashop888", true},
		{"ohlalashop888", "@ohlalashop888", true},
		{" @oh lala ", "@ohlala", true},
		{"", "", true},
		{"@", "@", false},
		{"@a b<script>", "@a b<script>", false},
		{"@has/slash", "@has/slash", false},
	}
	for _, c := range cases {
		got, ok := normalizeLineID(c.in)
		if ok != c.ok || (ok && got != c.want) {
			t.Errorf("normalizeLineID(%q) = %q,%v want %q,%v", c.in, got, ok, c.want, c.ok)
		}
	}
}

func TestTutorialHTMLIsSanitised(t *testing.T) {
	got := sanitizeRichHTML(`<p>Ambil <strong>struk</strong><script>alert(1)</script></p><img src=x onerror=alert(1)>`)
	if got != "<p>Ambil <strong>struk</strong></p>" {
		t.Errorf("unexpected sanitised html: %q", got)
	}
}
