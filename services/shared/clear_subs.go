package main

import (
	"context"
	"fmt"
	"log"

	"cctv/shared/pkg/config"
	"cctv/shared/pkg/database"
)

func main() {
	cfg := config.Load()

	if err := database.Connect(cfg.DatabaseURL); err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}
	defer database.Close()

	deleted, err := database.Client.PushSubscription.Delete().Exec(context.Background())
	if err != nil {
		log.Fatalf("failed to delete push subscriptions: %v", err)
	}
	fmt.Printf("Deleted %d push subscriptions\n", deleted)
}
