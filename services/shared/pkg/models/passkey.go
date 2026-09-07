package models

import (
	"time"

	"cctv/shared/pkg/nanoid"

	"gorm.io/gorm"
)

// PasskeyCredential represents a WebAuthn / FIDO2 public key credential associated with a User.
type PasskeyCredential struct {
	ID              string     `gorm:"primaryKey;type:varchar" json:"id"`
	UserID          string     `gorm:"column:user_id;type:varchar;index;not null" json:"user_id"`
	Name            string     `gorm:"column:name;type:varchar(255);not null;default:''" json:"name"`
	CredentialID    []byte     `gorm:"column:credential_id;type:bytea;uniqueIndex:passkey_cred_id_key;not null" json:"credential_id"`
	PublicKey       []byte     `gorm:"column:public_key;type:bytea;not null" json:"-"`
	AttestationType string     `gorm:"column:attestation_type;type:varchar(64);not null;default:''" json:"attestation_type,omitempty"`
	AAGUID          []byte     `gorm:"column:aaguid;type:bytea" json:"aaguid,omitempty"`
	SignCount       uint32     `gorm:"column:sign_count;not null;default:0" json:"sign_count"`
	Transports      []string   `gorm:"column:transports;serializer:json;type:jsonb" json:"transports,omitempty"`
	BackupEligible  bool       `gorm:"column:backup_eligible;not null;default:false" json:"backup_eligible"`
	BackupState     bool       `gorm:"column:backup_state;not null;default:false" json:"backup_state"`
	CreatedAt       time.Time  `gorm:"column:created_at;not null;default:CURRENT_TIMESTAMP" json:"created_at"`
	UpdatedAt       time.Time  `gorm:"column:updated_at;not null;default:CURRENT_TIMESTAMP" json:"updated_at"`
	LastUsedAt      *time.Time `gorm:"column:last_used_at" json:"last_used_at,omitempty"`
}

// TableName returns the physical table name in PostgreSQL.
func (PasskeyCredential) TableName() string {
	return "passkey_credentials"
}

// BeforeCreate sets default ID if unassigned.
func (p *PasskeyCredential) BeforeCreate(tx *gorm.DB) error {
	if p.ID == "" {
		p.ID = nanoid.New()
	}
	return nil
}
