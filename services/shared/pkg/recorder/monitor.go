package recorder

import (
	"context"
	"fmt"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"cctv/shared/pkg/recording"
	"cctv/shared/pkg/storage"

	"github.com/minio/minio-go/v7"
)

// SanitizeCameraFolder creates a clean, safe folder name combining Camera Name and Camera ID
func SanitizeCameraFolder(name, id string) string {
	clean := strings.TrimSpace(name)
	if clean == "" {
		return fmt.Sprintf("camera_%s", id)
	}

	// Replace forbidden path/url characters
	re := regexp.MustCompile(`[/\\:*?"<>|]+`)
	clean = re.ReplaceAllString(clean, "_")
	clean = strings.ReplaceAll(clean, " ", "_")
	clean = strings.Trim(clean, "_-.")

	if clean == "" {
		return fmt.Sprintf("camera_%s", id)
	}

	return fmt.Sprintf("%s_%s", clean, id)
}

// MonitorSegments continuously watches the output folder for completed MP4 segments and uploads them to S3
func MonitorSegments(ctx context.Context, cameraID, cameraName string, outDir string, segDuration int) {
	seen := make(map[string]bool)
	ticker := time.NewTicker(20 * time.Second)
	defer ticker.Stop()

	cameraFolder := SanitizeCameraFolder(cameraName, cameraID)

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			filepath.WalkDir(outDir, func(path string, d fs.DirEntry, err error) error {
				if err != nil || d.IsDir() {
					return nil
				}
				if filepath.Ext(path) != ".mp4" {
					return nil
				}

				// Only process files for this specific camera
				prefix := fmt.Sprintf("cam%s_", cameraID)
				if !strings.HasPrefix(filepath.Base(path), prefix) {
					return nil
				}

				if seen[path] {
					return nil
				}

				info, err := d.Info()
				if err != nil {
					return nil
				}

				// If file is older than segment duration, it has finished writing
				minAge := time.Duration(segDuration) * time.Second
				if time.Since(info.ModTime()) > minAge {
					seen[path] = true

					// Storage path hierarchy: Date (YYYY-MM-DD) -> Camera (Name_ID) -> Filename.mp4
					dateFolder := info.ModTime().Format("2006-01-02")
					objectKey := fmt.Sprintf("%s/%s/%s", dateFolder, cameraFolder, filepath.Base(path))

					log.Printf("[Cam %s] Uploading %s to S3 as %s", cameraID, path, objectKey)
					_, err = storage.S3Client.FPutObject(context.Background(), storage.S3Bucket, objectKey, path, minio.PutObjectOptions{
						ContentType: "video/mp4",
					})

					if err != nil {
						log.Printf("[Cam %s] Failed to upload to S3: %v", cameraID, err)
						delete(seen, path) // Retry on next loop
						return nil
					}

					// Insert metadata into DB
					if _, err := recording.Insert(context.Background(), cameraID, info.ModTime().Add(-minAge), info.ModTime(), segDuration, objectKey, "", info.Size()); err != nil {
						log.Printf("[Cam %s] Failed to insert recording metadata: %v", cameraID, err)
					} else {
						log.Printf("[Cam %s] Saved recording metadata for %s", cameraID, objectKey)
						os.Remove(path) // Clean up local temporary file
					}

					// Run storage quota check & auto cleanup
					storage.CheckQuotaAndCleanup(context.Background())
				}
				return nil
			})
		}
	}
}
