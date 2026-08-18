package recorder

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
	"io/fs"

	"cctv/internal/recording"
	"cctv/internal/storage"
	"github.com/minio/minio-go/v7"
)

func StartRecording(ctx context.Context, cameraID int, rtspURL, outDir string) error {
	err := os.MkdirAll(outDir, 0755)
	if err != nil {
		return err
	}

	segmentTime := "300" // 5 minutes
	
	// Use %Y%m%d%H%M%S from ffmpeg instead of hardcoding the start date
	outPattern := filepath.Join(outDir, fmt.Sprintf("cam%d_%%Y%%m%%d_%%H%%M%%S.mp4", cameraID))

	cmd := exec.CommandContext(ctx, "ffmpeg",
		"-i", rtspURL,
		"-c", "copy",
		"-f", "segment",
		"-segment_time", segmentTime,
		"-segment_format", "mp4",
		"-reset_timestamps", "1",
		"-strftime", "1",
		outPattern,
	)

	log.Printf("Running FFmpeg: %s", strings.Join(cmd.Args, " "))
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	
	go monitorSegments(ctx, cameraID, outDir)

	if err := cmd.Run(); err != nil {
		log.Printf("FFmpeg exited with error: %v", err)
		return err
	}

	return nil
}

func monitorSegments(ctx context.Context, cameraID int, outDir string) {
	seen := make(map[string]bool)
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

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
				prefix := fmt.Sprintf("cam%d_", cameraID)
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

				// If file is older than 5 minutes, it's finished writing
				if time.Since(info.ModTime()) > 5*time.Minute {
					seen[path] = true
					
					// Object key based on date
					dateFolder := info.ModTime().Format("2006-01-02")
					objectKey := fmt.Sprintf("%s/%s", dateFolder, filepath.Base(path))
					
					log.Printf("Uploading %s to S3 as %s", path, objectKey)
					_, err = storage.S3Client.FPutObject(context.Background(), storage.S3Bucket, objectKey, path, minio.PutObjectOptions{
						ContentType: "video/mp4",
					})

					if err != nil {
						log.Printf("Failed to upload to S3: %v", err)
						delete(seen, path) // Retry next loop
						return nil
					}

					// Insert to DB
					if _, err := recording.Insert(context.Background(), int(cameraID), info.ModTime().Add(-5 * time.Minute), info.ModTime(), 300, objectKey, info.Size()); err != nil {
						log.Printf("Failed to insert recording metadata: %v", err)
					} else {
						log.Printf("Saved recording metadata for %s", objectKey)
						// Clean up local temp file
						os.Remove(path)
					}

					// Check quota after saving
					storage.CheckQuotaAndCleanup(context.Background())
				}
				return nil
			})
		}
	}
}
