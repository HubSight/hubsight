package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestApplyDotEnvDoesNotOverrideExisting(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, ".env")
	if err := os.WriteFile(path, []byte("DATABASE_URL=postgres://from-file/cctv\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	t.Setenv("DATABASE_URL", "postgres://from-env/cctv")
	if err := applyDotEnv(path); err != nil {
		t.Fatal(err)
	}
	if got := os.Getenv("DATABASE_URL"); got != "postgres://from-env/cctv" {
		t.Fatalf("existing env was overwritten: %s", got)
	}
}

func TestApplyDotEnvLoadsMissing(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, ".env")
	if err := os.WriteFile(path, []byte("DATABASE_URL=postgres://from-file/cctv\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	t.Setenv("DATABASE_URL", "")
	if err := os.Unsetenv("DATABASE_URL"); err != nil {
		t.Fatal(err)
	}
	if err := applyDotEnv(path); err != nil {
		t.Fatal(err)
	}
	if got := os.Getenv("DATABASE_URL"); got != "postgres://from-file/cctv" {
		t.Fatalf("expected url from .env, got %s", got)
	}
}
