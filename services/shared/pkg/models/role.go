package models

import (
	"time"

	"cctv/shared/pkg/nanoid"

	"gorm.io/gorm"
)

// Permission defines a granular system capability or operation.
type Permission struct {
	ID          string    `gorm:"primaryKey;type:varchar" json:"id"`
	Code        string    `gorm:"column:code;type:varchar(64);uniqueIndex:idx_permissions_code;not null" json:"code"`
	Name        string    `gorm:"column:name;type:varchar(128);not null" json:"name"`
	Description string    `gorm:"column:description;type:varchar(255);not null;default:''" json:"description"`
	Module      string    `gorm:"column:module;type:varchar(64);not null;index:idx_permissions_module" json:"module"`
	CreatedAt   time.Time `gorm:"column:created_at;not null;default:CURRENT_TIMESTAMP" json:"created_at"`
}

// TableName returns the physical table name in PostgreSQL.
func (Permission) TableName() string {
	return "permissions"
}

// BeforeCreate sets default ID if unassigned.
func (p *Permission) BeforeCreate(tx *gorm.DB) error {
	if p.ID == "" {
		p.ID = nanoid.New()
	}
	return nil
}

// Role defines a grouping of permissions that can be assigned to users.
type Role struct {
	ID          string        `gorm:"primaryKey;type:varchar" json:"id"`
	Code        string        `gorm:"column:code;type:varchar(64);uniqueIndex:idx_roles_code;not null" json:"code"`
	Name        string        `gorm:"column:name;type:varchar(128);not null" json:"name"`
	Description string        `gorm:"column:description;type:varchar(255);not null;default:''" json:"description"`
	IsSystem    bool          `gorm:"column:is_system;not null;default:false" json:"is_system"`
	Permissions []*Permission `gorm:"many2many:role_permissions;joinForeignKey:role_id;joinReferences:permission_id" json:"permissions,omitempty"`
	CreatedAt   time.Time     `gorm:"column:created_at;not null;default:CURRENT_TIMESTAMP" json:"created_at"`
	UpdatedAt   time.Time     `gorm:"column:updated_at;not null;default:CURRENT_TIMESTAMP" json:"updated_at"`
}

// TableName returns the physical table name in PostgreSQL.
func (Role) TableName() string {
	return "roles"
}

// BeforeCreate sets default ID if unassigned.
func (r *Role) BeforeCreate(tx *gorm.DB) error {
	if r.ID == "" {
		r.ID = nanoid.New()
	}
	return nil
}
