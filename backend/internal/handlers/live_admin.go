package handlers

import (
	"encoding/json"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

// Global LIVE Settings (admin tab website_live): shift hours, location working days and each host's
// LIVE link. Host name, location and shift always come from Host Management; nothing is duplicated.

type liveShiftDTO struct {
	Shift  string     `json:"shift"`
	Ranges [][]string `json:"ranges"`
}

type liveDayOffDTO struct {
	Date string `json:"date"`
	Note string `json:"note"`
}

type liveLocationDTO struct {
	ID       int             `json:"id"`
	Name     string          `json:"name"`
	WorkDays []int           `json:"work_days"`
	DaysOff  []liveDayOffDTO `json:"days_off"`
}

type liveHostDTO struct {
	ID         int     `json:"id"`
	Name       string  `json:"name"`
	LocationID int     `json:"location_id"`
	Location   string  `json:"location"`
	Shift      string  `json:"shift"`
	LiveURL    string  `json:"live_url"`
	Status     string  `json:"status"` // live | scheduled | offline
	Manual     bool    `json:"manual"` // LIVE because of a manual Start LIVE (window_end = its automatic end)
	WindowEnd  *string `json:"window_end,omitempty"`
	NextAt     *string `json:"next_at,omitempty"`
}

// validLiveLink: empty (no link yet) or an http(s) address without spaces or quotes.
func validLiveLink(v string) bool {
	if v == "" {
		return true
	}
	if len(v) > 500 || strings.ContainsAny(v, " \t\r\n\"'<>\\") {
		return false
	}
	return strings.HasPrefix(v, "https://") || strings.HasPrefix(v, "http://")
}

// cleanWorkDays validates weekdays (0 = Sunday .. 6 = Saturday), sorted and de-duplicated.
func cleanWorkDays(in []int) ([]int, bool) {
	seen := map[int]bool{}
	out := []int{}
	for _, d := range in {
		if d < 0 || d > 6 {
			return nil, false
		}
		if !seen[d] {
			seen[d] = true
			out = append(out, d)
		}
	}
	sort.Ints(out)
	return out, true
}

func cleanDaysOff(in []liveDayOffDTO) ([]liveDayOffDTO, bool) {
	seen := map[string]bool{}
	out := []liveDayOffDTO{}
	for _, d := range in {
		if _, err := time.Parse("2006-01-02", d.Date); err != nil || len(d.Note) > 120 {
			return nil, false
		}
		if !seen[d.Date] {
			seen[d.Date] = true
			out = append(out, liveDayOffDTO{d.Date, strings.TrimSpace(d.Note)})
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Date < out[j].Date })
	return out, true
}

// LiveSettings serves GET /admin/live/settings.
func (h *SiteAdminHandler) LiveSettings(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	shifts := loadShiftRanges(ctx, h.DB)
	shiftOut := make([]liveShiftDTO, 0, len(liveShifts))
	for _, s := range liveShifts {
		shiftOut = append(shiftOut, liveShiftDTO{s, liveRangesToPairs(shifts[s])})
	}

	locs := []liveLocationDTO{}
	locIdx := map[int]int{}
	if rows, err := h.DB.Query(ctx, `SELECT id, name, work_days FROM host_locations WHERE is_active ORDER BY name`); err == nil {
		for rows.Next() {
			var l liveLocationDTO
			var wd []int16
			if rows.Scan(&l.ID, &l.Name, &wd) != nil {
				continue
			}
			l.WorkDays, l.DaysOff = []int{}, []liveDayOffDTO{}
			for _, d := range wd {
				l.WorkDays = append(l.WorkDays, int(d))
			}
			locIdx[l.ID] = len(locs)
			locs = append(locs, l)
		}
		rows.Close()
	}
	if rows, err := h.DB.Query(ctx, `SELECT location_id, to_char(off_date,'YYYY-MM-DD'), note FROM location_days_off WHERE off_date >= current_date - 30 ORDER BY off_date`); err == nil {
		for rows.Next() {
			var id int
			var d liveDayOffDTO
			if rows.Scan(&id, &d.Date, &d.Note) == nil {
				if i, ok := locIdx[id]; ok {
					locs[i].DaysOff = append(locs[i].DaysOff, d)
				}
			}
		}
		rows.Close()
	}

	hosts := []liveHostDTO{}
	var ids []int32
	if rows, err := h.DB.Query(ctx, `
		SELECT h.id, h.name, h.location_id, l.name, COALESCE(h.shift,''), COALESCE(h.live_url,'')
		FROM hosts h JOIN host_locations l ON l.id = h.location_id
		WHERE h.is_active ORDER BY l.name, (CASE h.shift WHEN 'morning' THEN 0 WHEN 'middle' THEN 1 WHEN 'evening' THEN 2 ELSE 3 END), h.name`); err == nil {
		for rows.Next() {
			var x liveHostDTO
			if rows.Scan(&x.ID, &x.Name, &x.LocationID, &x.Location, &x.Shift, &x.LiveURL) == nil {
				x.Status = "offline"
				hosts = append(hosts, x)
				ids = append(ids, int32(x.ID))
			}
		}
		rows.Close()
	}
	info := loadHostLive(ctx, h.DB, ids)
	now := time.Now()
	for i := range hosts {
		x := info[hosts[i].ID]
		if x == nil {
			continue
		}
		st := x.stateAt(now)
		hosts[i].Status = st.Status
		hosts[i].Manual = st.Manual
		if st.Window != nil {
			s := st.Window.End.Format(time.RFC3339)
			hosts[i].WindowEnd = &s
		}
		if st.Next != nil {
			s := st.Next.Start.Format(time.RFC3339)
			hosts[i].NextAt = &s
		}
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"shifts": shiftOut, "locations": locs, "hosts": hosts})
}

