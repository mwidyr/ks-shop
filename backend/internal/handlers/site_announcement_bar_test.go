package handlers

import (
	"testing"
	"time"
)

func sampleBar() barConfig {
	c := defaultBarConfig()
	c.Messages = []barMessage{{ID: "m1", Emoji: "🚚", Text: map[string]string{"en": "Free shipping over NT$1,000"}, Enabled: true}}
	return c
}

func TestValidateBarConfig(t *testing.T) {
	c := sampleBar()
	if msg := validateBarConfig(&c, true); msg != "" {
		t.Fatalf("default config should publish, got %q", msg)
	}
	cases := map[string]func(*barConfig){
		"timing": func(c *barConfig) { c.Timing.TypeMs = 10 },
		"font":   func(c *barConfig) { c.Style.FontSize = 30 },
		"color":  func(c *barConfig) { c.Style.Accent = "red" },
		"too many": func(c *barConfig) {
			c.Messages = append(c.Messages, c.Messages[0], c.Messages[0], c.Messages[0], c.Messages[0], c.Messages[0], c.Messages[0])
		},
		"empty text": func(c *barConfig) { c.Messages[0].Text = map[string]string{"en": "  "} },
		"bad link":   func(c *barConfig) { c.Messages[0].URL = "javascript:alert(1)" },
		"bad date":   func(c *barConfig) { d := "tomorrow"; c.Messages[0].From = &d },
		"contrast":   func(c *barConfig) { c.Style.Text = "#B04860" },
		"no message": func(c *barConfig) { c.Messages = nil },
		"reversed date": func(c *barConfig) {
			a, b := "2026-02-02", "2026-01-01"
			c.Messages[0].From, c.Messages[0].Until = &a, &b
		},
	}
	for name, mut := range cases {
		c := sampleBar()
		mut(&c)
		if msg := validateBarConfig(&c, true); msg == "" {
			t.Errorf("%s: expected a validation error", name)
		}
	}
	// a draft may be empty and low-contrast; only publishing is strict
	c = sampleBar()
	c.Messages = nil
	c.Style.Text = "#B04860"
	if msg := validateBarConfig(&c, false); msg != "" {
		t.Errorf("draft should save, got %q", msg)
	}
	c = sampleBar()
	c.Messages[0].URL = "/products"
	if msg := validateBarConfig(&c, true); msg != "" {
		t.Errorf("relative link should be accepted, got %q", msg)
	}
}

func TestBarContrastRatio(t *testing.T) {
	if r := contrastRatio("#000000", "#FFFFFF"); r < 20.9 || r > 21.1 {
		t.Errorf("black on white = %v, want 21", r)
	}
	if r := contrastRatio("#FFF5F7", "#A0344F"); r < 4.5 {
		t.Errorf("default Rose pair must pass AA, got %v", r)
	}
}

func TestActiveBarMessages(t *testing.T) {
	from, until := "2026-03-10", "2026-03-12"
	c := defaultBarConfig()
	c.Messages = []barMessage{
		{Text: map[string]string{"en": "always"}, Enabled: true},
		{Text: map[string]string{"en": "off"}, Enabled: false},
		{Text: map[string]string{"en": "window"}, Emoji: "🔥", Enabled: true, From: &from, Until: &until},
		{Text: map[string]string{"zh": "只有中文"}, Enabled: true},
	}
	at := func(s string) time.Time { tm, _ := time.ParseInLocation("2006-01-02 15:04", s, taipeiLoc()); return tm }
	got := activeBarMessages(&c, "en", at("2026-03-11 12:00"))
	if len(got) != 3 || got[1].Text != "🔥 window" || got[2].Text != "只有中文" {
		t.Fatalf("inside window: %+v", got)
	}
	if got := activeBarMessages(&c, "en", at("2026-03-13 00:30")); len(got) != 2 {
		t.Fatalf("after window: %+v", got)
	}
	if got := activeBarMessages(&c, "en", at("2026-03-09 23:59")); len(got) != 2 {
		t.Fatalf("before window: %+v", got)
	}
}
