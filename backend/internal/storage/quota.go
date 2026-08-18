package storage

import (
	"context"
	"log"

	"cctv/ent"
	"cctv/ent/recording"
	"cctv/internal/database"
	"github.com/minio/minio-go/v7"
)

const (
	ThresholdBytes = 47 * 1024 * 1024 * 1024 // 47 GB
)

func CheckQuotaAndCleanup(ctx context.Context) error {
	var v []struct {
		Sum int64 `json:"sum"`
	}
	err := database.Client.Recording.Query().
		Aggregate(
			ent.Sum(recording.FieldSizeBytes),
		).
		Scan(ctx, &v)

	if err != nil {
		return err
	}
	
	var totalSize int64 = 0
	if len(v) > 0 {
		totalSize = v[0].Sum
	}

	log.Printf("Storage used: %d bytes (%.2f GB)", totalSize, float64(totalSize)/(1024*1024*1024))

	for totalSize > ThresholdBytes {
		rec, err := database.Client.Recording.Query().
			Order(ent.Asc(recording.FieldStartAt)).
			First(ctx)
			
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
		err = database.Client.Recording.DeleteOne(rec).Exec(ctx)
		if err != nil {
			log.Printf("Failed to delete from DB: %v", err)
			break
		}
		
		totalSize -= rec.SizeBytes
	}
	
	return nil
}
