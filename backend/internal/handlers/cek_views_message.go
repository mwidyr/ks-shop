package handlers

import (
	"fmt"
	"html"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// viewsEntry is one host of a CEK VIEWS submission as it appears in the Telegram report.
type viewsEntry struct {
	Host     string
	Room     string
	Device   string
	TikTokID string
	Views    int
	Increase int // views gained since the host's previous submission; 0 when there is none or it did not go up
}

var roomRe = regexp.MustCompile(`(?i)^room\s*0*(\d+)$`)

// formatRoom shows ROOM001 as "Room 001" (the report's wording); any other name is kept as typed.
func formatRoom(name string) string {
	m := roomRe.FindStringSubmatch(strings.TrimSpace(name))
	if m == nil {
		return strings.TrimSpace(name)
	}
	n, _ := strconv.Atoi(m[1])
	return fmt.Sprintf("Room %03d", n)
}

// cleanTikTokID strips a leading @ and surrounding spaces.
func cleanTikTokID(id string) string { return strings.TrimPrefix(strings.TrimSpace(id), "@") }

// tiktokLiveURL is the account's LIVE page: https://www.tiktok.com/@{id}/live
func tiktokLiveURL(id string) string { return "https://www.tiktok.com/@" + cleanTikTokID(id) + "/live" }

// groupThousands writes n with commas from 1,000 up (12500 -> "12,500").
func groupThousands(n int) string {
	s := strconv.Itoa(n)
	neg := strings.HasPrefix(s, "-")
	if neg {
		s = s[1:]
	}
	for i := len(s) - 3; i > 0; i -= 3 {
		s = s[:i] + "," + s[i:]
	}
	if neg {
		return "-" + s
	}
	return s
}

// viewsIncrease is the "➕" figure: the difference to the previous submission when the views went up,
// otherwise 0 (no previous record, equal or lower views). Never negative.
func viewsIncrease(current int, previous *int) int {
	if previous == nil || current <= *previous {
		return 0
	}
	return current - *previous
}

// buildViewsMessage renders the Telegram report (HTML parse mode). Each TikTok account name links to its LIVE
// page; the increase sits on its own line directly under Views.
func buildViewsMessage(entries []viewsEntry, at time.Time, location string, zone *time.Location) string {
	lines := []string{
		"📊 TikTok Views Update",
		"🕒 " + at.In(zone).Format("02 Jan 2006 15:04"),
	}
	if strings.TrimSpace(location) != "" {
		lines = append(lines, "📍 "+html.EscapeString(location))
	}
	for _, e := range entries {
		id := cleanTikTokID(e.TikTokID)
		lines = append(lines, "",
			"👤 "+html.EscapeString(orDash(e.Host)),
			"🏠 "+html.EscapeString(orDash(formatRoom(e.Room))),
			"📱 "+html.EscapeString(orDash(e.Device)),
			`🎵 <a href="`+html.EscapeString(tiktokLiveURL(id))+`">@`+html.EscapeString(id)+`</a>`,
			"👀 "+groupThousands(e.Views),
			"➕ "+groupThousands(e.Increase),
		)
	}
	return strings.Join(lines, "\n")
}

func orDash(s string) string {
	if strings.TrimSpace(s) == "" {
		return "-"
	}
	return s
}
