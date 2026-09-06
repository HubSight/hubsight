package main

import (
	"context"
	"fmt"
	"log"

	"cctv/shared/pkg/config"
	"cctv/shared/pkg/database"
	"cctv/shared/pkg/models"
)

func main() {
	cfg := config.Load()

	if err := database.Connect(cfg.DatabaseURL); err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}
	defer database.Close()

	res := database.DB.WithContext(context.Background()).Where("1 = 1").Delete(&models.PushSubscription{})
	if res.Error != nil {
		log.Fatalf("failed to delete push subscriptions: %v", res.Error)
	}
	fmt.Printf("Deleted %d push subscriptions\n", res.RowsAffected)
}
