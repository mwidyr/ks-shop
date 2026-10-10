package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Active Operating Days - the divisor behind every AVG on the Performance pages:
//   - LIVE: Jakarta calendar days with a recorded LIVE session (live_data_recorded_at set),
//     honouring the Location / Host filter.
//   - Website: every day from the website launch date (store_settings.website_launch_date) on,
//     within the selected period and up to today. None when no launch date is set.
//   - ALL: days when either channel operates, each day counted once.
type operatingDays struct {
	Live    int
	Website int
	All     int
}

// ForChannel picks the divisor for ?channel= (default all).
func (d operatingDays) ForChannel(channel string) int {
	switch channel {
	case "live":
		return d.Live
	case "website":
		return d.Website
	}
	return d.All
}

const dayLayout = "2006-01-02"

// websiteLaunchDate reads the manual launch date; nil when unset or malformed.
func websiteLaunchDate(ctx context.Context, db *pgxpool.Pool) *time.Time {
	var v string
	if db.QueryRow(ctx, `SELECT value FROM store_settings WHERE key='website_launch_date'`).Scan(&v) != nil || v == "" {
		return nil
	}
	t, err := time.ParseInLocation(dayLayout, v, businessTZ)
	if err != nil {
		return nil
	}
	return &t
}

// websiteDayKeys lists the Jakarta dates (yyyy-mm-dd) the website operated in [from, to).
func websiteDayKeys(launch *time.Time, from, to, now time.Time) []string {
	if launch == nil {
		return nil
	}
	start := time.Date(from.In(businessTZ).Year(), from.In(businessTZ).Month(), from.In(businessTZ).Day(), 0, 0, 0, 0, businessTZ)
	if launch.After(start) {
		start = *launch
	}
	last := to.Add(-time.Nanosecond).In(businessTZ)
	end := time.Date(last.Year(), last.Month(), last.Day(), 0, 0, 0, 0, businessTZ)
	nowLocal := now.In(businessTZ)
	today := time.Date(nowLocal.Year(), nowLocal.Month(), nowLocal.Day(), 0, 0, 0, 0, businessTZ)
	if end.After(today) {
		end = today
	}
	var keys []string
	for d := start; !d.After(end); d = d.AddDate(0, 0, 1) {
		keys = append(keys, d.Format(dayLayout))
	}
	return keys
}

// computeOperatingDays counts the three day sets for [from, to) under the request's Location /
// Host filter. The Website only counts towards ALL when the view is not narrowed to a Location /
// Host (those are LIVE concepts), same rule as includeWebsiteSales.
func computeOperatingDays(ctx context.Context, db *pgxpool.Pool, r *http.Request, from, to time.Time) (operatingDays, error) {
	where, locArgs := hostFilter(r, "ls", 3)
	args := append([]interface{}{from, to}, locArgs...)
	rows, err := db.Query(ctx, `
		SELECT DISTINCT to_char((ls.started_at AT TIME ZONE 'Asia/Jakarta')::date, 'YYYY-MM-DD')
		FROM live_sessions ls
		JOIN hosts h ON h.id = ls.host_id
		WHERE ls.live_data_recorded_at IS NOT NULL
		  AND ls.started_at >= $1 AND ls.started_at < $2`+where, args...)
	if err != nil {
		return operatingDays{}, err
	}
	defer rows.Close()
	live := map[string]bool{}
	for rows.Next() {
		var k string
		if rows.Scan(&k) == nil {
			live[k] = true
		}
	}
	web := websiteDayKeys(websiteLaunchDate(ctx, db), from, to, time.Now())
	all := map[string]bool{}
	for k := range live {
		all[k] = true
	}
	if includeWebsiteSales(r) {
		for _, k := range web {
			all[k] = true
		}
	}
	return operatingDays{Live: len(live), Website: len(web), All: len(all)}, nil
}
