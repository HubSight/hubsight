package storage

import (
	"context"
	"log"
	"time"

	"cctv/ent"
	"cctv/ent/recording"
	"cctv/internal/database"
	"github.com/minio/minio-go/v7"
)

const (
	// RetentionPeriod defines the age beyond which archives are purged (6 days)
	RetentionPeriod = 6 * 24 * time.Hour
	// CleanupInterval defines how frequently the retention purge routine executes (every 7 days)
	CleanupInterval = 7 * 24 * time.Hour
)

// LastCleanupStats tracks the latest retention execution telemetry
type RetentionStats struct {
	LastRun      time.Time `json:"last_run"`
	DeletedCount int       `json:"deleted_count"`
	FreedBytes   int64     `json:"freed_bytes"`
}

var CurrentRetentionStats RetentionStats

// CleanupOldArchives scans for and deletes all recordings older than 6 days from S3 and Ent DB
func CleanupOldArchives(ctx context.Context) (int, int64, error) {
	cutoff := time.Now().Add(-RetentionPeriod)
	log.Printf("[Retention Worker] Scanning for archives older than 6 days (cutoff: %s)...", cutoff.Format(time.RFC3339))

	oldRecordings, err := database.Client.Recording.Query().
		Where(recording.StartAtLT(cutoff)).
		Order(ent.Asc(recording.FieldStartAt)).
		All(ctx)

	if err != nil {
		log.Printf("[Retention Worker] Error querying old recordings: %v", err)
		return 0, 0, err
	}

	if len(oldRecordings) == 0 {
		log.Printf("[Retention Worker] Retention check complete: 0 expired recordings found (>6 days old).")
		CurrentRetentionStats = RetentionStats{
			LastRun:      time.Now(),
			DeletedCount: 0,
			FreedBytes:   0,
		}
		return 0, 0, nil
	}

	deletedCount := 0
	var freedBytes int64 = 0

	for _, rec := range oldRecordings {
		// 1. Delete file from S3 / MinIO
		err := S3Client.RemoveObject(ctx, S3Bucket, rec.FilePath, minio.RemoveObjectOptions{})
		if err != nil {
			log.Printf("[Retention Worker] Warning: Failed to remove %s from S3: %v (skipping DB record)", rec.FilePath, err)
			continue
		}

		// 2. Delete metadata row from Database
		if err := database.Client.Recording.DeleteOne(rec).Exec(ctx); err != nil {
			log.Printf("[Retention Worker] Warning: Failed to remove DB record for %s (ID: %d): %v", rec.FilePath, rec.ID, err)
			continue
		}

		deletedCount++
		freedBytes += rec.SizeBytes
	}

	log.Printf("[Retention Worker] Purge finished: Removed %d expired recordings (>6 days old), freed %.2f MB (%.2f GB).",
		deletedCount, float64(freedBytes)/(1024*1024), float64(freedBytes)/(1024*1024*1024))

	CurrentRetentionStats = RetentionStats{
		LastRun:      time.Now(),
		DeletedCount: deletedCount,
		FreedBytes:   freedBytes,
	}

	return deletedCount, freedBytes, nil
}

// StartRetentionWorker launches a background worker that executes archive retention on startup and every 7 days
func StartRetentionWorker(ctx context.Context) {
	go func() {
		// Initial check 10 seconds after system boot
		time.Sleep(10 * time.Second)
		log.Printf("[Retention Worker] Performing initial 6-day archive retention audit...")
		_, _, _ = CleanupOldArchives(ctx)

		ticker := time.NewTicker(CleanupInterval)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				log.Printf("[Retention Worker] Triggering scheduled 7-day archive cleanup...")
				_, _, _ = CleanupOldArchives(ctx)
			case <-ctx.Done():
				log.Printf("[Retention Worker] Retention worker gracefully terminated.")
				return
			}
		}
	}()
}
