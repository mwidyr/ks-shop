package telegram

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"regexp"
	"sort"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const keyVoiceSchedule = "cek_views_voice_schedule" // JSON of VoiceSchedule

// reminderZone is Asia/Jakarta (GMT+7). Indonesia has no daylight saving, so a fixed zone is exact and
// does not depend on tzdata being installed in the container.
var reminderZone = time.FixedZone("WIB", 7*60*60)

// VoiceSchedule is the CEK VIEWS voice reminder: one shared list of times (Asia/Jakarta, HH:MM) that runs on
// every selected day (1 = Monday ... 7 = Sunday).
type VoiceSchedule struct {
	Days  []int    `json:"days"`
	Times []string `json:"times"`
}

var hhmmRe = regexp.MustCompile(`^([01]?\d|2[0-3]):([0-5]\d)$`)

// NormalizeVoiceSchedule validates and cleans a schedule: days 1-7 unique and sorted, times as zero-padded
// HH:MM, unique and sorted.
func NormalizeVoiceSchedule(in VoiceSchedule) (VoiceSchedule, error) {
	days := map[int]bool{}
	for _, d := range in.Days {
		if d < 1 || d > 7 {
			return VoiceSchedule{}, fmt.Errorf("invalid day %d", d)
		}
		days[d] = true
	}
	times := map[string]bool{}
	for _, t := range in.Times {
		m := hhmmRe.FindStringSubmatch(t)
		if m == nil {
			return VoiceSchedule{}, fmt.Errorf("invalid time %q (use HH:MM)", t)
		}
		var h, min int
		fmt.Sscanf(m[1], "%d", &h)
		fmt.Sscanf(m[2], "%d", &min)
		times[fmt.Sprintf("%02d:%02d", h, min)] = true
	}
	out := VoiceSchedule{Days: []int{}, Times: []string{}}
	for d := range days {
		out.Days = append(out.Days, d)
	}
	for t := range times {
		out.Times = append(out.Times, t)
	}
	sort.Ints(out.Days)
	sort.Strings(out.Times)
	return out, nil
}

// weekdayNumber maps Go's Sunday=0 to 1 = Monday ... 7 = Sunday.
func weekdayNumber(t time.Time) int {
	if t.Weekday() == time.Sunday {
		return 7
	}
	return int(t.Weekday())
}

// Due reports whether a reminder is scheduled for the minute `now` falls in (Jakarta time) and returns that HH:MM.
func (v VoiceSchedule) Due(now time.Time) (string, bool) {
	local := now.In(reminderZone)
	day := weekdayNumber(local)
	onDay := false
	for _, d := range v.Days {
		if d == day {
			onDay = true
		}
	}
	if !onDay {
		return "", false
	}
	hhmm := local.Format("15:04")
	for _, t := range v.Times {
		if t == hhmm {
			return hhmm, true
		}
	}
	return "", false
}

// LoadVoiceSchedule returns the saved schedule (no days / no times until one is saved).
func (s *Store) LoadVoiceSchedule(ctx context.Context) VoiceSchedule {
	out := VoiceSchedule{Days: []int{1, 2, 3, 4, 5, 6, 7}, Times: []string{}}
	if raw := s.get(ctx, keyVoiceSchedule); raw != "" {
		var saved VoiceSchedule
		if json.Unmarshal([]byte(raw), &saved) == nil {
			if n, err := NormalizeVoiceSchedule(saved); err == nil {
				out = n
			}
		}
	}
	return out
}

func (s *Store) SaveVoiceSchedule(ctx context.Context, v VoiceSchedule) error {
	n, err := NormalizeVoiceSchedule(v)
	if err != nil {
		return err
	}
	b, _ := json.Marshal(n)
	return s.set(ctx, keyVoiceSchedule, string(b))
}

// VoiceReminder sends the uploaded voice recording to the CEK VIEWS group at the scheduled times.
type VoiceReminder struct {
	DB    *pgxpool.Pool
	Store *Store
}

// Run checks the schedule every `interval` until ctx ends. A time is claimed in cek_views_voice_sent
// first, so it goes out once even with several checks inside the same minute (or several app instances).
func (v *VoiceReminder) Run(ctx context.Context, interval time.Duration) {
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case now := <-t.C:
			if err := v.Tick(ctx, now); err != nil {
				log.Printf("telegram voice reminder: %v", err)
			}
		}
	}
}

// Tick sends the reminder when `now` is a scheduled minute that has not been sent yet.
func (v *VoiceReminder) Tick(ctx context.Context, now time.Time) error {
	hhmm, due := v.Store.LoadVoiceSchedule(ctx).Due(now)
	if !due {
		return nil
	}
	if !v.Store.LoadConfig(ctx).SendEnabled {
		return nil // sending is switched off (Telegram Settings): nothing is claimed, nothing is sent
	}
	day := now.In(reminderZone).Format("2006-01-02")
	ct, err := v.DB.Exec(ctx, `INSERT INTO cek_views_voice_sent (sent_on, at_time) VALUES ($1,$2) ON CONFLICT DO NOTHING`, day, hhmm)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return nil // already sent
	}
	if err := v.SendNow(ctx); err != nil {
		// release the claim so the next check (same minute) retries
		_, _ = v.DB.Exec(ctx, `DELETE FROM cek_views_voice_sent WHERE sent_on=$1 AND at_time=$2`, day, hhmm)
		return err
	}
	return nil
}

// SendNow uploads the saved recording to the CEK VIEWS chat / topic regardless of the schedule.
func (v *VoiceReminder) SendNow(ctx context.Context) error {
	token := v.Store.Token(ctx)
	if token == "" {
		return errors.New("no bot token")
	}
	cfg := v.Store.LoadConfig(ctx)
	if cfg.CekViewsChatID == "" {
		return errors.New("no CEK VIEWS chat id")
	}
	var name string
	var data []byte
	err := v.DB.QueryRow(ctx, `SELECT filename, data FROM cek_views_voice_file WHERE id = 1`).Scan(&name, &data)
	if errors.Is(err, pgx.ErrNoRows) {
		return errors.New("no voice file uploaded")
	}
	if err != nil {
		return err
	}
	return SendVoice(ctx, token, cfg.CekViewsChatID, cfg.CekViewsThreadID, name, data)
}
