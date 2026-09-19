package models

import (
	"time"

	"cctv/shared/pkg/nanoid"

	"gorm.io/gorm"
)

// AdminAuditEvent is the durable security/audit record for Admin API actions.
// Request bodies are intentionally not stored: they may contain passwords,
// confirmations, SDP, or other credentials. Metadata is limited to safe
// server-derived fields by the Admin API middleware.
type AdminAuditEvent struct {
	ID         string         `gorm:"primaryKey;type:varchar(21)" json:"id"`
	ActorID    string         `gorm:"column:actor_id;type:varchar(21);not null;default:'';index:idx_admin_audit_actor" json:"actor_id"`
	ActorName  string         `gorm:"column:actor_name;type:varchar(255);not null;default:''" json:"actor_name"`
	ClientID   string         `gorm:"column:client_id;type:varchar(64);not null;default:'';index:idx_admin_audit_client" json:"client_id"`
	Action     string         `gorm:"column:action;type:varchar(255);not null;index:idx_admin_audit_action" json:"action"`
	TargetType string         `gorm:"column:target_type;type:varchar(64);not null;default:'';index:idx_admin_audit_target" json:"target_type"`
	TargetID   string         `gorm:"column:target_id;type:varchar(255);not null;default:''" json:"target_id"`
	Method     string         `gorm:"column:method;type:varchar(16);not null" json:"method"`
	Path       string         `gorm:"column:path;type:text;not null" json:"path"`
	RequestID  string         `gorm:"column:request_id;type:varchar(64);not null;default:'';index:idx_admin_audit_request" json:"request_id"`
	StatusCode int            `gorm:"column:status_code;not null;index:idx_admin_audit_status" json:"status_code"`
	IPAddress  string         `gorm:"column:ip_address;type:varchar(64);not null;default:''" json:"ip_address"`
	UserAgent  string         `gorm:"column:user_agent;type:text;not null;default:''" json:"user_agent"`
	Metadata   map[string]any `gorm:"column:metadata;serializer:json;type:jsonb" json:"metadata,omitempty"`
	CreatedAt  time.Time      `gorm:"column:created_at;not null;default:CURRENT_TIMESTAMP;index:idx_admin_audit_created_at" json:"created_at"`
}

// TableName returns the physical PostgreSQL table name.
func (AdminAuditEvent) TableName() string {
	return "admin_audit_events"
}

// BeforeCreate assigns a NanoID when callers do not provide an event ID.
func (e *AdminAuditEvent) BeforeCreate(tx *gorm.DB) error {
	if e.ID == "" {
		e.ID = nanoid.New()
	}
	if e.Metadata == nil {
		e.Metadata = map[string]any{}
	}
	return nil
}
