package models

import (
	"time"

	"cctv/shared/pkg/nanoid"

	"gorm.io/gorm"
)

// Session represents an active user authentication session or refresh token grant.
type Session struct {
	ID               string     `gorm:"primaryKey;type:varchar" json:"id,omitempty"`
	UserID           string     `gorm:"column:user_id;type:varchar(21);not null;index:idx_sessions_user_id;index:idx_sessions_active,priority:1" json:"user_id,omitempty"`
	TokenHash        []byte     `gorm:"column:token_hash;type:bytea;uniqueIndex:sessions_token_hash_key;not null" json:"-"`
	RefreshTokenHash []byte     `gorm:"column:refresh_token_hash;type:bytea" json:"-"`
	IsPwa            bool       `gorm:"column:is_pwa;not null;default:false" json:"is_pwa"`
	ClientID         string     `gorm:"column:client_id;type:varchar(64)" json:"client_id,omitempty"`
	ExpiresAt        time.Time  `gorm:"column:expires_at;not null;index:idx_sessions_active,priority:2" json:"expires_at,omitempty"`
	CreatedAt        time.Time  `gorm:"column:created_at;not null;default:CURRENT_TIMESTAMP" json:"created_at,omitempty"`
	LastSeenAt       *time.Time `gorm:"column:last_seen_at" json:"last_seen_at,omitempty"`
	IPAddress         string     `gorm:"column:ip_address;type:varchar(64)" json:"ip_address,omitempty"`
	UserAgent         string     `gorm:"column:user_agent;type:text" json:"user_agent,omitempty"`
	DeviceFingerprint string     `gorm:"column:device_fingerprint;type:varchar(64);index:idx_sessions_device_fingerprint" json:"device_fingerprint,omitempty"`
	DeviceLabel       string     `gorm:"column:device_label;type:varchar(128)" json:"device_label,omitempty"`
	ClientType        string     `gorm:"column:client_type;type:varchar(32)" json:"client_type,omitempty"`
	GeoCity           string     `gorm:"column:geo_city;type:varchar(64)" json:"geo_city,omitempty"`
	GeoCountry        string     `gorm:"column:geo_country;type:varchar(64)" json:"geo_country,omitempty"`
	GeoRegion         string     `gorm:"column:geo_region;type:varchar(64)" json:"geo_region,omitempty"`
	GeoLatitude       *float64   `gorm:"column:geo_latitude;type:decimal(10,6)" json:"geo_latitude,omitempty"`
	GeoLongitude      *float64   `gorm:"column:geo_longitude;type:decimal(10,6)" json:"geo_longitude,omitempty"`
	GeoAccuracy       *float64   `gorm:"column:geo_accuracy" json:"geo_accuracy,omitempty"`
	IsNewDevice       bool       `gorm:"column:is_new_device;not null;default:false" json:"is_new_device"`
	RevokedAt         *time.Time `gorm:"column:revoked_at;index:idx_sessions_revoked_at;index:idx_sessions_active,priority:3" json:"revoked_at,omitempty"`
	RevokeReason      string     `gorm:"column:revoke_reason;type:varchar(32)" json:"revoke_reason,omitempty"`
	User              *User      `gorm:"foreignKey:UserID;references:ID" json:"-"`
}

// IsActive returns true if the session is not revoked and not expired.
func (s *Session) IsActive() bool {
	return s.RevokedAt == nil && s.ExpiresAt.After(time.Now())
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
