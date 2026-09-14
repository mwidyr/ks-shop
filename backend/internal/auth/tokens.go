package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
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

func HashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}