// SaveLiveShift serves PUT /admin/live/shifts/{shift}: "Save as default" for one shift's hours.
func (h *SiteAdminHandler) SaveLiveShift(w http.ResponseWriter, r *http.Request) {
	shift := chi.URLParam(r, "shift")
	known := false
	for _, s := range liveShifts {
		known = known || s == shift
	}
	var req struct {
		Ranges [][]string `json:"ranges"`
	}
	if !known || decodeJSON(r, &req) != nil {
		respondError(w, http.StatusBadRequest, "invalid shift or request body")
		return
	}
	rs, err := rangesFromPairs(req.Ranges)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	for i := 1; i < len(rs); i++ {
		if rs[i].Start < rs[i-1].End && rs[i-1].End > rs[i-1].Start {
			respondError(w, http.StatusBadRequest, "time ranges of a shift cannot overlap")
			return
		}
	}
	raw, _ := json.Marshal(liveRangesToPairs(rs))
	if _, err := h.DB.Exec(r.Context(), `UPDATE live_shift_hours SET ranges=$2::jsonb, updated_at=now() WHERE shift=$1`, shift, string(raw)); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save")
		return
	}
	respondJSON(w, http.StatusOK, liveShiftDTO{shift, liveRangesToPairs(rs)})
}

// SaveLiveLocation serves PUT /admin/live/locations/{id}: working weekdays + the extra days off of one location.
func (h *SiteAdminHandler) SaveLiveLocation(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	var req struct {
		WorkDays []int           `json:"work_days"`
		DaysOff  []liveDayOffDTO `json:"days_off"`
	}
	if err != nil || decodeJSON(r, &req) != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	days, ok := cleanWorkDays(req.WorkDays)
	off, ok2 := cleanDaysOff(req.DaysOff)
	if !ok || !ok2 {
		respondError(w, http.StatusBadRequest, "work_days must be 0-6 and days_off need a valid yyyy-mm-dd date")
		return
	}
	ctx := r.Context()
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(ctx)
	d16 := make([]int16, len(days))
	for i, d := range days {
		d16[i] = int16(d)
	}
	ct, err := tx.Exec(ctx, `UPDATE host_locations SET work_days=$2 WHERE id=$1`, id, d16)
	if err != nil || ct.RowsAffected() == 0 {
		respondError(w, http.StatusNotFound, "location not found")
		return
	}
	if _, err := tx.Exec(ctx, `DELETE FROM location_days_off WHERE location_id=$1`, id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save")
		return
	}
	for _, d := range off {
		if _, err := tx.Exec(ctx, `INSERT INTO location_days_off (location_id, off_date, note) VALUES ($1,$2::date,$3)`, id, d.Date, d.Note); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to save")
			return
		}
	}
	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save")
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"id": id, "work_days": days, "days_off": off})
}

