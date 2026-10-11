// Package telegram sends Ralulu Hub's celebration notifications (Host Milestone, Personal Best,
// Location Milestone, Global Host Milestone) through ONE Telegram bot. This file holds the pure
// rules (milestones, repetition, templates); service.go reads the data and decides what to send.
package telegram

import (
	"regexp"
	"strconv"
	"strings"
)

// Notification types.
const (
	TypeHostMilestone       = "host_milestone"
	TypePersonalBest        = "personal_best"
	TypeLocationMilestone   = "location_milestone"
	TypeGlobalHostMilestone = "global_host_milestone"
)

// NotificationConfig is one notification type's editable settings (Telegram Settings page).
type NotificationConfig struct {
	Enabled        bool   `json:"enabled"`
	StartMilestone int    `json:"start_milestone"` // Host / Location / Global Host milestones
	Interval       int    `json:"interval"`
	Emoji          string `json:"emoji"`   // Host Milestone's celebration emoji
	MinQty         int    `json:"min_qty"` // Personal Best's minimum single-LIVE QTY
	Template       string `json:"template"`
}

// Config is everything stored for the integration except the bot token and the Location chat ids.
type Config struct {
	WorkerEnabled     bool               `json:"worker_enabled"` // off: the notifier does no checks at all
	SendEnabled       bool               `json:"send_enabled"`   // off: messages are only logged on the server
	GlobalChatID      string             `json:"global_chat_id"`
	HostMilestone     NotificationConfig `json:"host_milestone"`
	PersonalBest      NotificationConfig `json:"personal_best"`
	LocationMilestone NotificationConfig `json:"location_milestone"`
	GlobalHost        NotificationConfig `json:"global_host_milestone"`
}

// DefaultConfig holds the defaults from the client's spec.
func DefaultConfig() Config {
	return Config{
		HostMilestone: NotificationConfig{
			Enabled: true, StartMilestone: 30, Interval: 10, Emoji: "🔥",
			Template: "🏆 CONGRATULATIONS 🏆\n{celebration_effect}\n{host_name} TEMBUS {milestone} PCS!\n{celebration_effect}",
		},
		PersonalBest: NotificationConfig{
			Enabled: true, MinQty: 30,
			Template: "🏆 NEW PERSONAL BEST! 🏆\n\n🎉 CONGRATULATIONS {host_name}!\n\nPrevious Best: {previous_best} PCS\nNew Record: {new_best} PCS",
		},
		LocationMilestone: NotificationConfig{
			Enabled: true, StartMilestone: 250, Interval: 50,
			Template: "🎉 LOCATION MILESTONE! 🎉\n\n{location_name} TEMBUS {milestone} PCS!\n\nTotal QTY: {qty} PCS",
		},
		GlobalHost: NotificationConfig{
			Enabled: true, StartMilestone: 100, Interval: 50,
			Template: "🌟 GLOBAL HOST MILESTONE! 🌟\n\n🏆 {host_name} – {location_name}\n\nTEMBUS {milestone} PCS!\n\nTotal QTY: {qty} PCS",
		},
	}
}

// Normalize fills empty / invalid fields with the defaults so a half-saved config still works.
func (c Config) Normalize() Config {
	d := DefaultConfig()
	fix := func(n, def NotificationConfig, milestones bool) NotificationConfig {
		if strings.TrimSpace(n.Template) == "" {
			n.Template = def.Template
		}
		if milestones {
			if n.StartMilestone <= 0 {
				n.StartMilestone = def.StartMilestone
			}
			if n.Interval <= 0 {
				n.Interval = def.Interval
			}
		}
		return n
	}
	c.HostMilestone = fix(c.HostMilestone, d.HostMilestone, true)
	if strings.TrimSpace(c.HostMilestone.Emoji) == "" {
		c.HostMilestone.Emoji = d.HostMilestone.Emoji
	}
	c.PersonalBest = fix(c.PersonalBest, d.PersonalBest, false)
	if c.PersonalBest.MinQty <= 0 {
		c.PersonalBest.MinQty = d.PersonalBest.MinQty
	}
	c.LocationMilestone = fix(c.LocationMilestone, d.LocationMilestone, true)
	c.GlobalHost = fix(c.GlobalHost, d.GlobalHost, true)
	return c
}

// CurrentMilestone is the highest milestone reached: start, start+interval, ... Zero when the
// total has not reached the first one. A jump over several milestones yields only the top one
// (e.g. 38 -> 53 with start 30 / interval 10 gives 50, never 40).
func CurrentMilestone(total, start, interval int) int {
	if start <= 0 || interval <= 0 || total < start {
		return 0
	}
	return start + (total-start)/interval*interval
}

// RepeatCount is how many times a Host Milestone message is sent: milestone/10, at most 10
// (30 PCS = 3 messages, 100+ = 10). Same rule as the legacy Apps Script bot.
func RepeatCount(milestone int) int { return clamp(milestone/10, 1, 10) }

// CelebrationEffect is the {celebration_effect} value: the emoji repeated milestone/10 times, at
// most 10 (30 PCS = 3, 80 = 8, 100+ = 10).
func CelebrationEffect(emoji string, milestone int) string {
	return strings.Repeat(emoji, clamp(milestone/10, 0, 10))
}

func clamp(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

var variablePattern = regexp.MustCompile(`\{([a-z_]+)\}`)

// Render replaces {variables} in a template; unknown ones are left as typed so a typo is visible.
func Render(template string, vars map[string]string) string {
	return variablePattern.ReplaceAllStringFunc(template, func(m string) string {
		if v, ok := vars[m[1:len(m)-1]]; ok {
			return v
		}
		return m
	})
}

// HostName is how host names appear in messages: trimmed, single-spaced, UPPERCASE.
func HostName(name string) string {
	return strings.ToUpper(strings.Join(strings.Fields(name), " "))
}

// Vars builds the variable map. Only Host Milestone gets a {celebration_effect}.
func Vars(typ string, cfg NotificationConfig, host, location string, milestone, qty, prevBest, newBest int, date string) map[string]string {
	v := map[string]string{
		"host_name":     HostName(host),
		"location_name": location,
		"milestone":     strconv.Itoa(milestone),
		"qty":           strconv.Itoa(qty),
		"previous_best": strconv.Itoa(prevBest),
		"new_best":      strconv.Itoa(newBest),
		"date":          date,
	}
	if typ == TypeHostMilestone {
		v["celebration_effect"] = CelebrationEffect(cfg.Emoji, milestone)
	} else {
		v["celebration_effect"] = ""
	}
	return v
}
