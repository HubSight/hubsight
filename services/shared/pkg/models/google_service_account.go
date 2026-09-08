package models

import (
	"time"

	"cctv/shared/pkg/nanoid"
	"gorm.io/gorm"
)

// GoogleServiceAccount represents an imported Google Cloud / Firebase Service Account.
type GoogleServiceAccount struct {
	ID                  string     `gorm:"primaryKey;type:varchar(32)" json:"id"`
	Name                string     `gorm:"type:varchar(128);not null" json:"name"`
	Type                string     `gorm:"type:varchar(64);default:'service_account'" json:"type"`
	ProjectID           string     `gorm:"type:varchar(128);not null;index" json:"project_id"`
	PrivateKeyID        string     `gorm:"type:varchar(128)" json:"private_key_id"`
	PrivateKey          string     `gorm:"type:text;not null" json:"-"`
	ClientEmail         string     `gorm:"type:varchar(255);not null;index" json:"client_email"`
	ClientID            string     `gorm:"type:varchar(128)" json:"client_id"`
	AuthURI             string     `gorm:"type:varchar(255)" json:"auth_uri,omitempty"`
	TokenURI            string     `gorm:"type:varchar(255)" json:"token_uri,omitempty"`
	AuthProviderCertURL string     `gorm:"type:varchar(255)" json:"auth_provider_x509_cert_url,omitempty"`
	ClientCertURL       string     `gorm:"type:varchar(255)" json:"client_x509_cert_url,omitempty"`
	RawJSON             string     `gorm:"type:text;not null" json:"-"`
	IsActive            bool       `gorm:"not null;default:true;index" json:"is_active"`
	Status              string     `gorm:"type:varchar(32);default:'untested'" json:"status"` // 'active', 'error', 'untested'
	LastTestedAt        *time.Time `json:"last_tested_at"`
	LastError           string     `gorm:"type:text" json:"last_error,omitempty"`
	CreatedBy           string     `gorm:"type:varchar(64)" json:"created_by,omitempty"`
	CreatedAt           time.Time  `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt           time.Time  `gorm:"autoUpdateTime" json:"updated_at"`
}

// TableName sets the table name in PostgreSQL.
func (GoogleServiceAccount) TableName() string {
	return "google_service_accounts"
}

// BeforeCreate generates a 21-character NanoID if missing.
func (g *GoogleServiceAccount) BeforeCreate(tx *gorm.DB) error {
	if g.ID == "" {
		g.ID = nanoid.New()
	}
	if g.Type == "" {
		g.Type = "service_account"
	}
	if g.Status == "" {
		g.Status = "untested"
	}
	return nil
}

// GoogleServiceAccountDTO is a safe view returned to the frontend (with masked credentials).
type GoogleServiceAccountDTO struct {
	ID                  string     `json:"id"`
	Name                string     `json:"name"`
	Type                string     `json:"type"`
	ProjectID           string     `json:"project_id"`
	PrivateKeyID        string     `json:"private_key_id"`
	ClientEmail         string     `json:"client_email"`
	ClientID            string     `json:"client_id"`
	AuthURI             string     `json:"auth_uri,omitempty"`
	TokenURI            string     `json:"token_uri,omitempty"`
	AuthProviderCertURL string     `json:"auth_provider_x509_cert_url,omitempty"`
	ClientCertURL       string     `json:"client_x509_cert_url,omitempty"`
	IsActive            bool       `json:"is_active"`
	Status              string     `json:"status"`
	LastTestedAt        *time.Time `json:"last_tested_at"`
	LastError           string     `json:"last_error,omitempty"`
	CreatedBy           string     `json:"created_by,omitempty"`
	CreatedAt           time.Time  `json:"created_at"`
	UpdatedAt           time.Time  `json:"updated_at"`
	HasPrivateKey       bool       `json:"has_private_key"`
}

// ToDTO converts a model instance to a safe frontend DTO.
func (g *GoogleServiceAccount) ToDTO() GoogleServiceAccountDTO {
	return GoogleServiceAccountDTO{
		ID:                  g.ID,
		Name:                g.Name,
		Type:                g.Type,
		ProjectID:           g.ProjectID,
		PrivateKeyID:        g.PrivateKeyID,
		ClientEmail:         g.ClientEmail,
		ClientID:            g.ClientID,
		AuthURI:             g.AuthURI,
		TokenURI:            g.TokenURI,
		AuthProviderCertURL: g.AuthProviderCertURL,
		ClientCertURL:       g.ClientCertURL,
		IsActive:            g.IsActive,
		Status:              g.Status,
		LastTestedAt:        g.LastTestedAt,
		LastError:           g.LastError,
		CreatedBy:           g.CreatedBy,
		CreatedAt:           g.CreatedAt,
		UpdatedAt:           g.UpdatedAt,
		HasPrivateKey:       len(g.PrivateKey) > 0,
	}
}
