package auth

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
	IsPWA    bool   `json:"is_pwa"`
}

type RefreshTokenRequest struct {
	RefreshToken string `json:"refresh_token"`
}

type VerifyPasswordRequest struct {
	Password string `json:"password"`
}

type ChangePasswordRequest struct {
	OldPassword string `json:"old_password"`
	NewPassword string `json:"new_password"`
}

type UpdateLocaleRequest struct {
	Locale string `json:"locale"`
}

type UpdateTimezoneRequest struct {
	Timezone string `json:"timezone"`
}

type UpdatePreferencesRequest struct {
	Locale          *string         `json:"locale,omitempty"`
	Timezone        *string         `json:"timezone,omitempty"`
	PushPreferences map[string]bool `json:"push_preferences,omitempty"`
}
