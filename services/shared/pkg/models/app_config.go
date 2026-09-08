package models

import "time"

// AppConfig represents an encrypted .hscfg client application deployment configuration profile.
type AppConfig struct {
	ID                     string    `gorm:"primaryKey;type:varchar(32)" json:"id"`
	Name                   string    `gorm:"type:varchar(100);not null" json:"name"`
	Description            string    `gorm:"type:text" json:"description"`
	ObjectKey              string    `gorm:"type:varchar(255);not null" json:"object_key"`
	FileSize               int64     `gorm:"not null;default:0" json:"file_size"`
	SHA256Checksum         string    `gorm:"type:varchar(64);not null" json:"sha256_checksum"`
	ClientID               string    `gorm:"type:varchar(64);not null;index" json:"client_id"`
	GoogleServiceAccountID string    `gorm:"type:varchar(32);index" json:"google_service_account_id"`
	ProjectID              string    `gorm:"type:varchar(100)" json:"project_id"`
	GatewayURL             string    `gorm:"type:varchar(255)" json:"gateway_url"`
	APIBaseURL             string    `gorm:"type:varchar(255)" json:"api_base_url"`
	WebRTCBaseURL          string    `gorm:"type:varchar(255)" json:"webrtc_base_url"`
	RelayWSURL             string    `gorm:"type:varchar(255)" json:"relay_ws_url"`
	HasAndroidFCM          bool      `gorm:"default:false" json:"has_android_fcm"`
	HasIosFCM              bool      `gorm:"default:false" json:"has_ios_fcm"`
	HasCACert              bool      `gorm:"default:false" json:"has_ca_cert"`
	DownloadCount          int       `gorm:"default:0" json:"download_count"`
	CreatedBy              string    `gorm:"type:varchar(100)" json:"created_by"`
	CreatedAt              time.Time `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt              time.Time `gorm:"autoUpdateTime" json:"updated_at"`

	// Associations
	Client               *ApiClient            `gorm:"foreignKey:ClientID;references:ClientID" json:"client,omitempty"`
	GoogleServiceAccount *GoogleServiceAccount `gorm:"foreignKey:GoogleServiceAccountID" json:"google_service_account,omitempty"`
}

// TableName overrides the table name for AppConfig.
func (AppConfig) TableName() string {
	return "app_configs"
}

// MobileConfig is a type alias for backward compatibility.
type MobileConfig = AppConfig
