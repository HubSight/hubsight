package models

import (
	"time"

	"cctv/shared/pkg/nanoid"

	"gorm.io/gorm"
)

// KnownDevice tracks devices that have previously authenticated for a user.
type KnownDevice struct {
	ID                string    `gorm:"primaryKey;type:varchar(21)" json:"id"`
	UserID            string    `gorm:"column:user_id;type:varchar(21);not null;index:idx_known_devices_user_id" json:"user_id"`
	DeviceFingerprint string    `gorm:"column:device_fingerprint;type:varchar(64);not null;index:idx_known_devices_fingerprint" json:"device_fingerprint"`
	DeviceLabel       string    `gorm:"column:device_label;type:varchar(128);not null" json:"device_label"`
	ClientType        string    `gorm:"column:client_type;type:varchar(32);not null;default:'web'" json:"client_type"`
	FirstSeenAt       time.Time `gorm:"column:first_seen_at;not null;default:CURRENT_TIMESTAMP" json:"first_seen_at"`
	LastSeenAt        time.Time `gorm:"column:last_seen_at;not null;default:CURRENT_TIMESTAMP" json:"last_seen_at"`
	IsTrusted         bool      `gorm:"column:is_trusted;not null;default:true" json:"is_trusted"`
	User              *User     `gorm:"foreignKey:UserID;references:ID" json:"-"`
}

// TableName returns the physical table name in PostgreSQL.
func (KnownDevice) TableName() string {
	return "known_devices"
}

// BeforeCreate assigns a new NanoID if none is provided.
func (kd *KnownDevice) BeforeCreate(tx *gorm.DB) error {
	if kd.ID == "" {
		kd.ID = nanoid.New()
	}
	return nil
}
