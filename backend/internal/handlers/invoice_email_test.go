package handlers

import "testing"

func TestValidInvoiceEmail(t *testing.T) {
	for in, want := range map[string]bool{
		"": true, "a@b.co": true, "diah.w+inv@mail.example.com": true,
		"no-at.com": false, "a@b": false, "a b@c.com": false, "<x>@c.com": false, "a@b.com,c@d.com": false,
	} {
		if got := validInvoiceEmail(in); got != want {
			t.Errorf("%q: got %v, want %v", in, got, want)
		}
	}
}
