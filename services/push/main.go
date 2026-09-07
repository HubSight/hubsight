package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"cctv/shared/pkg/config"
	"cctv/shared/pkg/database"
	"cctv/shared/pkg/mq"
	"cctv/shared/pkg/push"
)

func main() {
	log.Println("[push-service] Starting FCM / Web Push worker...")

	cfg := config.Load()
	if err := database.Connect(cfg.DatabaseURL); err != nil {
		log.Fatalf("Database connection failed: %v", err)
	}
	defer database.Close()

	if err := mq.Init(); err != nil {
		log.Printf("RabbitMQ connection failed: %v (will retry)", err)
	} else {
		defer mq.Close()
	}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	push.Run(ctx)
	log.Println("[push-service] Stopped")
}
