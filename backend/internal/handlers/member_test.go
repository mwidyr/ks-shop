package handlers

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"reflect"
	"testing"

	"ordermgmt/internal/auth"
)

func TestCanonicalPhone(t *testing.T) {
	cases := []struct{ country, in, want string }{
		{"886", "0912 345 678", "886912345678"},
		{"886", "+886 912-345-678", "886912345678"},
		{"886", "886912345678", "886912345678"},
		{"886", "912345678", "886912345678"},
		{"62", "0822-2005-6883", "6282220056883"},
		{"", "0912345678", "886912345678"},
		{"886", "00886912345678", "886912345678"},
		{"886", "12", ""},
		{"886", "", ""},
		{"886", "abc", ""},
	}
	for _, c := range cases {
		if got := CanonicalPhone(c.country, c.in); got != c.want {
			t.Errorf("CanonicalPhone(%q,%q) = %q, want %q", c.country, c.in, got, c.want)
		}
	}
}

func TestPhoneVariantsCoverStoredForms(t *testing.T) {
	v := phoneVariants("886912345678")
	for _, want := range []string{"886912345678", "+886912345678", "0912345678"} {
		found := false
		for _, x := range v {
			found = found || x == want
		}
		if !found {
			t.Errorf("phoneVariants missing %q: %v", want, v)
		}
	}
}

func TestPlanWalletUse(t *testing.T) {
	// balance first, then points; never more than payable or than held
	u := planWalletUse(1180, 100, 50, 1, true, true)
	if u.Balance != 100 || u.Points != 50 || u.PointsValue != 50 || u.Total() != 150 {
		t.Errorf("unexpected plan %+v", u)
	}
	if u := planWalletUse(80, 100, 50, 1, true, true); u.Balance != 80 || u.Points != 0 || u.Total() != 80 {
		t.Errorf("balance must be clamped to payable, got %+v", u)
	}
	if u := planWalletUse(100, 30, 500, 1, true, true); u.Balance != 30 || u.Points != 70 || u.Total() != 100 {
		t.Errorf("points fill the rest, got %+v", u)
	}
	if u := planWalletUse(100, 30, 500, 2, false, true); u.Balance != 0 || u.Points != 50 || u.PointsValue != 100 {
		t.Errorf("point value 2: 50 points pay 100, got %+v", u)
	}
	if u := planWalletUse(100, 0, 0, 1, true, true); u.Total() != 0 {
		t.Errorf("empty wallet uses nothing, got %+v", u)
	}
	if u := planWalletUse(100, 50, 50, 1, false, false); u.Total() != 0 {
		t.Errorf("nothing requested, nothing used, got %+v", u)
	}
	if u := planWalletUse(-5, 50, 50, 1, true, true); u.Total() != 0 {
		t.Errorf("negative payable uses nothing, got %+v", u)
	}
}

func TestEarnPoints(t *testing.T) {
	if got := earnPoints(1180, 1); got != 11 {
		t.Errorf("1180 at 1/100 = %d, want 11", got)
	}
	if earnPoints(99, 1) != 0 || earnPoints(0, 1) != 0 || earnPoints(500, 0) != 0 || earnPoints(-10, 1) != 0 {
		t.Error("no points below 100 / zero / negative / rate 0")
	}
	if got := earnPoints(1000, 2.5); got != 25 {
		t.Errorf("2.5 per 100 on 1000 = %d, want 25", got)
	}
}

func TestVerifyCloudSignature(t *testing.T) {
	body := []byte(`{"entry":[]}`)
	mac := hmac.New(sha256.New, []byte("s3cret"))
	mac.Write(body)
	good := "sha256=" + hex.EncodeToString(mac.Sum(nil))
	if !VerifyCloudSignature("s3cret", body, good) {
		t.Error("valid signature rejected")
	}
	if VerifyCloudSignature("other", body, good) || VerifyCloudSignature("s3cret", []byte("x"), good) || VerifyCloudSignature("s3cret", body, "sha256=zz") || VerifyCloudSignature("s3cret", body, "") {
		t.Error("tampered / wrong-secret / malformed signature accepted")
	}
	if VerifyCloudSignature("", body, good) {
		t.Error("an empty secret must never verify")
	}
}

func TestParseCloudWebhook(t *testing.T) {
	payload := `{"entry":[{"changes":[{"value":{"messages":[
		{"from":"886912345678","type":"text","text":{"body":"ralulu 123456"}},
		{"from":"886900000000","type":"image"}]}}]}]}`
	got := parseCloudWebhook([]byte(payload))
	want := []inboundWA{{From: "886912345678", Text: "ralulu 123456"}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("parseCloudWebhook = %+v, want %+v", got, want)
	}
	if parseCloudWebhook([]byte("not json")) != nil {
		t.Error("garbage must yield nothing")
	}
}

func TestCodeInText(t *testing.T) {
	cases := map[string][]string{
		"ralulu 123456":             {"123456"},
		"Kode: 654321 terima kasih": {"654321"},
		"123456789":                 nil, // 9 digits is not a code
		"12 34 56":                  nil,
		"a123456b 000111":           {"123456", "000111"},
		"":                          nil,
	}
	for in, want := range cases {
		if got := codeInText(in); !reflect.DeepEqual(got, want) {
			t.Errorf("codeInText(%q) = %v, want %v", in, got, want)
		}
	}
}

func TestMemberTokenIsolation(t *testing.T) {
	tok, err := auth.GenerateMemberToken("secret", 7)
	if err != nil {
		t.Fatal(err)
	}
	c, err := auth.ParseMemberToken("secret", tok)
	if err != nil || c.MemberID != 7 {
		t.Fatalf("round trip failed: %v %+v", err, c)
	}
	if _, err := auth.ParseMemberToken("other", tok); err == nil {
		t.Error("a token signed with another secret must fail")
	}
	// a staff token must never be accepted as a member token, and a member token must not parse as staff
	staff, _ := auth.GenerateToken("secret", 1, "S", "s@x", "super_user", nil)
	if _, err := auth.ParseMemberToken("secret", staff); err == nil {
		t.Error("staff token accepted as member token")
	}
	if _, err := auth.ParseToken("secret", tok); err == nil {
		t.Error("member token accepted as staff token")
	}
}

func TestNewReferralCode(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 200; i++ {
		c := newReferralCode()
		if len(c) != 8 {
			t.Fatalf("code %q has length %d", c, len(c))
		}
		for _, r := range c {
			if r == '0' || r == 'O' || r == '1' || r == 'I' {
				t.Fatalf("ambiguous character in %q", c)
			}
		}
		seen[c] = true
	}
	if len(seen) < 190 {
		t.Errorf("codes collide too much: %d unique of 200", len(seen))
	}
}
