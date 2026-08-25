package pool

import (
	"sync"
	"time"
)

type StreamPurpose string

const (
	PurposeCV   StreamPurpose = "cv"   // Connection #0 dedicated for Computer Vision processing
	PurposeNVR  StreamPurpose = "nvr"  // Connection #1 dedicated for NVR recording
	PurposeLive StreamPurpose = "live" // Connections #2..N shared by live viewers
	// LiveMaxClientsPerConn is how many UI clients share one live RTSP pull.
	// A new #2+ stream is opened only when every existing live conn is full.
	LiveMaxClientsPerConn = 5
)

// StreamConnection represents an active RTSP/Media stream in the pool
type StreamConnection struct {
	ID          string        `json:"id"` // e.g. conn_{id}_cv (#0), conn_{id}_nvr (#1), conn_{id}_live_2 (#2+)
	CameraID    string        `json:"camera_id"`
	Index       int           `json:"index"`        // 0: CV, 1: NVR, >=2: shared live
	Purpose     StreamPurpose `json:"purpose"`      // "cv" | "nvr" | "live"
	StreamName  string        `json:"stream_name"`  // Stream name registered in go2rtc
	SourceURL   string        `json:"source_url"`   // Camera RTSP URL
	ActiveUsers int           `json:"active_users"` // Current connected viewers (0..5)
	MaxUsers    int           `json:"max_users"`    // 5 for live, 1 for CV
	CreatedAt   time.Time     `json:"created_at"`
	LastUsedAt  time.Time     `json:"last_used_at"`
	Status      string        `json:"status"` // "active" | "idle" | "error"
}

// CameraPool holds the pool state and connections for a single camera
type CameraPool struct {
	CameraID      string                       `json:"camera_id"`
	CameraName    string                       `json:"camera_name"`
	Host          string                       `json:"host"`
	IsActive      bool                         `json:"is_active"`
	EnableAI      bool                         `json:"enable_ai"`
	CVConnection  *StreamConnection            `json:"cv_connection"`  // Connection #0 (Always active for CV)
	NVRConnection *StreamConnection            `json:"nvr_connection"` // Connection #1 (Active if NVR enabled globally)
	LivePool      map[string]*StreamConnection `json:"live_pool"`      // Map of stream_name -> StreamConnection
	NextLiveIndex int                          `json:"next_live_index"`
	mu            sync.RWMutex
}

// AcquireResult contains metadata of the allocated connection
type AcquireResult struct {
	StreamName  string `json:"stream_name"`
	IsNewStream bool   `json:"is_new_stream"`
	ActiveUsers int    `json:"active_users"`
	ConnIndex   int    `json:"conn_index"`
}

// PoolStatusSummary is a serializable snapshot of the entire pool state
type PoolStatusSummary struct {
	TotalCameras       int           `json:"total_cameras"`
	ActiveCameras      int           `json:"active_cameras"`
	TotalCVStreams     int           `json:"total_cv_streams"`
	TotalNVRStreams    int           `json:"total_nvr_streams"`
	TotalLiveStreams   int           `json:"total_live_streams"`
	TotalActiveViewers int           `json:"total_active_viewers"`
	Cameras            []*CameraPool `json:"cameras"`
}
