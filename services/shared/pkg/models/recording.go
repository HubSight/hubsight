package models

import (
	"time"

	"cctv/shared/pkg/nanoid"

	"gorm.io/gorm"
)

// Recording represents a segmented MP4 video file stored on S3/MinIO.
type Recording struct {
	ID              string    `gorm:"primaryKey;type:varchar" json:"id,omitempty"`
	CameraID        string    `gorm:"column:camera_id;type:varchar(21);not null;index:idx_recordings_camera_id" json:"camera_id,omitempty"`
	StartAt         time.Time `gorm:"column:start_at;not null" json:"start_at,omitempty"`
	EndAt           time.Time `gorm:"column:end_at;not null" json:"end_at,omitempty"`
	DurationSeconds int       `gorm:"column:duration_seconds;not null" json:"duration_seconds,omitempty"`
	FilePath        string    `gorm:"column:file_path;type:text;uniqueIndex:recordings_file_path_key;not null" json:"file_path,omitempty"`
	ThumbnailPath   *string   `gorm:"column:thumbnail_path;type:text" json:"thumbnail_path,omitempty"`
	SizeBytes       int64     `gorm:"column:size_bytes;not null" json:"size_bytes,omitempty"`
	CreatedAt       time.Time `gorm:"column:created_at;not null;default:CURRENT_TIMESTAMP" json:"created_at,omitempty"`
	Camera          *Camera   `gorm:"foreignKey:CameraID;references:ID" json:"-"`
}

// TableName returns the physical table name in PostgreSQL.
func (Recording) TableName() string {
	return "recordings"
}

// BeforeCreate assigns a new NanoID if none is provided.
func (r *Recording) BeforeCreate(tx *gorm.DB) error {
	if r.ID == "" {
		r.ID = nanoid.New()
	}
	return nil
}
