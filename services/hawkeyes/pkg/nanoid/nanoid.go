package nanoid

import (
	"crypto/rand"
	"encoding/base32"
)

func New() string {
	b := make([]byte, 10)
	if _, err := rand.Read(b); err != nil {
		return "job"
	}
	return base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(b)
}
