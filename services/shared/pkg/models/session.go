package models

import (
	"time"

	"cctv/shared/pkg/nanoid"

	"gorm.io/gorm"
)

// Session represents an active user authentication session or refresh token grant.
type Session struct {
	ID               string     `gorm:"primaryKey;type:varchar(21)" json:"id,omitempty"`
	UserID           string     `gorm:"column:user_id;type:varchar(21);not null;index" json:"user_id,omitempty"`
	TokenHash        []byte     `gorm:"column:token_hash;type:bytea;uniqueIndex;not null" json:"-"`
	RefreshTokenHash []byte     `gorm:"column:refresh_token_hash;type:bytea" json:"-"`
	IsPwa            bool       `gorm:"column:is_pwa;not null;default:false" json:"is_pwa"`
	ExpiresAt        time.Time  `gorm:"column:expires_at;not null" json:"expires_at,omitempty"`
	CreatedAt        time.Time  `gorm:"column:created_at;not null;default:CURRENT_TIMESTAMP" json:"created_at,omitempty"`
	LastSeenAt       *time.Time `gorm:"column:last_seen_at" json:"last_seen_at,omitempty"`
	User             *User      `gorm:"foreignKey:UserID;references:ID" json:"-"`
}

// TableName returns the physical table name in PostgreSQL.
func (Session) TableName() string {
	return "sessions"
}

// BeforeCreate assigns a new NanoID if none is provided.
func (s *Session) BeforeCreate(tx *gorm.DB) error {
	if s.ID == "" {
		s.ID = nanoid.New()
	}
	return nil
}
