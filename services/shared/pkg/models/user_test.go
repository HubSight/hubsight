package models

import (
	"testing"
)

func TestStringSlice_ValueAndScan(t *testing.T) {
	orig := StringSlice{"code1", "code2", "code3"}
	val, err := orig.Value()
	if err != nil {
		t.Fatalf("Value() error = %v", err)
	}

	strVal, ok := val.(string)
	if !ok {
		t.Fatalf("Value() returned %T, expected string", val)
	}

	if strVal != `["code1","code2","code3"]` {
		t.Fatalf("Value() returned unexpected JSON: %s", strVal)
	}

	var scanned StringSlice
	if err := scanned.Scan(strVal); err != nil {
		t.Fatalf("Scan(string) error = %v", err)
	}

	if len(scanned) != 3 || scanned[0] != "code1" || scanned[1] != "code2" || scanned[2] != "code3" {
		t.Fatalf("Scan(string) scanned incorrect slice: %v", scanned)
	}

	// Test nil slice
	var nilSlice StringSlice
	nilVal, err := nilSlice.Value()
	if err != nil {
		t.Fatalf("nil Value() error = %v", err)
	}
	if nilVal != "[]" {
		t.Fatalf("nil Value() expected '[]', got %v", nilVal)
	}
}
