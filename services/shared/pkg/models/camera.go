package models

import (
	"time"

	"cctv/shared/pkg/nanoid"

	"gorm.io/gorm"
)

// Camera represents an RTSP video device registered in the CCTV system.
type Camera struct {
	ID              string `gorm:"primaryKey;type:varchar" json:"id,omitempty"`
	Name            string `gorm:"column:name;type:varchar(255);not null" json:"name,omitempty"`
	Host            string `gorm:"column:host;type:text;not null" json:"host,omitempty"`
	Brand           string `gorm:"column:brand;type:varchar(64);not null;default:'generic'" json:"brand,omitempty"`
	RtspPort        int    `gorm:"column:rtsp_port;not null;default:554" json:"rtsp_port,omitempty"`
	RtspTransport   string `gorm:"column:rtsp_transport;type:varchar(32);not null;default:'auto'" json:"rtsp_transport,omitempty"`
	SegmentDuration int    `gorm:"column:segment_duration;not null;default:1800" json:"segment_duration,omitempty"`
	VideoCodec      string `gorm:"column:video_codec;type:varchar(32);not null;default:'copy'" json:"video_codec,omitempty"`
	AudioMode       string `gorm:"column:audio_mode;type:varchar(32);not null;default:'auto'" json:"audio_mode,omitempty"`
	ExtraArgs       string `gorm:"column:extra_args;type:text;not null;default:''" json:"extra_args,omitempty"`
	IsActive        bool   `gorm:"column:is_active;not null;default:true" json:"is_active"`
	IsStopped       bool   `gorm:"column:is_stopped;not null;default:false" json:"is_stopped"`
	EnableAi        bool   `gorm:"column:enable_ai;not null;default:false" json:"enable_ai"`
	ShowBbox        bool   `gorm:"column:show_bbox;not null;default:true" json:"show_bbox"`
	NvrMode         string `gorm:"column:nvr_mode;type:varchar(32);not null;default:'event'" json:"nvr_mode"`
	RecordQuality   string `gorm:"column:record_quality;type:varchar(32);not null;default:'standard'" json:"record_quality"`
	// IsFixed / Homography* — opt-in ground-plane calibration for non-PTZ cameras
	// (HIGH_ANGLE_VISION_STRATEGY.md §2.4). Only the 4 clicked image points are
	// persisted here; only vision-service can decode frames, so it computes the
	// homography matrix itself and owns the landmark-shift drift check.
	IsFixed             bool        `gorm:"column:is_fixed;not null;default:false" json:"is_fixed"`
	HomographyPoints    string      `gorm:"column:homography_points;type:text;not null;default:''" json:"homography_points,omitempty"`
	HomographyValid     bool        `gorm:"column:homography_valid;not null;default:true" json:"homography_valid"`
	HomographyUpdatedAt *time.Time  `gorm:"column:homography_updated_at" json:"homography_updated_at,omitempty"`
	ThumbnailURL        string      `gorm:"-" json:"thumbnail_url,omitempty"`
	StreamName          string      `gorm:"-" json:"stream_name,omitempty"`
	CreatedAt           time.Time   `gorm:"column:created_at;not null;default:CURRENT_TIMESTAMP" json:"created_at,omitempty"`
	UpdatedAt           time.Time   `gorm:"column:updated_at;not null;default:CURRENT_TIMESTAMP" json:"updated_at,omitempty"`
	Recordings          []Recording `gorm:"foreignKey:CameraID;references:ID" json:"-"`
}

// TableName returns the physical table name in PostgreSQL.
func (Camera) TableName() string {
	return "cameras"
}

// BeforeCreate assigns a new NanoID and sets schema defaults.
func (c *Camera) BeforeCreate(tx *gorm.DB) error {
	if c.ID == "" {
		c.ID = nanoid.New()
	}
	if c.Brand == "" {
		c.Brand = "generic"
	}
	if c.RtspPort == 0 {
		c.RtspPort = 554
	}
	if c.RtspTransport == "" {
		c.RtspTransport = "auto"
	}
	if c.SegmentDuration == 0 {
		c.SegmentDuration = 1800
	}
	if c.VideoCodec == "" {
		c.VideoCodec = "copy"
	}
	if c.AudioMode == "" {
		c.AudioMode = "auto"
	}
	if c.NvrMode == "" {
		c.NvrMode = "event"
	}
	if c.RecordQuality == "" {
		c.RecordQuality = "standard"
	}
	return nil
}
