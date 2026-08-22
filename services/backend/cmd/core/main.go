package main

import (
	"log"

	"cctv/internal/config"
	"cctv/internal/database"
	"cctv/internal/mq"
	"cctv/internal/router"
	"cctv/internal/storage"
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

	r := router.New()

	log.Printf("CCTV Core Service listening on :%s", cfg.Port)
	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatalf("Core Service failed: %v", err)
	}
}
