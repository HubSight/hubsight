package recorder

import "context"

// CameraConfig holds runtime parameters for an individual camera recorder
type CameraConfig struct {
	CameraID        string
	Name            string
	Host            string
	RTSPTransport   string
	SegmentDuration int
	VideoCodec      string
	AudioMode       string
	ExtraArgs       string
	OutDir          string
	NvrMode         string // "disabled" | "event" | "full" | "aor"
	RecordQuality   string // "standard" | "hd"
	EnableAI        bool
}

// ActiveRecorder holds the running state and cancellation handle for a camera
type ActiveRecorder struct {
	Config CameraConfig
	Cancel context.CancelFunc
}
