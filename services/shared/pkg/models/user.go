package models

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"time"

	"cctv/shared/pkg/nanoid"

	"gorm.io/gorm"
)

// StringSlice represents a slice of strings serialized as JSONB in PostgreSQL.
type StringSlice []string

// Value implements driver.Valuer for PostgreSQL JSONB storage.
func (s StringSlice) Value() (driver.Value, error) {
	if s == nil {
		return "[]", nil
	}
	bytes, err := json.Marshal(s)
	if err != nil {
		return nil, err
	}
	return string(bytes), nil
}

// Scan implements sql.Scanner for reading PostgreSQL JSONB.
func (s *StringSlice) Scan(value any) error {
	if value == nil {
		*s = []string{}
		return nil
	}
	var bytes []byte
	switch v := value.(type) {
	case []byte:
		bytes = v
	case string:
		bytes = []byte(v)
	default:
		return fmt.Errorf("failed to scan StringSlice: unsupported type %T", value)
	}
	if len(bytes) == 0 {
		*s = []string{}
		return nil
	}
	return json.Unmarshal(bytes, s)
}

// User represents an authorized system account.
type User struct {
	ID                string             `gorm:"primaryKey;type:varchar" json:"id,omitempty"`
	Username          string             `gorm:"column:username;type:varchar(255);uniqueIndex:users_username_key;not null" json:"username,omitempty"`
	FullName          string             `gorm:"column:full_name;type:varchar(255);not null;default:''" json:"full_name,omitempty"`
	PasswordHash      string             `gorm:"column:password_hash;type:text;not null" json:"-"` // Security fix: never leak Argon2 hash to API clients
	Role              RoleCode           `gorm:"column:role;type:varchar(32);not null;default:'viewer'" json:"role,omitempty"`
	RoleID            *string            `gorm:"column:role_id;type:varchar" json:"role_id,omitempty"`
	RoleInfo          *Role              `gorm:"foreignKey:RoleID;references:ID" json:"role_info,omitempty"`
	Permissions       []string           `gorm:"-" json:"permissions,omitempty"`
	IsActive          bool               `gorm:"column:is_active;not null;default:true" json:"is_active"`
	Locale            Locale             `gorm:"column:locale;type:varchar(16);not null;default:'vi'" json:"locale,omitempty"`
	Timezone          string             `gorm:"column:timezone;type:varchar(64);not null;default:'Asia/Ho_Chi_Minh'" json:"timezone,omitempty"`
	CreatedAt         time.Time          `gorm:"column:created_at;not null;default:CURRENT_TIMESTAMP" json:"created_at,omitempty"`
	UpdatedAt         time.Time          `gorm:"column:updated_at;not null;default:CURRENT_TIMESTAMP" json:"updated_at,omitempty"`
	LastLoginAt       *time.Time         `gorm:"column:last_login_at" json:"last_login_at,omitempty"`
	PushPreferences        map[string]bool     `gorm:"column:push_preferences;serializer:json;type:jsonb" json:"push_preferences,omitempty"`
	TwoFactorEnabled       bool                `gorm:"column:two_factor_enabled;not null;default:false" json:"two_factor_enabled"`
	TwoFactorSecret        string              `gorm:"column:two_factor_secret;type:text;not null;default:''" json:"-"`
	TwoFactorRecoveryCodes StringSlice         `gorm:"column:two_factor_recovery_codes;type:jsonb" json:"-"`
	Passkeys               []PasskeyCredential `gorm:"foreignKey:UserID;references:ID" json:"passkeys,omitempty"`
	Sessions               []Session           `gorm:"foreignKey:UserID;references:ID" json:"-"`
	PushSubscriptions      []PushSubscription  `gorm:"foreignKey:UserID;references:ID" json:"-"`
}

// TableName returns the physical table name in PostgreSQL.
func (User) TableName() string {
	return "users"
}

// BeforeCreate sets default ID and push preferences if unassigned.
func (u *User) BeforeCreate(tx *gorm.DB) error {
	if u.ID == "" {
		u.ID = nanoid.New()
	}
	if u.PushPreferences == nil {
		u.PushPreferences = map[string]bool{
			"family":   true,
			"guest":    true,
			"stranger": true,
			"system":   true,
		}
	}
	if u.Role == "" {
		u.Role = RoleViewer
	}
	if u.Locale == "" {
		u.Locale = LocaleVi
	}
	if u.Timezone == "" {
		u.Timezone = "Asia/Ho_Chi_Minh"
	}
	return nil
}
