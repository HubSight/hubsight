package models

// RoleCode defines system user authorization roles.
type RoleCode string

const (
	RoleAdmin    RoleCode = "admin"
	RoleOperator RoleCode = "operator"
	RoleViewer   RoleCode = "viewer"
)

// Locale defines preferred UI languages.
type Locale string

const (
	LocaleVi Locale = "vi"
	LocaleEn Locale = "en"
)

// Theme defines preferred UI appearance mode.
type Theme string

const (
	ThemeSystem Theme = "system"
	ThemeLight  Theme = "light"
	ThemeDark   Theme = "dark"
)

// MemberRole defines classified identity roles for face recognition.
type MemberRole string

const (
	MemberRoleFamily   MemberRole = "family"
	MemberRoleGuest    MemberRole = "guest"
	MemberRoleNeighbor MemberRole = "neighbor"
	MemberRoleStaff    MemberRole = "staff"
)
