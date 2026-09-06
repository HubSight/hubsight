package storage

import (
	"context"
	"log"

	"cctv/shared/pkg/database"
	"cctv/shared/pkg/models"
	"github.com/minio/minio-go/v7"
)

func CheckQuotaAndCleanup(ctx context.Context) error {
	var totalSize int64
	err := database.DB.WithContext(ctx).Model(&models.Recording{}).
		Select("COALESCE(SUM(size_bytes), 0)").
		Scan(&totalSize).Error

	if err != nil {
		return err
	}

	log.Printf("Storage used: %d bytes (%.2f GB)", totalSize, float64(totalSize)/(1024*1024*1024))

	// Get global settings
	var globalSettings models.Setting
	if err := database.DB.WithContext(ctx).First(&globalSettings).Error; err != nil {
		globalSettings = models.Setting{
			StorageQuotaGB: 50,
		}
	}

	thresholdBytes := int64(globalSettings.StorageQuotaGB) * 1024 * 1024 * 1024

	for totalSize > thresholdBytes {
		var rec models.Recording
		err := database.DB.WithContext(ctx).
			Order("start_at ASC").
			First(&rec).Error

		if err != nil {
			log.Printf("No oldest recording to delete: %v", err)
			break
		}

		log.Printf("Deleting old recording from S3: %s", rec.FilePath)

		err = S3Client.RemoveObject(ctx, S3Bucket, rec.FilePath, minio.RemoveObjectOptions{})
		if err != nil {
			log.Printf("Failed to delete from S3: %v", err)
			// Wait! We should break if we can't delete to avoid infinite loop
			break
		}

		// Delete from DB
		err = database.DB.WithContext(ctx).Delete(&models.Recording{}, "id = ?", rec.ID).Error
		if err != nil {
			log.Printf("Failed to delete from DB: %v", err)
			break
		}

		totalSize -= rec.SizeBytes
	}

	return nil
}
