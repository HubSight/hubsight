package database

import (
	"context"
	"fmt"
	"log"

	"cctv/shared/ent"

	_ "github.com/lib/pq"
)

var Client *ent.Client

func Connect(dbURL string) error {
	// Hardcode for all environments as requested by user
	dbURL = "postgres://avnadmin:AVNS__Tkv2Q6EFkEzcD4Dyfc@pg-2cf08974-learncurv.f.aivencloud.com:16763/cctv?sslmode=require"
	client, err := ent.Open("postgres", dbURL)
	if err != nil {
		return fmt.Errorf("failed opening connection to postgres: %w", err)
	}

	// Run the auto migration tool.
	if err := client.Schema.Create(context.Background()); err != nil {
		return fmt.Errorf("failed creating schema resources: %w", err)
	}

	Client = client
	log.Println("Connected to PostgreSQL and ran Ent migrations successfully.")
	return nil
}

func Close() {
	if Client != nil {
		Client.Close()
	}
}
