package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math/big"
)

// NewRawToken generates a random token to embed in an emailed link (invite / reset password).
// Only its hash (see HashToken) is ever stored - the raw value exists solely in the email.
func NewRawToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// NewOTPCode generates a random 6-digit numeric code (zero-padded, e.g. "042817") for
// email-based login - short enough to type by hand, unlike NewRawToken's link tokens.
func NewOTPCode() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(1000000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", n.Int64()), nil
}

func HashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}
