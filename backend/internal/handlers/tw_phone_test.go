package handlers

import "testing"

func TestNormalizeTWPhone(t *testing.T) {
	cases := map[string]string{
		"+886912345678":     "0912345678",
		"+886 912 345 678":  "0912345678",
		"+886-0912-345-678": "0912345678",
		"886912345678":      "0912345678",
		"00886912345678":    "0912345678",
		"0912345678":        "0912345678",
		"0912-345-678":      "0912345678",
		"(0912) 345 678":    "0912345678",
		"+6281234567890":    "+6281234567890",
		"+886212345678":     "+886212345678", // landline, not a mobile: left alone
	}
	for in, want := range cases {
		if got := NormalizeTWPhone(in); got != want {
			t.Errorf("NormalizeTWPhone(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestIsTWMobile(t *testing.T) {
	for p, want := range map[string]bool{"0912345678": true, "0812345678": false, "091234567": false, "09123456789": false, "+886912345678": false, "09123a5678": false} {
		if IsTWMobile(p) != want {
			t.Errorf("IsTWMobile(%q) = %v, want %v", p, !want, want)
		}
	}
}

func TestValidEmailAddress(t *testing.T) {
	for e, want := range map[string]bool{"nick77998@gmail.com": true, "a.b+c@mail.co.tw": true, "no-at.com": false, "a@b": false, "a b@c.com": false, "Name <a@b.com>": false, "": false, "a@b.com,c@d.com": false} {
		if validEmailAddress(e) != want {
			t.Errorf("validEmailAddress(%q) = %v, want %v", e, !want, want)
		}
	}
}
