package models

import (
	"time"

	"cctv/shared/pkg/nanoid"

	"gorm.io/gorm"
)

// Platform constants for ApiClient
const (
	PlatformMobile        = "mobile"
	PlatformFlutterMobile = "mobile"
	PlatformWebSPA        = "web_spa"
	PlatformThirdParty    = "third_party"
)

// ClientType constants for ApiClient
const (
	ClientTypePublic       = "public"
	ClientTypeConfidential = "confidential"
)

// ApiClient represents an authorized client application (Mobile, Web SPA, Third-party)
// connecting to the HubSight platform via API Gateway.
type ApiClient struct {
	ID           string     `gorm:"primaryKey;type:varchar" json:"id,omitempty"`
	ClientID     string     `gorm:"column:client_id;type:varchar(64);uniqueIndex:api_clients_client_id_key;not null" json:"client_id"`
	APIKey       string     `gorm:"column:api_key;type:varchar(128);uniqueIndex:api_clients_api_key_key;not null" json:"api_key"`
	Name         string     `gorm:"column:name;type:varchar(128);not null" json:"name"`
	Platform     string     `gorm:"column:platform;type:varchar(32);not null;default:'web_spa'" json:"platform"`
	ClientType   string     `gorm:"column:client_type;type:varchar(32);not null;default:'public'" json:"client_type"`
	IsActive     bool       `gorm:"column:is_active;not null;default:true" json:"is_active"`
	IsSystem     bool       `gorm:"column:is_system;not null;default:false" json:"is_system"`
	RateLimitRPS int        `gorm:"column:rate_limit_rps;not null;default:0" json:"rate_limit_rps"`
	CreatedAt    time.Time  `gorm:"column:created_at;not null;default:CURRENT_TIMESTAMP" json:"created_at,omitempty"`
	UpdatedAt    time.Time  `gorm:"column:updated_at;not null;default:CURRENT_TIMESTAMP" json:"updated_at,omitempty"`
	LastUsedAt   *time.Time `gorm:"column:last_used_at" json:"last_used_at,omitempty"`
}

// TableName returns physical table name in PostgreSQL.
func (ApiClient) TableName() string {
	return "api_clients"
}

// BeforeCreate assigns a new NanoID if none is provided.
func (c *ApiClient) BeforeCreate(tx *gorm.DB) error {
	if c.ID == "" {
		c.ID = nanoid.New()
	}
	if c.Platform == "" {
		c.Platform = PlatformWebSPA
	}
	if c.ClientType == "" {
		c.ClientType = ClientTypePublic
	}
	return nil
}
