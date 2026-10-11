package telegram

import "testing"

func TestCurrentMilestone(t *testing.T) {
	cases := []struct{ total, start, interval, want int }{
		{29, 30, 10, 0}, {30, 30, 10, 30}, {38, 30, 10, 30}, {53, 30, 10, 50}, {105, 30, 10, 100}, {118, 30, 10, 110}, {160, 30, 10, 160}, {1000, 30, 10, 1000},
		{249, 250, 50, 0}, {290, 250, 50, 250}, {355, 250, 50, 350},
		{95, 100, 50, 0}, {155, 100, 50, 150},
		{40, 0, 10, 0},
	}
	for _, c := range cases {
		if got := CurrentMilestone(c.total, c.start, c.interval); got != c.want {
			t.Errorf("CurrentMilestone(%d,%d,%d) = %d, want %d", c.total, c.start, c.interval, got, c.want)
		}
	}
}

func TestRepeatCountAndEffect(t *testing.T) {
	for m, want := range map[int]int{30: 3, 40: 4, 50: 5, 90: 9, 100: 10, 110: 10, 200: 10} {
		if got := RepeatCount(m); got != want {
			t.Errorf("RepeatCount(%d) = %d, want %d", m, got, want)
		}
	}
	if got := CelebrationEffect("🔥", 80); got != "🔥🔥🔥🔥🔥🔥🔥🔥" {
		t.Errorf("effect 80 = %q", got)
	}
	if got := CelebrationEffect("🔥", 250); got != "🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥" {
		t.Errorf("effect 250 = %q", got)
	}
}

func TestRenderMatchesLegacyMessage(t *testing.T) {
	cfg := DefaultConfig().HostMilestone
	cfg.Template = "{celebration_effect}\n{host_name}\nTEMBUS {milestone} PCS!\n{celebration_effect}"
	got := Render(cfg.Template, Vars(TypeHostMilestone, cfg, "rere ", "Ohlala", 50, 53, 0, 0, "2026-10-11"))
	want := "🔥🔥🔥🔥🔥\nRERE\nTEMBUS 50 PCS!\n🔥🔥🔥🔥🔥"
	if got != want {
		t.Errorf("got %q want %q", got, want)
	}
	// unknown variables stay visible; non-host types get no celebration effect
	if Render("{nope} {celebration_effect}|", Vars(TypeLocationMilestone, cfg, "", "A", 300, 312, 0, 0, "d")) != "{nope} |" {
		t.Error("unknown/celebration handling wrong")
	}
}

func TestNormalizeFillsDefaults(t *testing.T) {
	c := Config{}.Normalize()
	if c.HostMilestone.StartMilestone != 30 || c.LocationMilestone.StartMilestone != 250 || c.GlobalHost.Interval != 50 || c.PersonalBest.MinQty != 30 || c.HostMilestone.Template == "" {
		t.Errorf("defaults not applied: %+v", c)
	}
}

func TestEncryptRoundTrip(t *testing.T) {
	s := &Store{Secret: "k"}
	enc, err := s.encrypt("123:ABC")
	if err != nil {
		t.Fatal(err)
	}
	if enc == "123:ABC" {
		t.Fatal("token stored in plain text")
	}
	if dec, err := s.decrypt(enc); err != nil || dec != "123:ABC" {
		t.Errorf("round trip: %q %v", dec, err)
	}
	if _, err := (&Store{Secret: "other"}).decrypt(enc); err == nil {
		t.Error("wrong key must not decrypt")
	}
}

func TestDefaultConfigIsSafe(t *testing.T) {
	c := DefaultConfig().Normalize()
	if c.WorkerEnabled || c.SendEnabled {
		t.Fatalf("worker and send must default to off: %+v", c)
	}
}

func TestLogOnlyDispatchDoesNotRepeat(t *testing.T) {
	n := NewNotifier(nil, nil) // log-only never touches the DB or the network
	cfg := DefaultConfig()
	args := func() {
		n.dispatch(nil, cfg, "tok", TypeHostMilestone, "1", "2026-10-11", 30, nil, 31, nil, "-1", "hi", 3, "k")
	}
	args()
	args()
	if len(n.logged) != 1 {
		t.Fatalf("expected one logged key, got %d", len(n.logged))
	}
}
