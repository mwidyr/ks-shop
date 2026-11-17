package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"ordermgmt/internal/auth"
)

func TestValidMemberPassword(t *testing.T) {
	for pw, ok := range map[string]bool{"": false, "        ": false, "short1": false, "longenough": true, "密碼密碼密碼密碼": true} {
		if (validMemberPassword(pw) == nil) != ok {
			t.Errorf("%q valid=%v want %v", pw, !ok, ok)
		}
	}
	long := make([]byte, 73)
	for i := range long {
		long[i] = 'a'
	}
	if validMemberPassword(string(long)) == nil {
		t.Error("more than 72 bytes must be refused (bcrypt would silently cut it)")
	}
}

// Runs only with TEST_DATABASE_URL: register with a password, sign in, lock-out, reset by code, change password.
func TestMemberPasswordFlow(t *testing.T) {
	db := liveTestDB(t)
	ctx := context.Background()
	sfx := strconv.FormatInt(time.Now().UnixNano()%1000000000, 10)
	email := "pw-" + sfx + "@example.com"
	h := &MemberHandler{DB: db, JWTSecret: "test-secret"}
	t.Cleanup(func() {
		db.Exec(ctx, `DELETE FROM member_ledger WHERE member_id IN (SELECT id FROM members WHERE email=$1)`, email)
		db.Exec(ctx, `DELETE FROM member_coupons WHERE member_id IN (SELECT id FROM members WHERE email=$1)`, email)
		db.Exec(ctx, `DELETE FROM promotions WHERE member_id IN (SELECT id FROM members WHERE email=$1)`, email)
		db.Exec(ctx, `DELETE FROM members WHERE email=$1`, email)
		db.Exec(ctx, `DELETE FROM member_otps WHERE target=$1`, email)
	})
	post := func(fn http.HandlerFunc, body interface{}) *httptest.ResponseRecorder {
		b, _ := json.Marshal(body)
		req := httptest.NewRequest(http.MethodPost, "/x", bytes.NewReader(b))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		fn(w, req)
		return w
	}
	otp := func(code string) {
		if _, err := db.Exec(ctx, `INSERT INTO member_otps (channel, target, code_hash, expires_at) VALUES ('email',$1,$2,now()+interval '10 minutes')`, email, auth.HashToken(email+":"+code)); err != nil {
			t.Fatal(err)
		}
	}
	verify := func(code, pw string) *httptest.ResponseRecorder {
		return post(h.EmailVerify, map[string]string{"email": email, "code": code, "password": pw})
	}
	login := func(pw string) *httptest.ResponseRecorder {
		return post(h.Login, map[string]string{"email": email, "password": pw})
	}

	// registering needs a password, and a refused attempt does not use the code up
	otp("111111")
	if w := verify("111111", ""); w.Code != http.StatusBadRequest {
		t.Fatalf("a new account without a password: %d", w.Code)
	}
	if w := verify("111111", "short"); w.Code != http.StatusBadRequest {
		t.Fatalf("a short password: %d", w.Code)
	}
	w := verify("111111", "first-password")
	if w.Code != http.StatusOK {
		t.Fatalf("register: %d %s", w.Code, w.Body.String())
	}
	var reg struct {
		Token   string                 `json:"token"`
		Created bool                   `json:"created"`
		Member  map[string]interface{} `json:"member"`
	}
	json.Unmarshal(w.Body.Bytes(), &reg)
	if !reg.Created || reg.Token == "" || reg.Member["has_password"] != true {
		t.Fatalf("registered with a password: %+v", reg)
	}
	var memberID int
	db.QueryRow(ctx, `SELECT id FROM members WHERE email=$1`, email).Scan(&memberID)
	var stored string
	db.QueryRow(ctx, `SELECT password_hash FROM members WHERE id=$1`, memberID).Scan(&stored)
	if stored == "" || stored == "first-password" {
		t.Fatal("the password must be stored hashed")
	}

	// sign in
	if w := login("first-password"); w.Code != http.StatusOK || !bytes.Contains(w.Body.Bytes(), []byte(`"token"`)) {
		t.Fatalf("login: %d %s", w.Code, w.Body.String())
	}
	wrong := login("nope-nope-nope")
	unknown := post(h.Login, map[string]string{"email": "nobody-" + sfx + "@example.com", "password": "nope-nope-nope"})
	if wrong.Code != http.StatusUnauthorized || unknown.Code != http.StatusUnauthorized || wrong.Body.String() != unknown.Body.String() {
		t.Fatalf("wrong password and unknown email must look identical: %d %q / %d %q", wrong.Code, wrong.Body.String(), unknown.Code, unknown.Body.String())
	}

	// the 5th wrong password locks password sign-in, even for the right password
	for i := 0; i < memberLoginMaxFail-1; i++ {
		login("nope-nope-nope")
	}
	if w := login("first-password"); w.Code != http.StatusUnauthorized {
		t.Fatalf("locked after %d wrong passwords, got %d", memberLoginMaxFail, w.Code)
	}

	// forgot the password: the mailed code sets a new one and lifts the lock
	otp("222222")
	if w := verify("222222", "second-password"); w.Code != http.StatusOK {
		t.Fatalf("reset by code: %d %s", w.Code, w.Body.String())
	}
	if w := login("first-password"); w.Code != http.StatusUnauthorized {
		t.Fatalf("the old password must stop working, got %d", w.Code)
	}
	if w := login("second-password"); w.Code != http.StatusOK {
		t.Fatalf("new password after reset: %d", w.Code)
	}

	// change it from the profile
	change := func(cur, nw string) *httptest.ResponseRecorder {
		b, _ := json.Marshal(map[string]string{"current_password": cur, "new_password": nw})
		req := httptest.NewRequest(http.MethodPost, "/member/password", bytes.NewReader(b))
		req = req.WithContext(context.WithValue(req.Context(), memberCtxKey{}, memberID))
		rec := httptest.NewRecorder()
		h.ChangePassword(rec, req)
		return rec
	}
	if w := change("wrong-current", "third-password"); w.Code != http.StatusForbidden {
		t.Fatalf("wrong current password: %d", w.Code)
	}
	if w := change("second-password", "tiny"); w.Code != http.StatusBadRequest {
		t.Fatalf("short new password: %d", w.Code)
	}
	if w := change("second-password", "third-password"); w.Code != http.StatusOK {
		t.Fatalf("change: %d %s", w.Code, w.Body.String())
	}
	if login("second-password").Code != http.StatusUnauthorized || login("third-password").Code != http.StatusOK {
		t.Fatal("only the new password works after a change")
	}

	// a member who registered before passwords existed can set one from the session, and uses the code to sign in meanwhile
	db.Exec(ctx, `UPDATE members SET password_hash=NULL WHERE id=$1`, memberID)
	if login("third-password").Code != http.StatusUnauthorized {
		t.Fatal("no password set: password login is refused")
	}
	if w := change("", "fourth-password"); w.Code != http.StatusOK {
		t.Fatalf("set the first password: %d %s", w.Code, w.Body.String())
	}
	if login("fourth-password").Code != http.StatusOK {
		t.Fatal("login with the password just set")
	}
}
