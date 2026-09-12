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

	"cctv/shared/pkg/recording"
	"cctv/shared/pkg/storage"

	"github.com/minio/minio-go/v7"
)

// RunFFmpegProcess prepares arguments and executes the FFmpeg recording process
func RunFFmpegProcess(ctx context.Context, cfg CameraConfig) error {
	err := os.MkdirAll(cfg.OutDir, 0755)
	if err != nil {
		return err
	}

	segDuration := cfg.SegmentDuration
	if segDuration <= 0 {
		segDuration = 1800 // Default to 30 minutes
	}
	segmentTime := fmt.Sprintf("%d", segDuration)
	outPattern := filepath.Join(cfg.OutDir, fmt.Sprintf("cam%s_%%Y%%m%%d_%%H%%M%%S.mp4", cfg.CameraID))

	args := []string{}

	// RTSP Transport
	transport := cfg.RTSPTransport
	if transport == "" || transport == "auto" {
		transport = "tcp"
	}
	args = append(args, "-rtsp_transport", transport)

	// Connection and analysis timeouts
	args = append(args, "-timeout", "5000000", "-analyzeduration", "10000000", "-probesize", "10000000")

	// RTSP Input URL
	args = append(args, "-i", cfg.Host)

	// Video Codec & Quality Settings
	// standard: 1280x720 (720p) at 15fps
	// hd: 1920x1080 (1080p) at 30fps
	if cfg.RecordQuality == "hd" {
		args = append(args, "-c:v", "libx264", "-preset", "ultrafast", "-s", "1920x1080", "-r", "30", "-b:v", "3.5M")
	} else {
		args = append(args, "-c:v", "libx264", "-preset", "ultrafast", "-s", "1280x720", "-r", "15", "-b:v", "1.5M")
	}

	// Audio Handling
	switch cfg.AudioMode {
	case "disabled", "none":
		log.Printf("[Cam %s] Audio disabled by configuration.", cfg.CameraID)
		args = append(args, "-an")
	case "copy":
		args = append(args, "-c:a", "copy")
	case "aac":
		args = append(args, "-c:a", "aac", "-b:a", "128k")
	default:
		// Auto detect audio stream
		hasAudio, audioCodec := ProbeAudioStream(ctx, cfg.Host, transport)
		if hasAudio {
			log.Printf("[Cam %s] Detected audio stream (codec: %s). Recording audio...", cfg.CameraID, audioCodec)
			if audioCodec == "aac" {
				args = append(args, "-c:a", "copy")
			} else {
				args = append(args, "-c:a", "aac", "-b:a", "128k")
			}
			args = append(args, "-map", "0:v:0", "-map", "0:a:0")
		} else {
			log.Printf("[Cam %s] No audio stream detected. Recording video only.", cfg.CameraID)
			args = append(args, "-an")
		}
	}

	// Output segmentation aligned to clock time (30-minute intervals aligned to real time)
	args = append(args,
		"-f", "segment",
		"-segment_time", segmentTime,
		"-segment_atclocktime", "1",
		"-segment_format", "mp4",
		"-reset_timestamps", "1",
		"-strftime", "1",
	)

	// Custom Extra arguments
	if trimmed := strings.TrimSpace(cfg.ExtraArgs); trimmed != "" {
		args = append(args, strings.Fields(trimmed)...)
	}

	// Target output file pattern
	args = append(args, outPattern)

	cmd := exec.CommandContext(ctx, "ffmpeg", args...)
	log.Printf("[Cam %s] Running FFmpeg: %s", cfg.CameraID, strings.Join(cmd.Args, " "))
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	// Start background segment monitor
	go MonitorSegments(ctx, cfg.CameraID, cfg.Name, cfg.OutDir, segDuration)

	if err := cmd.Run(); err != nil {
		log.Printf("[Cam %s] FFmpeg exited with error: %v", cfg.CameraID, err)
		return err
	}

	return nil
}

