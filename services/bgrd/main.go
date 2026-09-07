package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"cctv/shared/pkg/config"
	"cctv/shared/pkg/database"
	"cctv/shared/pkg/storage"
	"cctv/shared/pkg/worker"
	"github.com/hibiken/asynq"
)

func main() {
	cfg := config.Load()

	// 1. Initialize dependencies (DB and Storage)
	log.Println("[bgrd-service] Initializing database...")
	if err := database.Connect(cfg.DatabaseURL); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}

	log.Println("[bgrd-service] Initializing S3 storage...")
	if err := storage.ConnectS3(cfg.S3Endpoint, cfg.S3AccessKey, cfg.S3SecretKey, cfg.S3Bucket, cfg.S3UseSSL); err != nil {
		log.Fatalf("Failed to initialize S3 storage: %v", err)
	}

	// 2. Setup Redis connection
	redisAddr := os.Getenv("REDIS_URL")
	if redisAddr == "" {
		redisAddr = "redis://localhost:6379" // fallback for local dev
	}

	// Parse redis URL
	opt, err := asynq.ParseRedisURI(redisAddr)
	if err != nil {
		log.Fatalf("Failed to parse redis URI: %v", err)
	}

	redisOpt := opt.(asynq.RedisClientOpt)

	// 3. Start Asynq Scheduler (Cron)
	scheduler := asynq.NewScheduler(redisOpt, &asynq.SchedulerOpts{
		Location: time.Local,
	})

	task, err := worker.NewArchiveCleanupTask()
	if err != nil {
		log.Fatalf("Failed to create task: %v", err)
	}

	// Register cron: every 24 hours
	entryID, err := scheduler.Register("@every 24h", task)
	if err != nil {
		log.Fatalf("Failed to register task in scheduler: %v", err)
	}
	log.Printf("[bgrd-service] Registered cron task %s with ID: %s", task.Type(), entryID)

	if err := scheduler.Start(); err != nil {
		log.Fatalf("Failed to start scheduler: %v", err)
	}
	defer scheduler.Shutdown()

	// 4. Start Asynq Server (Worker)
	srv := asynq.NewServer(
		redisOpt,
		asynq.Config{
			Concurrency: 5,
			Queues: map[string]int{
				"default": 10,
			},
		},
	)

	mux := asynq.NewServeMux()
	mux.HandleFunc(worker.TypeArchiveCleanup, worker.HandleArchiveCleanupTask)

	log.Println("[bgrd-service] Starting Asynq worker server...")
	go func() {
		if err := srv.Run(mux); err != nil {
			log.Fatalf("Failed to start worker server: %v", err)
		}
	}()

	// Also perform an initial cleanup on startup just like the old logic
	log.Println("[bgrd-service] Performing initial archive cleanup...")
	go func() {
		time.Sleep(5 * time.Second)
		storage.CleanupOldArchives(context.Background())
	}()

	// Wait for termination signal
	sigs := make(chan os.Signal, 1)
	signal.Notify(sigs, syscall.SIGINT, syscall.SIGTERM)
	<-sigs

	log.Println("[bgrd-service] Shutting down gracefully...")
	srv.Stop()
}
