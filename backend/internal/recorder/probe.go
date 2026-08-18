package recorder

import (
	"context"
	"os/exec"
	"strings"
	"time"
)

// ProbeAudioStream inspects an RTSP stream using ffprobe to detect if an audio track is available and its codec
func ProbeAudioStream(ctx context.Context, rtspURL, transport string) (bool, string) {
	probeCtx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()

	args := []string{
		"-v", "error",
		"-select_streams", "a:0",
		"-show_entries", "stream=codec_name",
		"-of", "default=noprint_wrappers=1:nokey=1",
		"-analyzeduration", "10000000",
		"-probesize", "10000000",
	}
	if transport == "" || transport == "auto" {
		transport = "tcp"
	}
	args = append(args, "-rtsp_transport", transport)
	args = append(args, "-timeout", "3000000", rtspURL)

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