// StartContinuousBuffer runs a background FFmpeg process that maintains a 60-second rolling buffer (six 10-second segments)
func StartContinuousBuffer(ctx context.Context, cameraID string) error {
	bufferDir := fmt.Sprintf("/tmp/nvr_buffer/cam_%s", cameraID)
	os.MkdirAll(bufferDir, 0755)

	rtspBase := os.Getenv("MEDIA_RTSP_BASE")
	if rtspBase == "" {
		rtspBase = "rtsp://webrtc-service:554/live"
	}
	mediaUrl := fmt.Sprintf("%s/cam_%s_nvr", rtspBase, cameraID)

	args := []string{
		"-rtsp_transport", "tcp",
		"-timeout", "5000000",
		"-i", mediaUrl,
		"-c", "copy", // Zero CPU
		"-f", "segment",
		"-segment_time", "10",
		"-segment_wrap", "5",
		"-reset_timestamps", "1",
		filepath.Join(bufferDir, "chunk_%03d.mp4"),
	}

	cmd := exec.CommandContext(ctx, "ffmpeg", args...)
	log.Printf("[Cam %s] Starting Continuous Zero-CPU Buffer: %s", cameraID, strings.Join(cmd.Args, " "))
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	return cmd.Run()
}

// RunEventFFmpegProcess stitches the recent chunks from the continuous buffer into a permanent event clip
func RunEventFFmpegProcess(ctx context.Context, cfg CameraConfig) error {
	err := os.MkdirAll(cfg.OutDir, 0755)
	if err != nil {
		return err
	}

	bufferDir := fmt.Sprintf("/tmp/nvr_buffer/cam_%s", cfg.CameraID)
	timestamp := time.Now().Format("20060102_150405")
	outPattern := filepath.Join(cfg.OutDir, fmt.Sprintf("cam%s_event_%s.mp4", cfg.CameraID, timestamp))

	// We wait 15 seconds to allow the post-event action to be captured into the latest chunk
	// In a real production system, this would be an async task queue.
	time.Sleep(15 * time.Second)

	// Find all chunk files
	files, err := filepath.Glob(filepath.Join(bufferDir, "chunk_*.mp4"))
	if err != nil || len(files) == 0 {
		log.Printf("[Cam %s] No buffer chunks found to stitch for event", cfg.CameraID)
		return fmt.Errorf("no buffer chunks found")
	}

	// Create concat list
	concatFile := filepath.Join(bufferDir, "concat.txt")
	f, err := os.Create(concatFile)
	if err != nil {
		return err
	}
	for _, file := range files {
		f.WriteString(fmt.Sprintf("file '%s'\n", filepath.Base(file)))
	}
	f.Close()

	// Use ffmpeg to stitch them together losslessly
	concatArgs := []string{
		"-f", "concat",
		"-safe", "0",
		"-i", concatFile,
		"-c", "copy",
		outPattern,
	}

	cmd := exec.CommandContext(ctx, "ffmpeg", concatArgs...)
	log.Printf("[Cam %s] Stitching NVR chunks: %s", cfg.CameraID, strings.Join(cmd.Args, " "))
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Run(); err != nil {
		log.Printf("[Cam %s] Stitching failed: %v", cfg.CameraID, err)
		return err
	}

	// Clean up concat file
	os.Remove(concatFile)

	// Generate event thumbnail frame at 2.0s
	thumbPath := strings.TrimSuffix(outPattern, ".mp4") + "_thumb.jpg"
	thumbArgs := []string{
		"-ss", "00:00:02",
		"-i", outPattern,
		"-vframes", "1",
		"-q:v", "3",
		"-vf", "scale=320:-1",
		"-y",
		thumbPath,
	}
	thumbCmd := exec.CommandContext(ctx, "ffmpeg", thumbArgs...)
	if err := thumbCmd.Run(); err != nil {
		log.Printf("[Cam %s] Thumbnail generation error: %v", cfg.CameraID, err)
	} else {
		log.Printf("[Cam %s] Event thumbnail successfully generated: %s", cfg.CameraID, thumbPath)
	}

	// Upload to S3 and save to database
	if stat, err := os.Stat(outPattern); err == nil {
		cameraFolder := SanitizeCameraFolder(cfg.Name, cfg.CameraID)
		dateFolder := stat.ModTime().Format("2006-01-02")
		videoObjectKey := fmt.Sprintf("%s/%s/%s", dateFolder, cameraFolder, filepath.Base(outPattern))
		thumbObjectKey := fmt.Sprintf("%s/%s/%s", dateFolder, cameraFolder, filepath.Base(thumbPath))

		if storage.S3Client != nil {
			// Upload video
			if _, err := storage.S3Client.FPutObject(context.Background(), storage.S3Bucket, videoObjectKey, outPattern, minio.PutObjectOptions{
				ContentType: "video/mp4",
			}); err == nil {
				log.Printf("[Cam %s] Uploaded event video to S3: %s", cfg.CameraID, videoObjectKey)
				os.Remove(outPattern)
			}

			// Upload thumbnail
			if _, err := storage.S3Client.FPutObject(context.Background(), storage.S3Bucket, thumbObjectKey, thumbPath, minio.PutObjectOptions{
				ContentType: "image/jpeg",
			}); err == nil {
				log.Printf("[Cam %s] Uploaded event thumbnail to S3: %s", cfg.CameraID, thumbObjectKey)
				os.Remove(thumbPath)
			}
		}

		duration := 35
		if _, err := recording.Insert(context.Background(), cfg.CameraID, stat.ModTime().Add(-time.Duration(duration)*time.Second), stat.ModTime(), duration, videoObjectKey, thumbObjectKey, stat.Size()); err != nil {
			log.Printf("[Cam %s] Failed to insert event recording metadata: %v", cfg.CameraID, err)
		} else {
			log.Printf("[Cam %s] Event recording metadata saved: %s", cfg.CameraID, videoObjectKey)
		}
	}

	log.Printf("[Cam %s] Event clip successfully processed for %s", cfg.CameraID, outPattern)
	return nil
}

