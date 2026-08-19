package recorder

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// RunFFmpegProcess prepares arguments and executes the FFmpeg recording process
func RunFFmpegProcess(ctx context.Context, cfg CameraConfig) error {
	err := os.MkdirAll(cfg.OutDir, 0755)
	if err != nil {
		return err
	}

	segDuration := cfg.SegmentDuration
	if segDuration <= 0 {
		segDuration = 300
	}
	segmentTime := fmt.Sprintf("%d", segDuration)
	outPattern := filepath.Join(cfg.OutDir, fmt.Sprintf("cam%d_%%Y%%m%%d_%%H%%M%%S.mp4", cfg.CameraID))

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

	// Video Codec
	// Recording quality: 1280x720 (720p) at 10fps to optimize storage and server processing
	args = append(args, "-c:v", "libx264", "-preset", "ultrafast", "-s", "1280x720", "-r", "15")

	// Audio Handling
	switch cfg.AudioMode {
	case "disabled", "none":
		log.Printf("[Cam %d] Audio disabled by configuration.", cfg.CameraID)
		args = append(args, "-an")
	case "copy":
		args = append(args, "-c:a", "copy")
	case "aac":
		args = append(args, "-c:a", "aac", "-b:a", "128k")
	default:
		// Auto detect audio stream
		hasAudio, audioCodec := ProbeAudioStream(ctx, cfg.Host, transport)
		if hasAudio {
			log.Printf("[Cam %d] Detected audio stream (codec: %s). Recording audio...", cfg.CameraID, audioCodec)
			if audioCodec == "aac" {
				args = append(args, "-c:a", "copy")
			} else {
				args = append(args, "-c:a", "aac", "-b:a", "128k")
			}
			args = append(args, "-map", "0:v:0", "-map", "0:a:0")
		} else {
			log.Printf("[Cam %d] No audio stream detected. Recording video only.", cfg.CameraID)
			args = append(args, "-an")
		}
	}

	// Output segmentation
	args = append(args,
		"-f", "segment",
		"-segment_time", segmentTime,
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
	log.Printf("[Cam %d] Running FFmpeg: %s", cfg.CameraID, strings.Join(cmd.Args, " "))
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	// Start background segment monitor
	go MonitorSegments(ctx, cfg.CameraID, cfg.Name, cfg.OutDir, segDuration)

	if err := cmd.Run(); err != nil {
		log.Printf("[Cam %d] FFmpeg exited with error: %v", cfg.CameraID, err)
		return err
	}

	return nil
}
