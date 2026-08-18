package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"cctv/internal/config"
	"cctv/internal/database"
	"cctv/internal/recorder"
	"cctv/internal/storage"
)

func main() {
	cfg := config.Load()

	if err := database.Connect(cfg.DatabaseURL); err != nil {
		log.Fatalf("Database connection failed: %v", err)
	}
	defer database.Close()

	if err := storage.ConnectS3(cfg.S3Endpoint, cfg.S3AccessKey, cfg.S3SecretKey, cfg.S3Bucket, cfg.S3UseSSL); err != nil {
		log.Fatalf("S3 connection failed: %v", err)
	}

	outDir := "/data/camera"
	if envOut := os.Getenv("OUT_DIR"); envOut != "" {
		outDir = envOut
	}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	// Launch 7-day retention worker (purging archives older than 6 days)
	storage.StartRetentionWorker(ctx)

	manager := recorder.NewManager(outDir)
	manager.Start(ctx)
}
