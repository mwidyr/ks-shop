package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Runs only with TEST_DATABASE_URL pointing at a scratch database with every migration applied.
func liveTestDB(t *testing.T) *pgxpool.Pool {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	pool, err := pgxpool.New(context.Background(), url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	return pool
}

func TestLiveScheduleAgainstDatabase(t *testing.T) {
	db := liveTestDB(t)
	ctx := context.Background()
	var loc, a, b int
	if err := db.QueryRow(ctx, `INSERT INTO host_locations (name) VALUES ('T-Loc-'||extract(epoch from now())::text) RETURNING id`).Scan(&loc); err != nil {
		t.Fatal(err)
	}
	db.QueryRow(ctx, `INSERT INTO hosts (name, platform, location_id, shift, live_url) VALUES ('T-Morning','tiktok',$1,'morning','https://www.tiktok.com/@a/live') RETURNING id`, loc).Scan(&a)
	db.QueryRow(ctx, `INSERT INTO hosts (name, platform, location_id) VALUES ('T-NoShift','tiktok',$1) RETURNING id`, loc).Scan(&b)

	fri := tw("2026-10-23 08:00") // Friday
	info := loadHostLive(ctx, db, []int32{int32(a), int32(b)})
	if st := liveStateAt(fri, info[a].Rule, info[a].Ended); st.Status != "live" {
		t.Fatalf("morning host on Friday 08:00: %+v", st)
	}
	if st := liveStateAt(fri, info[b].Rule, info[b].Ended); st.Status != "offline" || st.Next != nil {
		t.Fatalf("host without a shift must never be live: %+v", st)
	}
	if st := liveStateAt(tw("2026-10-24 08:00"), info[a].Rule, nil); st.Status == "live" {
		t.Fatal("Saturday is a day off by default")
	}

	// admin API: working days + an extra day off
	h := &SiteAdminHandler{DB: db}
	r := chi.NewRouter()
	r.Put("/admin/live/locations/{id}", h.SaveLiveLocation)
	r.Put("/admin/live/shifts/{shift}", h.SaveLiveShift)
	r.Put("/admin/live/hosts/{id}/url", h.SaveLiveURL)
	r.Get("/admin/live/settings", h.LiveSettings)
	call := func(method, path string, body any) *httptest.ResponseRecorder {
		raw, _ := json.Marshal(body)
		req := httptest.NewRequest(method, path, bytes.NewReader(raw))
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		return rec
	}
	if rec := call("PUT", "/admin/live/locations/"+itoa(loc), map[string]any{"work_days": []int{1, 2, 3, 4, 5, 6}, "days_off": []map[string]string{{"date": "2026-10-23", "note": "closed"}}}); rec.Code != http.StatusOK {
		t.Fatalf("save location: %d %s", rec.Code, rec.Body)
	}
	info = loadHostLive(ctx, db, []int32{int32(a)})
	if st := liveStateAt(fri, info[a].Rule, nil); st.Status == "live" {
		t.Fatal("the extra day off must stop the host being live")
	}
	if _, ok := info[a].Rule.next(fri); !ok {
		t.Fatal("a next window should exist")
	}
	if rec := call("PUT", "/admin/live/locations/"+itoa(loc), map[string]any{"work_days": []int{9}}); rec.Code != http.StatusBadRequest {
		t.Fatalf("bad weekday must be 400, got %d", rec.Code)
	}
	if rec := call("PUT", "/admin/live/shifts/evening", map[string]any{"ranges": [][]string{{"19:00", "22:00"}}}); rec.Code != http.StatusOK {
		t.Fatalf("save shift: %d %s", rec.Code, rec.Body)
	}
	if rec := call("PUT", "/admin/live/shifts/evening", map[string]any{"ranges": [][]string{{"19:00", "22:00"}, {"21:00", "23:00"}}}); rec.Code != http.StatusBadRequest {
		t.Fatalf("overlap must be 400, got %d", rec.Code)
	}
	db.Exec(ctx, `UPDATE live_shift_hours SET ranges='[]' WHERE shift='evening'`)
	if rec := call("PUT", "/admin/live/hosts/"+itoa(a)+"/url", map[string]any{"live_url": "javascript:alert(1)"}); rec.Code != http.StatusBadRequest {
		t.Fatalf("bad link must be 400, got %d", rec.Code)
	}
	if rec := call("PUT", "/admin/live/hosts/"+itoa(a)+"/url", map[string]any{"live_url": "https://www.tiktok.com/@new/live"}); rec.Code != http.StatusOK {
		t.Fatalf("save url: %d", rec.Code)
	}

	// End LIVE: only that window is suppressed
	info = loadHostLive(ctx, db, []int32{int32(a)})
	db.Exec(ctx, `UPDATE host_locations SET work_days='{0,1,2,3,4,5}' WHERE id=$1`, loc)
	db.Exec(ctx, `DELETE FROM location_days_off WHERE location_id=$1`, loc)
	info = loadHostLive(ctx, db, []int32{int32(a)})
	w, ok := info[a].Rule.current(fri)
	if !ok {
		t.Fatal("expected a live window")
	}
	db.Exec(ctx, `INSERT INTO host_live_ends (host_id, window_start) VALUES ($1,$2)`, a, w.Start)
	info = loadHostLive(ctx, db, []int32{int32(a)})
	if st := liveStateAt(fri, info[a].Rule, info[a].Ended); st.Status == "live" {
		t.Fatal("ended window must not be live")
	}
	if st := liveStateAt(tw("2026-10-23 13:30"), info[a].Rule, info[a].Ended); st.Status != "live" {
		t.Fatal("the afternoon window must start by itself")
	}

	rec := call("GET", "/admin/live/settings", nil)
	var out struct {
		Shifts []liveShiftDTO `json:"shifts"`
		Hosts  []liveHostDTO  `json:"hosts"`
	}
	if rec.Code != http.StatusOK || json.Unmarshal(rec.Body.Bytes(), &out) != nil || len(out.Shifts) != 3 {
		t.Fatalf("settings: %d %s", rec.Code, rec.Body)
	}
	found := false
	for _, x := range out.Hosts {
		if x.ID == a && x.LiveURL == "https://www.tiktok.com/@new/live" && x.Shift == "morning" {
			found = true
		}
	}
	if !found {
		t.Fatal("host row missing from settings")
	}

	// website cards: watch_url is the saved link, no viewers/replays, live hosts first
	site := &SiteHandler{DB: db}
	cards := []siteHostCard{{ID: b}, {ID: a}}
	site.applyLiveSchedule(ctx, cards, tw("2026-10-23 13:30"))
	if cards[0].ID != a || cards[0].LiveStatus != "live" || cards[0].WatchURL != "https://www.tiktok.com/@new/live" || cards[0].ViewerCount != nil {
		t.Fatalf("cards: %+v", cards)
	}
	// public endpoints still run on the real schema and only expose live + scheduled
	db.Exec(ctx, `UPDATE hosts SET is_public=true, slug='t-morning-host' WHERE id=$1`, a)
	rec = httptest.NewRecorder()
	site.Live(rec, httptest.NewRequest("GET", "/public/store/live", nil))
	var pub map[string]json.RawMessage
	if rec.Code != http.StatusOK || json.Unmarshal(rec.Body.Bytes(), &pub) != nil {
		t.Fatalf("live: %d %s", rec.Code, rec.Body)
	}
	if len(pub) != 2 || pub["live"] == nil || pub["scheduled"] == nil {
		t.Fatalf("live payload keys: %v", pub)
	}
	rec = httptest.NewRecorder()
	site.Hosts(rec, httptest.NewRequest("GET", "/public/store/hosts", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("hosts: %d", rec.Code)
	}
	_ = time.Now
	db.Exec(ctx, `DELETE FROM hosts WHERE id = ANY($1)`, []int32{int32(a), int32(b)})
	db.Exec(ctx, `DELETE FROM host_locations WHERE id=$1`, loc)
}