// RunAORRecordingProcess runs continuous recording in All-Day Storage Saving (AOR) mode at 1 FPS
func RunAORRecordingProcess(ctx context.Context, cfg CameraConfig) error {
	err := os.MkdirAll(cfg.OutDir, 0755)
	if err != nil {
		return err
	}

	segDuration := cfg.SegmentDuration
	if segDuration <= 0 {
		segDuration = 1800 // Default to 30 minutes
	}
	segmentTime := fmt.Sprintf("%d", segDuration)
	outPattern := filepath.Join(cfg.OutDir, fmt.Sprintf("cam%s_%%Y%%m%%d_%%H%%M%%S.mp4", cfg.CameraID))

	args := []string{}

	// RTSP Transport
	transport := cfg.RTSPTransport
	if transport == "" || transport == "auto" {
		transport = "tcp"
	}
	args = append(args, "-rtsp_transport", transport)
	args = append(args, "-timeout", "5000000", "-analyzeduration", "10000000", "-probesize", "10000000")
	args = append(args, "-i", cfg.Host)

	// AOR: 1 FPS continuous video to maximize storage savings
	resolution := "1280x720"
	bitrate := "250k"
	if cfg.RecordQuality == "hd" {
		resolution = "1920x1080"
		bitrate = "500k"
	}
	args = append(args, "-c:v", "libx264", "-preset", "ultrafast", "-s", resolution, "-r", "1", "-b:v", bitrate)

	// Audio is disabled for 1 FPS timelapse recording
	args = append(args, "-an")

	// Output segmentation aligned to clock time
	args = append(args,
		"-f", "segment",
		"-segment_time", segmentTime,
		"-segment_atclocktime", "1",
		"-segment_format", "mp4",
		"-reset_timestamps", "1",
		"-strftime", "1",
	)

	if trimmed := strings.TrimSpace(cfg.ExtraArgs); trimmed != "" {
		args = append(args, strings.Fields(trimmed)...)
	}

	args = append(args, outPattern)

	cmd := exec.CommandContext(ctx, "ffmpeg", args...)
	log.Printf("[Cam %s] Running AOR FFmpeg (1 FPS, %s): %s", cfg.CameraID, resolution, strings.Join(cmd.Args, " "))
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	go MonitorSegments(ctx, cfg.CameraID, cfg.Name, cfg.OutDir, segDuration)

	if err := cmd.Run(); err != nil {
		log.Printf("[Cam %s] AOR FFmpeg exited: %v", cfg.CameraID, err)
		return err
	}

	return nil
}
