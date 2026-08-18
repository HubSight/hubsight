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

type CameraConfig struct {
	CameraID        int
	Host            string
	RTSPTransport   string
	SegmentDuration int
	VideoCodec      string
	AudioMode       string
	ExtraArgs       string
	OutDir          string
}

// ProbeAudioStream checks if the RTSP stream contains an active audio track and its codec
func ProbeAudioStream(ctx context.Context, rtspURL, transport string) (bool, string) {
	probeCtx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()

	args := []string{
		"-v", "error",
		"-select_streams", "a:0",
		"-show_entries", "stream=codec_name",
		"-of", "default=noprint_wrappers=1:nokey=1",
	}
	if transport != "" && transport != "auto" {
		args = append(args, "-rtsp_transport", transport)
	}
	args = append(args, "-stimeout", "3000000", rtspURL)

	cmd := exec.CommandContext(probeCtx, "ffprobe", args...)
	out, err := cmd.Output()
	if err != nil {
		return false, ""
	}

	codec := strings.TrimSpace(string(out))
	if codec != "" {
		return true, strings.ToLower(codec)
	}
	return false, ""
}

func StartRecording(ctx context.Context, cfg CameraConfig) error {
	err := os.MkdirAll(cfg.OutDir, 0755)
	if err != nil {
		return err
	}

	segDuration := cfg.SegmentDuration
	if segDuration <= 0 {
		segDuration = 300
	}
	segmentTime := fmt.Sprintf("%d", segDuration)
	
	// Use %Y%m%d%H%M%S from ffmpeg instead of hardcoding the start date
	outPattern := filepath.Join(cfg.OutDir, fmt.Sprintf("cam%d_%%Y%%m%%d_%%H%%M%%S.mp4", cfg.CameraID))

	args := []string{}

	// RTSP Transport (default TCP)
	transport := cfg.RTSPTransport
	if transport == "" {
		transport = "tcp"
	}
	if transport != "auto" {
		args = append(args, "-rtsp_transport", transport)
	}

	// Timeout to prevent hanging connections
	args = append(args, "-stimeout", "5000000")

	// Input URL
	args = append(args, "-i", cfg.Host)

	// Video Codec
	switch cfg.VideoCodec {
	case "h264":
		args = append(args, "-c:v", "libx264", "-preset", "ultrafast")
	default:
		args = append(args, "-c:v", "copy")
	}

	// Audio Stream Handling
	if cfg.AudioMode == "disabled" || cfg.AudioMode == "none" {
		log.Printf("Cam %d: Audio disabled by configuration.", cfg.CameraID)
		args = append(args, "-an")
	} else if cfg.AudioMode == "copy" {
		args = append(args, "-c:a", "copy")
	} else if cfg.AudioMode == "aac" {
		args = append(args, "-c:a", "aac", "-b:a", "128k")
	} else {
		// Auto detect audio stream
		hasAudio, audioCodec := ProbeAudioStream(ctx, cfg.Host, transport)
		if hasAudio {
			log.Printf("Cam %d: Detected audio stream (codec: %s). Saving audio...", cfg.CameraID, audioCodec)
			if audioCodec == "aac" {
				args = append(args, "-c:a", "copy")
			} else {
				// Convert PCM / G.711 (alaw, mulaw) / others to AAC for web MP4 compatibility
				args = append(args, "-c:a", "aac", "-b:a", "128k")
			}
			args = append(args, "-map", "0:v:0", "-map", "0:a:0")
		} else {
			log.Printf("Cam %d: No audio stream detected on RTSP. Recording video only.", cfg.CameraID)
			args = append(args, "-an")
		}
	}

	// Segment output
	args = append(args,
		"-f", "segment",
		"-segment_time", segmentTime,
		"-segment_format", "mp4",
		"-reset_timestamps", "1",
		"-strftime", "1",
	)

	// Extra custom FFmpeg arguments
	if trimmed := strings.TrimSpace(cfg.ExtraArgs); trimmed != "" {
		customFields := strings.Fields(trimmed)
		args = append(args, customFields...)
	}

	// Output pattern
	args = append(args, outPattern)

	cmd := exec.CommandContext(ctx, "ffmpeg", args...)

	log.Printf("Running FFmpeg for Cam %d: %s", cfg.CameraID, strings.Join(cmd.Args, " "))
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	
	go monitorSegments(ctx, cfg.CameraID, cfg.OutDir, segDuration)

	if err := cmd.Run(); err != nil {
		log.Printf("FFmpeg exited for camera %d with error: %v", cfg.CameraID, err)
		return err
	}

	return nil
}

func monitorSegments(ctx context.Context, cameraID int, outDir string, segDuration int) {
	seen := make(map[string]bool)
	ticker := time.NewTicker(20 * time.Second)
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

				// If file is older than segment duration, it's finished writing
				minAge := time.Duration(segDuration) * time.Second
				if time.Since(info.ModTime()) > minAge {
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
					if _, err := recording.Insert(context.Background(), int(cameraID), info.ModTime().Add(-minAge), info.ModTime(), segDuration, objectKey, info.Size()); err != nil {
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
