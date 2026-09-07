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

// ── 2FA Models ───────────────────────────────────────────────────────────────

type Verify2FARequest struct {
	PreAuthToken string `json:"pre_auth_token"`
	Code         string `json:"code,omitempty"`
	RecoveryCode string `json:"recovery_code,omitempty"`
	IsPWA        bool   `json:"is_pwa"`
}

type Enable2FARequest struct {
	Secret string `json:"secret"`
	Code   string `json:"code"`
}

type Disable2FARequest struct {
	Password string `json:"password,omitempty"`
	Code     string `json:"code,omitempty"`
}

type RegenerateRecoveryCodesRequest struct {
	Password string `json:"password"`
}

// ── Passkey Models ───────────────────────────────────────────────────────────

type PasskeyRegisterVerifyRequest struct {
	ChallengeID string `json:"challenge_id"`
	Name        string `json:"name"`
	Credential  string `json:"credential"` // JSON stringified WebAuthn response
}

type PasskeyLoginOptionsRequest struct {
	Username string `json:"username,omitempty"`
}

type PasskeyLoginVerifyRequest struct {
	ChallengeID string `json:"challenge_id"`
	Credential  string `json:"credential"` // JSON stringified WebAuthn assertion response
	IsPWA       bool   `json:"is_pwa"`
}

type RenamePasskeyRequest struct {
	Name string `json:"name"`
}

