package storage

import (
	"context"
	"log"
	"time"

	"cctv/ent"
	"cctv/ent/recording"
	"cctv/ent/setting"
	"cctv/internal/database"
	"github.com/minio/minio-go/v7"
)

const (
	// CleanupInterval defines how frequently the retention purge routine executes (every 1 day)
	CleanupInterval = 24 * time.Hour
)

// LastCleanupStats tracks the latest retention execution telemetry
type RetentionStats struct {
	LastRun      time.Time `json:"last_run"`
	DeletedCount int       `json:"deleted_count"`
	FreedBytes   int64     `json:"freed_bytes"`
}

var CurrentRetentionStats RetentionStats

// CleanupOldArchives scans for and deletes all recordings older than retention days from S3 and Ent DB
func CleanupOldArchives(ctx context.Context) (int, int64, error) {
	globalSettings, err := database.Client.Setting.Query().Where(setting.ID("global")).Only(ctx)
	if err != nil {
		globalSettings = &ent.Setting{
			RetentionDays: 4,
		}
	}

	retentionPeriod := time.Duration(globalSettings.RetentionDays) * 24 * time.Hour
	cutoff := time.Now().Add(-retentionPeriod)
	log.Printf("[Retention Worker] Scanning for archives older than %d days (cutoff: %s)...", globalSettings.RetentionDays, cutoff.Format(time.RFC3339))

	oldRecordings, err := database.Client.Recording.Query().
		Where(recording.StartAtLT(cutoff)).
		Order(ent.Asc(recording.FieldStartAt)).
		All(ctx)

	if err != nil {
		log.Printf("[Retention Worker] Error querying old recordings: %v", err)
		return 0, 0, err
	}

	if len(oldRecordings) == 0 {
		log.Printf("[Retention Worker] Retention check complete: 0 expired recordings found (>%d days old).", globalSettings.RetentionDays)
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

	log.Printf("[Retention Worker] Purge finished: Removed %d expired recordings (>%d days old), freed %.2f MB (%.2f GB).",
		deletedCount, globalSettings.RetentionDays, float64(freedBytes)/(1024*1024), float64(freedBytes)/(1024*1024*1024))

	CurrentRetentionStats = RetentionStats{
		LastRun:      time.Now(),
		DeletedCount: deletedCount,
		FreedBytes:   freedBytes,
	}

	return deletedCount, freedBytes, nil
}


// CleanupAllArchives scans for and deletes ALL recordings from S3 and Ent DB
func CleanupAllArchives(ctx context.Context) (int, int64, error) {
	log.Printf("[Retention Worker] Manual trigger: Scanning for ALL archives to delete...")

	allRecordings, err := database.Client.Recording.Query().
		Order(ent.Asc(recording.FieldStartAt)).
		All(ctx)

	if err != nil {
		log.Printf("[Retention Worker] Error querying all recordings: %v", err)
		return 0, 0, err
	}

	if len(allRecordings) == 0 {
		log.Printf("[Retention Worker] Cleanup complete: 0 recordings found.")
		return 0, 0, nil
	}

	deletedCount := 0
	var freedBytes int64 = 0

	for _, rec := range allRecordings {
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

	log.Printf("[Retention Worker] Manual Purge finished: Removed %d recordings, freed %.2f MB (%.2f GB).",
		deletedCount, float64(freedBytes)/(1024*1024), float64(freedBytes)/(1024*1024*1024))

	// Also update stats so the UI can reflect it immediately
	CurrentRetentionStats = RetentionStats{
		LastRun:      time.Now(),
		DeletedCount: deletedCount,
		FreedBytes:   freedBytes,
	}

	return deletedCount, freedBytes, nil
}
