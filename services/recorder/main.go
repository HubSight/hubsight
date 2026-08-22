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
	"cctv/shared/pkg/recorder"
	"cctv/shared/pkg/storage"
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

	if err := mq.Init(); err != nil {
		log.Printf("RabbitMQ connection failed: %v", err)
	} else {
		defer mq.Close()
	}

	outDir := "/data/camera"
	if envOut := os.Getenv("OUT_DIR"); envOut != "" {
		outDir = envOut
	}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()


	manager := recorder.NewManager(outDir)
	manager.Start(ctx)
}
