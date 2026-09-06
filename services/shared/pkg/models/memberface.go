package models

import (
	"time"

	"cctv/shared/pkg/nanoid"

	"gorm.io/gorm"
)

// MemberFace stores a 512D facial embedding vector and sample image for face matching.
type MemberFace struct {
	ID             string    `gorm:"primaryKey;type:varchar" json:"id,omitempty"`
	MemberID       string    `gorm:"column:member_id;type:varchar(21);not null;index:idx_member_faces_member_id" json:"member_id,omitempty"`
	Embedding      []float64 `gorm:"column:embedding;serializer:json;type:jsonb;not null" json:"embedding,omitempty"`
	SampleImageURL string    `gorm:"column:sample_image_url;type:text;not null;default:''" json:"sample_image_url,omitempty"`
	QualityScore   float64   `gorm:"column:quality_score;not null;default:0" json:"quality_score,omitempty"`
	Yaw            float64   `gorm:"column:yaw;not null;default:0" json:"yaw,omitempty"`
	Pitch          float64   `gorm:"column:pitch;not null;default:0" json:"pitch,omitempty"`
	BlurScore      float64   `gorm:"column:blur_score;not null;default:0" json:"blur_score,omitempty"`
	IsActive       bool      `gorm:"column:is_active;not null;default:true" json:"is_active"`
	CreatedAt      time.Time `gorm:"column:created_at;not null;default:CURRENT_TIMESTAMP" json:"created_at,omitempty"`
	Member         *Member   `gorm:"foreignKey:MemberID;references:ID" json:"-"`
}

// TableName returns the physical table name in PostgreSQL.
func (MemberFace) TableName() string {
	return "member_faces"
}

// BeforeCreate assigns a new NanoID if none is provided.
func (mf *MemberFace) BeforeCreate(tx *gorm.DB) error {
	if mf.ID == "" {
		mf.ID = nanoid.New()
	}
	return nil
}
