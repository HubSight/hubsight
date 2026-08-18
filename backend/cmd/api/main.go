package main

import (
	"log"
	"context"
	
	"cctv/internal/auth"
	"cctv/internal/config"
	"cctv/internal/database"
	"cctv/internal/storage"
	"cctv/internal/router"
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
	
	// Ensure default user exists (admin:123Qwe!@)
	auth.CreateInitialUser(context.Background(), "admin", "123Qwe!@")

	r := router.New()

	log.Printf("Starting API server on %s", cfg.Port)
	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
