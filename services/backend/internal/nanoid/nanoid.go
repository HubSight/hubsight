// Package nanoid creates Nano ID values for database primary keys.
package nanoid

import (
	"crypto/rand"
	"fmt"
)

const (
	// Size is the standard Nano ID length.
	Size = 21

	// alphabet is Nano ID's URL-safe default alphabet.
	alphabet = "_-0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
)

// New returns a cryptographically random, URL-safe Nano ID.
//
// The alphabet has 64 characters, so each random byte supplies six unbiased
// bits for one output character.
func New() string {
	bytes := make([]byte, Size)
	if _, err := rand.Read(bytes); err != nil {
		panic(fmt.Errorf("generate nano id: %w", err))
	}

	id := make([]byte, Size)
	for i, b := range bytes {
		id[i] = alphabet[b&63]
	}
	return string(id)
}
