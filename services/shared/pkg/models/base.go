package models

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