// SaveLiveURL serves PUT /admin/live/hosts/{id}/url. It writes ONLY live_url (the website host profile
// save rewrites many more things), so changing a TikTok account can never clobber website content.
func (h *SiteAdminHandler) SaveLiveURL(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	var req struct {
		LiveURL string `json:"live_url"`
	}
	if err != nil || decodeJSON(r, &req) != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	url := strings.TrimSpace(req.LiveURL)
	if !validLiveLink(url) {
		respondError(w, http.StatusBadRequest, "link harus diawali https://")
		return
	}
	ct, err := h.DB.Exec(r.Context(), `UPDATE hosts SET live_url=NULLIF($2,'') WHERE id=$1 AND is_active`, id, url)
	if err != nil || ct.RowsAffected() == 0 {
		respondError(w, http.StatusNotFound, "host not found")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"live_url": url})
}

// StartLive serves POST /admin/live/hosts/{id}/start: the host is LIVE right away, whatever the schedule says
// (outside the shift hours, on a day off, or after "End LIVE" in the same shift - that is how a LIVE is restarted).
// The schedule itself is not touched: shift hours, working days and the next session stay as they are. The manual
// session ends with "End LIVE" or by itself after manualLiveHours.
func (h *SiteAdminHandler) StartLive(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid id")
		return
	}
	ctx := r.Context()
	x := loadHostLive(ctx, h.DB, []int32{int32(id)})[id]
	if x == nil {
		respondError(w, http.StatusNotFound, "host not found")
		return
	}
	if x.stateAt(time.Now()).Status == "live" {
		respondError(w, http.StatusConflict, "host is already LIVE")
		return
	}
	var uid *int
	if c := getClaimsSafe(r); c != nil {
		uid = &c.UserID
	}
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(ctx)
	// close sessions that ran out on their own, so there is never more than one open row per host
	if _, err := tx.Exec(ctx, `UPDATE host_live_manual SET ended_at = LEAST(now(), expires_at) WHERE host_id=$1 AND ended_at IS NULL`, id); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to start LIVE")
		return
	}
	var until time.Time
	if err := tx.QueryRow(ctx, `
		INSERT INTO host_live_manual (host_id, expires_at, started_by) VALUES ($1, now() + make_interval(hours => $2), $3) RETURNING expires_at`,
		id, manualLiveHours, uid).Scan(&until); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to start LIVE")
		return
	}
	logActivity(ctx, tx, "host", id, "live_started", uid, "manual")
	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to start LIVE")
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"status": "live", "manual": true, "until": until.Format(time.RFC3339)})
}

// EndLive serves POST /admin/live/hosts/{id}/end: the host stops being LIVE now. A manual session is closed, and the
// scheduled window that is running (if any) is marked ended too, so the same shift never switches the host back to
// LIVE by itself; the next scheduled window starts as usual. The operational live_sessions are not touched.
func (h *SiteAdminHandler) EndLive(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid id")
		return
	}
	ctx := r.Context()
	x := loadHostLive(ctx, h.DB, []int32{int32(id)})[id]
	if x == nil {
		respondError(w, http.StatusNotFound, "host not found")
		return
	}
	now := time.Now()
	st := x.stateAt(now)
	if st.Status != "live" {
		respondError(w, http.StatusConflict, "host is not LIVE right now")
		return
	}
	var uid *int
	if c := getClaimsSafe(r); c != nil {
		uid = &c.UserID
	}
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer tx.Rollback(ctx)
	if st.Manual {
		if _, err := tx.Exec(ctx, `UPDATE host_live_manual SET ended_at=now(), ended_by=$2 WHERE host_id=$1 AND ended_at IS NULL`, id, uid); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to end LIVE")
			return
		}
	}
	if w0, ok := x.Rule.current(now); ok && len(x.Rule.Ranges) > 0 {
		if _, err := tx.Exec(ctx, `INSERT INTO host_live_ends (host_id, window_start) VALUES ($1,$2) ON CONFLICT DO NOTHING`, id, w0.Start); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to end LIVE")
			return
		}
	}
	logActivity(ctx, tx, "host", id, "live_ended", uid, "manual")
	if err := tx.Commit(ctx); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to end LIVE")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ended"})
}
