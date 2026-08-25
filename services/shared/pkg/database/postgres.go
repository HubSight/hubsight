package database

import (
	"context"
	"fmt"
	"log"
	"net/url"
	"os"

	"cctv/shared/ent"

	_ "github.com/lib/pq"
)

var Client *ent.Client

func Connect(dbURL string) error {
	if dbURL == "" {
		dbURL = os.Getenv("DATABASE_URL")
	}
	if dbURL == "" {
		return fmt.Errorf("DATABASE_URL is not set")
	}
	client, err := ent.Open("postgres", dbURL)
	if err != nil {
		return fmt.Errorf("failed opening connection to postgres: %w", err)
	}

	if err := client.Schema.Create(context.Background()); err != nil {
		return fmt.Errorf("failed creating schema resources: %w", err)
	}

	Client = client
	log.Printf("Connected to PostgreSQL (%s) and ran Ent migrations successfully.", redactDatabaseURL(dbURL))
	return nil
}

func Close() {
	if Client != nil {
		Client.Close()
	}
}

func redactDatabaseURL(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return "(unparseable DATABASE_URL)"
	}
	return u.Redacted()
}
