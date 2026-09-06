package models

import (
	"time"

	"cctv/shared/pkg/nanoid"

	"gorm.io/gorm"
)

// Member represents a registered person profile for facial recognition.
type Member struct {
	ID        string       `gorm:"primaryKey;type:varchar(21)" json:"id,omitempty"`
	Name      string       `gorm:"column:name;type:varchar(255);not null" json:"name,omitempty"`
	Role      MemberRole   `gorm:"column:role;type:varchar(32);not null;default:'family'" json:"role,omitempty"`
	AvatarURL string       `gorm:"column:avatar_url;type:text;not null;default:''" json:"avatar_url,omitempty"`
	IsActive  bool         `gorm:"column:is_active;not null;default:true" json:"is_active"`
	CreatedAt time.Time    `gorm:"column:created_at;not null;default:CURRENT_TIMESTAMP" json:"created_at,omitempty"`
	UpdatedAt time.Time    `gorm:"column:updated_at;not null;default:CURRENT_TIMESTAMP" json:"updated_at,omitempty"`
	Faces     []MemberFace `gorm:"foreignKey:MemberID;references:ID" json:"faces,omitempty"`
}

// TableName returns the physical table name in PostgreSQL.
func (Member) TableName() string {
	return "members"
}

// BeforeCreate assigns a new NanoID and sets defaults.
func (m *Member) BeforeCreate(tx *gorm.DB) error {
	if m.ID == "" {
		m.ID = nanoid.New()
	}
	if m.Role == "" {
		m.Role = MemberRoleFamily
	}
	return nil
}
