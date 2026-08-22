package main

import (
	"log"

	"cctv/shared/pkg/config"
	"cctv/shared/pkg/database"
	"cctv/shared/pkg/mq"
	"cctv/shared/pkg/nvr"
	"cctv/shared/pkg/router"
	"cctv/shared/pkg/storage"
)

func main() {
	log.Println("Starting CCTV Core Business Logic Service...")

	cfg := config.Load()

	if err := database.Connect(cfg.DatabaseURL); err != nil {
		log.Fatalf("Database connection failed: %v", err)
	}
	defer database.Close()

	if err := storage.ConnectS3(cfg.S3Endpoint, cfg.S3AccessKey, cfg.S3SecretKey, cfg.S3Bucket, cfg.S3UseSSL); err != nil {
		log.Fatalf("S3 connection failed: %v", err)
	}

	if err := mq.Init(); err != nil {
		log.Printf("RabbitMQ connection failed: %v (Real-time events may not work)", err)
	} else {
		defer mq.Close()
	}

	// Start Real-time NVR status broadcaster
	nvr.StartNvrStatusBroadcaster()

	r := router.New()

	log.Printf("CCTV Core Service listening on :%s", cfg.Port)
	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatalf("Core Service failed: %v", err)
	}
}
