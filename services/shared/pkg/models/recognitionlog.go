package models

import (
	"time"

	"cctv/shared/pkg/nanoid"

	"gorm.io/gorm"
)

// RecognitionLog represents a persistent AI recognition event for the Playback sidebar.
type RecognitionLog struct {
	ID            string            `gorm:"primaryKey;type:varchar(21)" json:"id,omitempty"`
	CameraID      string            `gorm:"column:camera_id;type:varchar(21);not null;index:idx_recognition_logs_camera_created,priority:1" json:"camera_id,omitempty"`
	Type          string            `gorm:"column:type;type:varchar(64);not null" json:"type,omitempty"`
	Category      string            `gorm:"column:category;type:varchar(64);not null;default:'member'" json:"category,omitempty"`
	MemberID      string            `gorm:"column:member_id;type:varchar(21);not null;default:''" json:"member_id,omitempty"`
	TrackID       int               `gorm:"column:track_id;not null;default:0" json:"track_id,omitempty"`
	MessageKey    string            `gorm:"column:message_key;type:varchar(128);not null" json:"message_key,omitempty"`
	MessageParams map[string]string `gorm:"column:message_params;serializer:json;type:jsonb;default:'{}'" json:"message_params,omitempty"`
	CreatedAt     time.Time         `gorm:"column:created_at;not null;default:CURRENT_TIMESTAMP;index:idx_recognition_logs_camera_created,priority:2" json:"created_at,omitempty"`
}

// TableName returns the physical table name in PostgreSQL.
func (RecognitionLog) TableName() string {
	return "recognition_logs"
}

// BeforeCreate assigns a new NanoID and initializes map if empty.
func (rl *RecognitionLog) BeforeCreate(tx *gorm.DB) error {
	if rl.ID == "" {
		rl.ID = nanoid.New()
	}
	if rl.Category == "" {
		rl.Category = "member"
	}
	if rl.MessageParams == nil {
		rl.MessageParams = make(map[string]string)
	}
	return nil
}
