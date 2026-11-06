package telegram

import (
	"testing"
	"time"
)

func TestNormalizeVoiceSchedule(t *testing.T) {
	got, err := NormalizeVoiceSchedule(VoiceSchedule{Days: []int{7, 1, 1}, Times: []string{"9:27", "06:27", "09:27"}})
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Days) != 2 || got.Days[0] != 1 || got.Days[1] != 7 {
		t.Fatalf("days = %v", got.Days)
	}
	if len(got.Times) != 2 || got.Times[0] != "06:27" || got.Times[1] != "09:27" {
		t.Fatalf("times = %v", got.Times)
	}
	if _, err := NormalizeVoiceSchedule(VoiceSchedule{Times: []string{"25:00"}}); err == nil {
		t.Fatal("25:00 must be rejected")
	}
	if _, err := NormalizeVoiceSchedule(VoiceSchedule{Days: []int{8}}); err == nil {
		t.Fatal("day 8 must be rejected")
	}
}

func TestVoiceScheduleDue(t *testing.T) {
	s := VoiceSchedule{Days: []int{1, 2, 3, 4, 5, 7}, Times: []string{"06:27", "09:57"}} // no Saturday
	// Monday 2 Nov 2026 06:27 Jakarta = 23:27 UTC on Sunday 1 Nov
	if h, ok := s.Due(time.Date(2026, 11, 1, 23, 27, 10, 0, time.UTC)); !ok || h != "06:27" {
		t.Fatalf("Monday 06:27 should be due, got %q %v", h, ok)
	}
	if _, ok := s.Due(time.Date(2026, 11, 1, 23, 28, 0, 0, time.UTC)); ok {
		t.Fatal("06:28 is not a reminder time")
	}
	// Saturday 7 Nov 2026 09:57 Jakarta: the day is switched off
	if _, ok := s.Due(time.Date(2026, 11, 7, 2, 57, 0, 0, time.UTC)); ok {
		t.Fatal("Saturday is not active")
	}
	// Sunday (Go weekday 0) counts as day 7
	if _, ok := s.Due(time.Date(2026, 11, 8, 2, 57, 0, 0, time.UTC)); !ok {
		t.Fatal("Sunday 09:57 should be due")
	}
}
