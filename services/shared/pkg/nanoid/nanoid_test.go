package nanoid

import "testing"

func TestNewProducesURLSafeNanoIDs(t *testing.T) {
	seen := make(map[string]struct{})
	for range 1_000 {
		id := New()
		if len(id) != Size {
			t.Fatalf("length = %d, want %d", len(id), Size)
		}
		for _, character := range id {
			if !contains(character) {
				t.Fatalf("ID %q includes a character outside the Nano ID alphabet", id)
			}
		}
		if _, exists := seen[id]; exists {
			t.Fatalf("duplicate Nano ID %q", id)
		}
		seen[id] = struct{}{}
	}
}

func contains(character rune) bool {
	for _, allowed := range alphabet {
		if allowed == character {
			return true
		}
	}
	return false
}
