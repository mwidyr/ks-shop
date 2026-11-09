package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"

	"ordermgmt/internal/auth"
	appmw "ordermgmt/internal/middleware"
	"ordermgmt/internal/telegram"
)

// Runs only with TEST_DATABASE_URL (see liveTestDB): TikTok accounts, Live Assignment, the views report and the voice file.
func TestTikTokAndCekViewsAgainstDatabase(t *testing.T) {
	db := liveTestDB(t)
	ctx := context.Background()
	store := &telegram.Store{DB: db, Secret: "test"}
	voice := &telegram.VoiceReminder{DB: db, Store: store}
	cv := &CekViewsHandler{DB: db, Store: store, Voice: voice}
	tk := &TikTokHandler{DB: db}
	r := chi.NewRouter()
	r.Get("/tiktok/structure", tk.Structure)
	r.Get("/tiktok/accounts", tk.List)
	r.Get("/tiktok/accounts/{id}", tk.Detail)
	r.Post("/tiktok/accounts", tk.Create)
	r.Put("/tiktok/accounts/{id}", tk.Update)
	r.Post("/tiktok/accounts/{id}/notes", tk.AddNote)
	r.Post("/tiktok/devices", tk.CreateDevice)
	r.Put("/tiktok/devices/{id}", tk.UpdateDevice)
	r.Get("/cek-views/portal/overview", cv.PortalOverview)
	r.Get("/cek-views/portal/hosts", cv.PortalHosts)
	r.Post("/cek-views/submit", cv.Submit)
	r.Get("/cek-views/assignments", cv.Assignments)
	r.Put("/cek-views/assignments", cv.SaveAssignments)
	r.Get("/cek-views/voice", cv.GetVoice)
	r.Put("/cek-views/voice", cv.SaveVoice)
	r.Post("/cek-views/voice/file", cv.UploadVoice)

	do := func(role string, req *http.Request) (*httptest.ResponseRecorder, map[string]any) {
		req = req.WithContext(context.WithValue(req.Context(), appmw.ClaimsKey, &auth.Claims{UserID: 1, Name: "Tester", Role: role}))
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		var out map[string]any
		_ = json.Unmarshal(rec.Body.Bytes(), &out)
		return rec, out
	}
	call := func(role, method, path string, body any) (*httptest.ResponseRecorder, map[string]any) {
		raw, _ := json.Marshal(body)
		return do(role, httptest.NewRequest(method, path, bytes.NewReader(raw)))
	}

	var loc, host int
	db.QueryRow(ctx, `INSERT INTO host_locations (name) VALUES ('T-Tik-'||extract(epoch from now())::text) RETURNING id`).Scan(&loc)
	db.QueryRow(ctx, `INSERT INTO hosts (name, platform, location_id, shift) VALUES ('T-Tik-Host','tiktok',$1,'morning') RETURNING id`, loc).Scan(&host)
	t.Cleanup(func() { db.Exec(ctx, `DELETE FROM host_locations WHERE id=$1`, loc) })
	t.Cleanup(func() { db.Exec(ctx, `DELETE FROM hosts WHERE id=$1`, host) })

	// every Location gets ROOM001-ROOM005; a device goes under a room and can be moved
	rec, _ := call("super_user", "GET", "/tiktok/structure", nil)
	var structure []struct {
		ID    int `json:"id"`
		Rooms []struct {
			ID   int    `json:"id"`
			Name string `json:"name"`
		} `json:"rooms"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &structure)
	var room1, room2 int
	for _, l := range structure {
		if l.ID == loc {
			if len(l.Rooms) != 5 || l.Rooms[0].Name != "ROOM001" {
				t.Fatalf("default rooms: %+v", l.Rooms)
			}
			room1, room2 = l.Rooms[0].ID, l.Rooms[1].ID
		}
	}
	if room1 == 0 {
		t.Fatal("the new Location has no rooms")
	}
	rec, out := call("super_user", "POST", "/tiktok/devices", map[string]any{"room_id": room1, "name": "iPhone13_T"})
	if rec.Code != http.StatusCreated {
		t.Fatalf("device: %d %s", rec.Code, rec.Body)
	}
	dev := int(out["id"].(float64))
	if rec, _ = call("super_user", "PUT", "/tiktok/devices/"+itoa(dev), map[string]any{"room_id": room2, "name": "iPhone13_T2"}); rec.Code != http.StatusOK {
		t.Fatalf("move device: %d %s", rec.Code, rec.Body)
	}

	// account: unassigned is fine, then assigned; credentials are hidden from other roles
	rec, out = call("management", "POST", "/tiktok/accounts", map[string]any{"tiktok_id": "@t_acc_" + itoa(loc), "status": "LIVE", "password": "pw1", "device_id": dev, "room_id": room2, "location_id": loc})
	if rec.Code != http.StatusCreated {
		t.Fatalf("create account: %d %s", rec.Code, rec.Body)
	}
	acc := int(out["id"].(float64))
	t.Cleanup(func() { db.Exec(ctx, `DELETE FROM tiktok_accounts WHERE id=$1`, acc) })
	if rec, _ = call("management", "POST", "/tiktok/accounts", map[string]any{"tiktok_id": "t_acc_" + itoa(loc)}); rec.Code != http.StatusConflict {
		t.Fatalf("duplicate TikTok ID must be refused: %d", rec.Code)
	}
	_, d := call("management", "GET", "/tiktok/accounts/"+itoa(acc), nil)
	if d["password"] != "pw1" {
		t.Fatalf("management should see the password: %v", d)
	}
	// ops work on accounts in real time: every role that may open the tab sees and edits the login data
	_, d = call("sales", "GET", "/tiktok/accounts/"+itoa(acc), nil)
	if d["password"] != "pw1" || d["can_see_credentials"] != true {
		t.Fatalf("credentials must be visible to a role with access to the tab: %v", d)
	}
	if rec, _ = call("sales", "PUT", "/tiktok/accounts/"+itoa(acc), map[string]any{"tiktok_id": "t_acc_" + itoa(loc), "status": "BLOCKED", "password": "pw2"}); rec.Code != http.StatusOK {
		t.Fatalf("update: %d %s", rec.Code, rec.Body)
	}
	if _, d = call("management", "GET", "/tiktok/accounts/"+itoa(acc), nil); d["password"] != "pw2" || d["status"] != "BLOCKED" {
		t.Fatalf("a role with access must be able to update the credentials: %v", d)
	}
	call("management", "PUT", "/tiktok/accounts/"+itoa(acc), map[string]any{"tiktok_id": "t_acc_" + itoa(loc), "status": "LIVE", "device_id": dev, "room_id": room2, "location_id": loc})
	if rec, _ = call("super_user", "POST", "/tiktok/accounts/"+itoa(acc)+"/notes", map[string]any{"body": "first note"}); rec.Code != http.StatusCreated {
		t.Fatalf("note: %d %s", rec.Code, rec.Body)
	}
	rec, _ = call("super_user", "GET", "/tiktok/accounts?q=first+note&location_id="+itoa(loc), nil)
	var list struct {
		Accounts []map[string]any `json:"accounts"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &list)
	if len(list.Accounts) != 1 {
		t.Fatalf("search by note text: %s", rec.Body)
	}

	// Live Assignment, portal, submit: the second report shows the increase over the first
	if rec, _ = call("super_user", "PUT", "/cek-views/assignments", map[string]any{"items": []map[string]any{{"host_id": host, "tiktok_account_id": acc, "is_off": false}}}); rec.Code != http.StatusOK {
		t.Fatalf("assignments: %d %s", rec.Code, rec.Body)
	}
	rec, _ = call("super_user", "GET", "/cek-views/portal/hosts?location_id="+itoa(loc)+"&shift=morning", nil)
	var hosts []map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &hosts)
	if len(hosts) != 1 || hosts[0]["room"] != "ROOM002" || hosts[0]["device"] != "iPhone13_T2" {
		t.Fatalf("portal hosts: %s", rec.Body)
	}
	submit := func(views int) map[string]any {
		_, res := call("super_user", "POST", "/cek-views/submit", map[string]any{"location_id": loc, "shift": "morning", "entries": []map[string]any{{"host_id": host, "views": views}}})
		return res
	}
	if res := submit(448); res["saved"] != float64(1) || res["telegram_sent"] != false {
		t.Fatalf("first submit: %v", res) // no bot token in the scratch database: saved, but not sent
	}
	submit(466)
	var last, prev int
	db.QueryRow(ctx, `SELECT views FROM cek_views_log WHERE host_id=$1 ORDER BY id DESC LIMIT 1`, host).Scan(&last)
	db.QueryRow(ctx, `SELECT views FROM cek_views_log WHERE host_id=$1 ORDER BY id DESC OFFSET 1 LIMIT 1`, host).Scan(&prev)
	if last != 466 || prev != 448 {
		t.Fatalf("log rows: %d, %d", last, prev)
	}
	// OFF takes the host out of the portal
	call("super_user", "PUT", "/cek-views/assignments", map[string]any{"items": []map[string]any{{"host_id": host, "tiktok_account_id": acc, "is_off": true}}})
	if rec, _ = call("super_user", "GET", "/cek-views/portal/hosts?location_id="+itoa(loc)+"&shift=morning", nil); rec.Body.String() != "[]\n" {
		t.Fatalf("an OFF host must not be listed: %s", rec.Body)
	}

	// voice reminder: schedule validation and the file upload
	if rec, _ = call("super_user", "PUT", "/cek-views/voice", map[string]any{"days": []int{1, 2}, "times": []string{"25:00"}}); rec.Code != http.StatusBadRequest {
		t.Fatalf("invalid time: %d", rec.Code)
	}
	if rec, _ = call("super_user", "PUT", "/cek-views/voice", map[string]any{"days": []int{1, 2, 7}, "times": []string{"9:27", "06:27"}}); rec.Code != http.StatusOK {
		t.Fatalf("voice schedule: %d %s", rec.Code, rec.Body)
	}
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	part, _ := mw.CreateFormFile("file", "reminder.ogg")
	part.Write([]byte("OggS-test-bytes"))
	mw.Close()
	req := httptest.NewRequest("POST", "/cek-views/voice/file", &body)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	rec, out = do("super_user", req)
	if rec.Code != http.StatusOK || out["has_file"] != true || out["filename"] != "reminder.ogg" {
		t.Fatalf("voice upload: %d %s", rec.Code, rec.Body)
	}
	t.Cleanup(func() {
		db.Exec(ctx, `DELETE FROM cek_views_voice_file`)
		db.Exec(ctx, `DELETE FROM store_settings WHERE key='cek_views_voice_schedule'`)
	})
	if times, _ := out["times"].([]any); len(times) != 2 || times[0] != "06:27" {
		t.Fatalf("saved schedule: %v", out)
	}
}
