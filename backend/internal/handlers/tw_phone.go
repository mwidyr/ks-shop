package handlers

import (
	"net/mail"
	"regexp"
	"strings"
)

var (
	twMobilePattern = regexp.MustCompile(`^09\d{8}$`)
	phoneSeparators = strings.NewReplacer(" ", "", "-", "", "(", "", ")", "", ".", "")
)

// NormalizeTWPhone strips separators and turns the international Taiwan forms (+886912345678,
// 886912345678, 00886912345678, +886 0912...) into the local 09xxxxxxxx. Anything that is not a
// Taiwan international number only has its separators removed.
func NormalizeTWPhone(s string) string {
	p := phoneSeparators.Replace(strings.TrimSpace(s))
	for _, prefix := range []string{"+886", "00886", "886"} {
		if strings.HasPrefix(p, prefix) {
			rest := strings.TrimPrefix(p, prefix)
			rest = strings.TrimPrefix(rest, "0") // +886 0912... typed with the trunk zero as well
			if len(rest) == 9 && rest[0] == '9' {
				return "0" + rest
			}
			break
		}
	}
	return p
}

// IsTWMobile reports whether the (normalized) number is a Taiwan mobile: 10 digits starting 09.
func IsTWMobile(p string) bool { return twMobilePattern.MatchString(p) }

// validEmailAddress accepts a plain address (no display name), up to 254 characters.
func validEmailAddress(s string) bool {
	if s == "" || len(s) > 254 || strings.ContainsAny(s, " <>,;") {
		return false
	}
	a, err := mail.ParseAddress(s)
	return err == nil && a.Address == s && strings.Contains(s[strings.LastIndex(s, "@"):], ".")
}
