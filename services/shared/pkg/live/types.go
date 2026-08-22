package live

import (
	"context"
	"time"

	"github.com/bluenviron/gohlslib/v2"
	"github.com/bluenviron/gortsplib/v5"
)

// Session represents an active in-memory RTSP-to-HLS streaming pipeline for a single camera
type Session struct {
	CameraID     string
	Host         string
	Transport    string
	Muxer        *gohlslib.Muxer
	RTSPClient   *gortsplib.Client
	LastAccessed time.Time
	Cancel       context.CancelFunc
	ReadyChan    chan struct{}
	IsReady      bool
}
