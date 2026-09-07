package nvr

import (
	"time"

	"cctv/shared/pkg/storage"
)

type SystemStats struct {
	GoVersion     string  `json:"go_version"`
	NumCPU        int     `json:"num_cpu"`
	Goroutines    int     `json:"goroutines"`
	MemoryAllocMB float64 `json:"memory_alloc_mb"`
	MemorySysMB   float64 `json:"memory_sys_mb"`
	HeapAllocMB   float64 `json:"heap_alloc_mb"`
	UptimeSeconds int64   `json:"uptime_seconds"`
}

type StorageStats struct {
	UsedBytes           int64                   `json:"used_bytes"`
	QuotaBytes          int64                   `json:"quota_bytes"`
	UsedPercentage      float64                 `json:"used_percentage"`
	TotalSegmentsCount  int                     `json:"total_segments_count"`
	OldestSegmentAt     *time.Time              `json:"oldest_segment_at,omitempty"`
	NewestSegmentAt     *time.Time              `json:"newest_segment_at,omitempty"`
	RetentionDays       int                     `json:"retention_days"`
	CleanupIntervalDays int                     `json:"cleanup_interval_days"`
	RetentionStats      *storage.RetentionStats `json:"retention_stats,omitempty"`
}

type CameraRecorderStatus struct {
	CameraID              string     `json:"camera_id"`
	Name                  string     `json:"name"`
	Host                  string     `json:"host"`
	Brand                 string     `json:"brand"`
	IsActive              bool       `json:"is_active"`
	Status                string     `json:"status"` // "recording", "stalled", "disabled"
	NvrMode               string     `json:"nvr_mode"`
	RecordQuality         string     `json:"record_quality"`
	RTSPTransport         string     `json:"rtsp_transport"`
	SegmentDuration       int        `json:"segment_duration"`
	VideoCodec            string     `json:"video_codec"`
	AudioMode             string     `json:"audio_mode"`
	ExtraArgs             string     `json:"extra_args"`
	LatestSegmentAt       *time.Time `json:"latest_segment_at,omitempty"`
	LatestSegmentSize     int64      `json:"latest_segment_size,omitempty"`
	LatestSegmentDuration int        `json:"latest_segment_duration,omitempty"`
	TotalSegments         int        `json:"total_segments"`
}

type NvrStatusResponse struct {
	ServiceName            string                 `json:"service_name"`
	Status                 string                 `json:"status"`
	IsGlobalEnabled        bool                   `json:"is_global_enabled"`
	Timestamp              time.Time              `json:"timestamp"`
	System                 SystemStats            `json:"system"`
	Storage                StorageStats           `json:"storage"`
	Cameras                []CameraRecorderStatus `json:"cameras"`
	ActiveLiveStreamsCount int                    `json:"active_live_streams_count"`
}
