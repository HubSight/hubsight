package models

import (
	"cctv/shared/pkg/nanoid"

	"gorm.io/gorm"
)

// BaseModel provides a standard NanoID primary key for all GORM models.
type BaseModel struct {
	ID string `gorm:"primaryKey;type:varchar(21)" json:"id,omitempty"`
}

// BeforeCreate assigns a new NanoID if none is provided.
func (b *BaseModel) BeforeCreate(tx *gorm.DB) error {
	if b.ID == "" {
		b.ID = nanoid.New()
	}
	return nil
}

// Role defines system user authorization roles.
type Role string

const (
	RoleAdmin  Role = "admin"
	RoleViewer Role = "viewer"
)

// Locale defines preferred UI languages.
type Locale string

const (
	LocaleVi Locale = "vi"
	LocaleEn Locale = "en"
)

// MemberRole defines classified identity roles for face recognition.
type MemberRole string

const (
	MemberRoleFamily   MemberRole = "family"
	MemberRoleGuest    MemberRole = "guest"
	MemberRoleNeighbor MemberRole = "neighbor"
	MemberRoleStaff    MemberRole = "staff"
)
