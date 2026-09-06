package models

import (
	"time"

	"cctv/shared/pkg/nanoid"

	"gorm.io/gorm"
)

// Camera represents an RTSP video device registered in the CCTV system.
type Camera struct {
	ID              string      `gorm:"primaryKey;type:varchar" json:"id,omitempty"`
	Name            string      `gorm:"column:name;type:varchar(255);not null" json:"name,omitempty"`
	Host            string      `gorm:"column:host;type:text;not null" json:"host,omitempty"`
	Brand           string      `gorm:"column:brand;type:varchar(64);not null;default:'generic'" json:"brand,omitempty"`
	RtspPort        int         `gorm:"column:rtsp_port;not null;default:554" json:"rtsp_port,omitempty"`
	RtspTransport   string      `gorm:"column:rtsp_transport;type:varchar(32);not null;default:'auto'" json:"rtsp_transport,omitempty"`
	SegmentDuration int         `gorm:"column:segment_duration;not null;default:1800" json:"segment_duration,omitempty"`
	VideoCodec      string      `gorm:"column:video_codec;type:varchar(32);not null;default:'copy'" json:"video_codec,omitempty"`
	AudioMode       string      `gorm:"column:audio_mode;type:varchar(32);not null;default:'auto'" json:"audio_mode,omitempty"`
	ExtraArgs       string      `gorm:"column:extra_args;type:text;not null;default:''" json:"extra_args,omitempty"`
	IsActive        bool        `gorm:"column:is_active;not null;default:true" json:"is_active"`
	IsStopped       bool        `gorm:"column:is_stopped;not null;default:false" json:"is_stopped"`
	EnableAi        bool        `gorm:"column:enable_ai;not null;default:false" json:"enable_ai"`
	ShowBbox        bool        `gorm:"column:show_bbox;not null;default:true" json:"show_bbox"`
	CreatedAt       time.Time   `gorm:"column:created_at;not null;default:CURRENT_TIMESTAMP" json:"created_at,omitempty"`
	UpdatedAt       time.Time   `gorm:"column:updated_at;not null;default:CURRENT_TIMESTAMP" json:"updated_at,omitempty"`
	Recordings      []Recording `gorm:"foreignKey:CameraID;references:ID" json:"-"`
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
	return nil
}
