package live

import (
	"context"
	"time"
)

// Session represents an active on-demand live HLS transcode worker for a specific camera
type Session struct {
	CameraID       int
	Host           string
	RTSPTransport  string
	AudioMode      string
	ExtraArgs      string
	HlsDir         string
	PlaylistPath   string
	ViewerCount    int
	LastAccessed   time.Time
	Cancel         context.CancelFunc
	Done           chan struct{}
	IsReady        bool
}
