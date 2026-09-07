package database

import "testing"

func TestRedactDatabaseURL(t *testing.T) {
	got := redactDatabaseURL("postgres://user:secret@example.com:5432/cctv?sslmode=require")
	if got == "postgres://user:secret@example.com:5432/cctv?sslmode=require" {
		t.Fatal("password was not redacted")
	}
	if want := "postgres://user:xxxxx@example.com:5432/cctv?sslmode=require"; got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}
