package models

import (
	"cctv/shared/pkg/nanoid"

	"gorm.io/gorm"
)

// Setting holds the singleton system settings record.
type Setting struct {
	ID             string `gorm:"primaryKey;type:varchar" json:"id,omitempty"`
	NvrStatus      bool   `gorm:"column:nvr_status;not null;default:true" json:"nvr_status,omitempty"`
	StorageQuotaGB int    `gorm:"column:storage_quota_gb;not null;default:50" json:"storage_quota_gb,omitempty"`
	RetentionDays  int    `gorm:"column:retention_days;not null;default:4" json:"retention_days,omitempty"`
}

// TableName returns the physical table name in PostgreSQL.
func (Setting) TableName() string {
	return "settings"
}

// BeforeCreate assigns a new NanoID and sets default storage configuration.
func (s *Setting) BeforeCreate(tx *gorm.DB) error {
	if s.ID == "" {
		s.ID = nanoid.New()
	}
	if s.StorageQuotaGB == 0 {
		s.StorageQuotaGB = 50
	}
	if s.RetentionDays == 0 {
		s.RetentionDays = 4
	}
	return nil
}
