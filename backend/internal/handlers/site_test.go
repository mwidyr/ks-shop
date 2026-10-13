package handlers

import (
	"strings"
	"testing"
	"time"
)

func TestNormalizeWhatsAppNumber(t *testing.T) {
	cases := map[string]string{
		"082220056883":       "6282220056883",
		"0822-2005-6883":     "6282220056883",
		"+62 822 2005 6883":  "6282220056883",
		"6282220056883":      "6282220056883",
		"0062 822 2005 6883": "6282220056883",
		"":                   "",
	}
	for in, want := range cases {
		if got := NormalizeWhatsAppNumber(in); got != want {
			t.Errorf("NormalizeWhatsAppNumber(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestContrastRatio(t *testing.T) {
	if r := ContrastRatio("#000000", "#FFFFFF"); r < 20.9 || r > 21.1 {
		t.Errorf("black/white = %.2f, want 21", r)
	}
	// Spec example: white text on the peach primary is only ~2.3:1 and must fail.
	if r := ContrastRatio("#FFFFFF", "#FF8C69"); r < 2.2 || r > 2.5 {
		t.Errorf("white/peach = %.2f, want ~2.3", r)
	}
	// ...and the default dark on-primary passes (spec: 6.2:1).
	if r := ContrastRatio("#2B2B2E", "#FF8C69"); r < 6.0 || r > 6.4 {
		t.Errorf("dark/peach = %.2f, want ~6.2", r)
	}
}

func TestThemePresetsPass(t *testing.T) {
	for _, p := range themePresets {
		v := ValidateTheme(p.Tokens)
		if !v.Passed {
			t.Errorf("preset %s fails validation: %+v", p.Key, v.Issues)
		}
	}
}

func TestValidateThemeFailsWhiteOnPrimaryWithSuggestion(t *testing.T) {
	tok := withOverrides(peachTokens, map[string]string{"onPrimary": "#FFFFFF"})
	v := ValidateTheme(tok)
	if v.Passed {
		t.Fatal("white on peach must not pass")
	}
	found := false
	for _, is := range v.Issues {
		if is.Pair == "onPrimary/primary" {
			found = true
			if is.Ratio >= 4.5 || !strings.Contains(is.Suggestion, "#2B2B2E") {
				t.Errorf("unexpected issue %+v", is)
			}
		}
	}
	if !found {
		t.Error("expected an onPrimary/primary issue")
	}
	if bad := ValidateTheme(withOverrides(peachTokens, map[string]string{"primary": "nothex"})); bad.Passed {
		t.Error("an invalid HEX must not pass")
	}
}

func TestThemeCSS(t *testing.T) {
	css := ThemeCSS(peachTokens, "light")
	for _, want := range []string{"--color-primary:#FF8C69", "--color-on-primary:#2B2B2E", "--color-bg-soft:#F7F7F8", "--color-live:#D32F2F", "--color-coupon-bg:"} {
		if !strings.Contains(css, want) {
			t.Errorf("css missing %q: %s", want, css)
		}
	}
	// A missing/invalid token falls back to the default instead of dropping the variable.
	css = ThemeCSS(map[string]string{"primary": "nothex"}, "light")
	if !strings.Contains(css, "--color-primary:#FF8C69") {
		t.Errorf("fallback missing: %s", css)
	}
	if soft := ThemeCSS(peachTokens, "soft"); !strings.Contains(soft, "--color-bg:#F7F7F8") {
		t.Errorf("soft mode should use the soft background: %s", soft)
	}
}

func TestBuildOrderWhatsAppText(t *testing.T) {
	txt := BuildOrderWhatsAppText("id", "WEB-1-0001",
		[]waLine{{Name: "Kemeja kotak", Color: "Khaki", Size: "M", Qty: 1, Price: 590}, {Name: "Rok", Color: "", Size: "S", Qty: 2, Price: 345}},
		1280, 100, 0, 1180, "7-ELEVEN Toko X (123456)", "Wang", "0912345678", false)
	for _, want := range []string{"WEB-1-0001", "Kemeja kotak (Khaki / M) x1 = NT$590", "Rok (S) x2 = NT$690", "Subtotal: NT$1280", "Diskon: -NT$100", "Ongkir: Gratis", "NT$1180", "belum terverifikasi"} {
		if !strings.Contains(txt, want) {
			t.Errorf("missing %q in:\n%s", want, txt)
		}
	}
	u := WhatsAppURL("6282220056883", "a b\nc")
	if u != "https://wa.me/6282220056883?text=a%20b%0Ac" {
		t.Errorf("url = %s", u)
	}
	if WhatsAppURL("", "x") != "" {
		t.Error("no number -> no link")
	}
}

func TestRateLimiter(t *testing.T) {
	l := &rateLimiter{hits: map[string][]time.Time{}}
	for i := 0; i < 3; i++ {
		if !l.allow("k", 3, time.Minute) {
			t.Fatalf("call %d should pass", i)
		}
	}
	if l.allow("k", 3, time.Minute) {
		t.Error("4th call must be blocked")
	}
	if !l.allow("other", 3, time.Minute) {
		t.Error("another key is independent")
	}
}

func TestMaskName(t *testing.T) {
	cases := map[string]string{"Wang Xiaomei": "Wa***", "A": "A***", "": "***", "  李小美 ": "李小***"}
	for in, want := range cases {
		if got := maskName(in); got != want {
			t.Errorf("maskName(%q) = %q, want %q", in, got, want)
		}
	}
}
