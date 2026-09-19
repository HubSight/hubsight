package models

import (
	"time"

	"cctv/shared/pkg/nanoid"

	"gorm.io/gorm"
)

// LiveQoEReport stores bounded client-side live playback telemetry. The
// metrics map is deliberately JSONB so the Admin SDK can add optional decoder
// and GPU counters without a schema change, while the primary dimensions stay
// indexed for operational queries.
type LiveQoEReport struct {
	ID         string             `gorm:"primaryKey;type:varchar(21)" json:"id"`
	UserID     string             `gorm:"column:user_id;type:varchar(21);not null;default:'';index:idx_live_qoe_user" json:"user_id"`
	ClientID   string             `gorm:"column:client_id;type:varchar(64);not null;default:'';index:idx_live_qoe_client" json:"client_id"`
	SessionID  string             `gorm:"column:session_id;type:varchar(128);not null;default:'';index:idx_live_qoe_session" json:"session_id"`
	CameraID   string             `gorm:"column:camera_id;type:varchar(21);not null;index:idx_live_qoe_camera" json:"camera_id"`
	StreamName string             `gorm:"column:stream_name;type:varchar(128);not null;default:''" json:"stream_name"`
	Profile    string             `gorm:"column:profile;type:varchar(32);not null;default:''" json:"profile"`
	ReportedAt time.Time          `gorm:"column:reported_at;not null;index:idx_live_qoe_reported_at" json:"reported_at"`
	Metrics    map[string]float64 `gorm:"column:metrics;serializer:json;type:jsonb;not null" json:"metrics"`
	CreatedAt  time.Time          `gorm:"column:created_at;not null;default:CURRENT_TIMESTAMP;index:idx_live_qoe_created_at" json:"created_at"`
}

// TableName returns the physical PostgreSQL table name.
func (LiveQoEReport) TableName() string {
	return "live_qoe_reports"
}

// BeforeCreate assigns a NanoID and server timestamp when omitted.
func (r *LiveQoEReport) BeforeCreate(tx *gorm.DB) error {
	if r.ID == "" {
		r.ID = nanoid.New()
	}
	if r.ReportedAt.IsZero() {
		r.ReportedAt = time.Now().UTC()
	}
	if r.Metrics == nil {
		r.Metrics = map[string]float64{}
	}
	return nil
}
