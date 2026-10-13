package auth

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Member sessions (website customers) are signed with a key derived from the staff secret so a staff JWT can
// never be a member token and vice versa, even though both come from the same JWT_SECRET.
func memberKey(secret string) []byte { return []byte(secret + "|ralulu-member") }

type MemberClaims struct {
	MemberID int    `json:"member_id"`
	Typ      string `json:"typ"`
	jwt.RegisteredClaims
}

func GenerateMemberToken(secret string, memberID int) (string, error) {
	c := MemberClaims{MemberID: memberID, Typ: "member", RegisteredClaims: jwt.RegisteredClaims{
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(90 * 24 * time.Hour)), IssuedAt: jwt.NewNumericDate(time.Now()),
	}}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, c).SignedString(memberKey(secret))
}

func ParseMemberToken(secret, raw string) (*MemberClaims, error) {
	t, err := jwt.ParseWithClaims(raw, &MemberClaims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return memberKey(secret), nil
	})
	if err != nil {
		return nil, err
	}
	c, ok := t.Claims.(*MemberClaims)
	if !ok || !t.Valid || c.Typ != "member" || c.MemberID == 0 {
		return nil, errors.New("invalid member token")
	}
	return c, nil
}
