package models

import (
	"time"

	"cctv/shared/pkg/nanoid"

	"gorm.io/gorm"
)

// PushSubscription stores a Web Push / VAPID browser push subscription.
type PushSubscription struct {
	ID        string    `gorm:"primaryKey;type:varchar" json:"id,omitempty"`
	UserID    string    `gorm:"column:user_id;type:varchar(21);not null;default:'';index:idx_push_subscriptions_user_id" json:"user_id,omitempty"`
	Endpoint  string    `gorm:"column:endpoint;type:text;uniqueIndex:push_subscriptions_endpoint_key;not null" json:"endpoint,omitempty"`
	P256dh    string    `gorm:"column:p256dh;type:varchar(255);not null" json:"p256dh,omitempty"`
	Auth      string    `gorm:"column:auth;type:varchar(255);not null" json:"auth,omitempty"`
	UserAgent string    `gorm:"column:user_agent;type:text;not null;default:''" json:"user_agent,omitempty"`
	CreatedAt time.Time `gorm:"column:created_at;not null;default:CURRENT_TIMESTAMP" json:"created_at,omitempty"`
	User      *User     `gorm:"foreignKey:UserID;references:ID" json:"-"`
}

// TableName returns the physical table name in PostgreSQL.
func (PushSubscription) TableName() string {
	return "push_subscriptions"
}

// BeforeCreate assigns a new NanoID if none is provided.
func (ps *PushSubscription) BeforeCreate(tx *gorm.DB) error {
	if ps.ID == "" {
		ps.ID = nanoid.New()
	}
	return nil
}
