package handlers

import (
	"strings"
	"testing"
	"time"
)

func TestViewsIncrease(t *testing.T) {
	prev := 448
	if got := viewsIncrease(466, &prev); got != 18 {
		t.Fatalf("increase = %d, want 18", got)
	}
	if got := viewsIncrease(448, &prev); got != 0 {
		t.Fatalf("equal views = %d, want 0", got)
	}
	if got := viewsIncrease(100, &prev); got != 0 {
		t.Fatalf("lower views = %d, want 0 (never negative)", got)
	}
	if got := viewsIncrease(500, nil); got != 0 {
		t.Fatalf("no previous record = %d, want 0", got)
	}
}

func TestGroupThousandsAndRoom(t *testing.T) {
	for in, want := range map[int]string{0: "0", 999: "999", 1000: "1,000", 12500: "12,500", 1234567: "1,234,567"} {
		if got := groupThousands(in); got != want {
			t.Fatalf("groupThousands(%d) = %q, want %q", in, got, want)
		}
	}
	if got := formatRoom("ROOM001"); got != "Room 001" {
		t.Fatalf("formatRoom = %q", got)
	}
	if got := formatRoom("Studio A"); got != "Studio A" {
		t.Fatalf("formatRoom keeps other names, got %q", got)
	}
}

func TestBuildViewsMessage(t *testing.T) {
	wib := time.FixedZone("WIB", 7*3600)
	at := time.Date(2026, 11, 2, 17, 30, 0, 0, wib)
	msg := buildViewsMessage([]viewsEntry{
		{Host: "Anggi", Room: "ROOM001", Device: "Iphone13_001", TikTokID: "@ohzaza000", Views: 466, Increase: 18},
		{Host: "Dinda", Room: "ROOM004", Device: "Pink15_004", TikTokID: "ralulubrashop04", Views: 1300, Increase: 120},
	}, at, "Dragon", wib)
	want := "📊 TikTok Views Update\n🕒 02 Nov 2026 17:30\n📍 Dragon\n\n" +
		"👤 Anggi\n🏠 Room 001\n📱 Iphone13_001\n🎵 <a href=\"https://www.tiktok.com/@ohzaza000/live\">@ohzaza000</a>\n👀 466\n➕ 18\n\n" +
		"👤 Dinda\n🏠 Room 004\n📱 Pink15_004\n🎵 <a href=\"https://www.tiktok.com/@ralulubrashop04/live\">@ralulubrashop04</a>\n👀 1,300\n➕ 120"
	if msg != want {
		t.Fatalf("message mismatch:\n%s\n---\n%s", msg, want)
	}
	if !strings.Contains(buildViewsMessage([]viewsEntry{{Host: "A<b>", TikTokID: "x"}}, at, "", wib), "A&lt;b&gt;") {
		t.Fatal("host names must be HTML-escaped")
	}
}
