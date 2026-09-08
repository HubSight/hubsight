package auth

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"cctv/shared/pkg/database"
	"cctv/shared/pkg/models"

	"github.com/gin-gonic/gin"
)

func LoginHandler(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	apiKey := c.GetHeader("X-API-Key")
	if apiKey == "" {
		apiKey = c.Query("api_key")
	}

	var clientID string
	if apiKey != "" {
		client, err := ValidateClientApiKey(apiKey)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or inactive client API key"})
			return
		}
		clientID = client.ClientID
	} else {
		clientID = "hs_web_client_core"
	}

	session, token, refreshToken, err := Login(c.Request.Context(), req.Username, req.Password, req.IsPWA, clientID)
	if err != nil {
		if errors.Is(err, ErrTwoFactorRequired) {
			c.JSON(http.StatusOK, gin.H{
				"status":         "2fa_required",
				"pre_auth_token": token,
			})
			return
		}
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
		return
	}

	c.SetCookie("session", token, int(time.Until(session.ExpiresAt).Seconds()), "/", "", false, true)

	resp := gin.H{"status": "ok"}
	if session != nil && session.User != nil {
		resp["user"] = session.User
		resp["must_change_password"] = session.User.MustChangePassword
	}
	if req.IsPWA && refreshToken != "" {
		resp["refresh_token"] = refreshToken
	}

	c.JSON(http.StatusOK, resp)
}

func RefreshHandler(c *gin.Context) {
	var req RefreshTokenRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.RefreshToken == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Refresh token required"})
		return
	}

	session, newToken, newRefreshToken, err := RefreshPWASession(c.Request.Context(), req.RefreshToken)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired refresh token"})
		return
	}

	c.SetCookie("session", newToken, int(time.Until(session.ExpiresAt).Seconds()), "/", "", false, true)
	c.JSON(http.StatusOK, gin.H{
		"status":        "ok",
		"refresh_token": newRefreshToken,
	})
}

func LogoutHandler(c *gin.Context) {
	cookie, err := c.Cookie("session")
	if err == nil {
		Logout(c.Request.Context(), cookie)
	}

	c.SetCookie("session", "", -1, "/", "", false, true)
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func MeHandler(c *gin.Context) {
	user, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	c.JSON(http.StatusOK, user)
}

func ChangePasswordHandler(c *gin.Context) {
	userObj, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	u := userObj.(*models.User)

	var req ChangePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	if err := ChangePassword(c.Request.Context(), u, req.OldPassword, req.NewPassword); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "Password updated successfully"})
}

func VerifyPasswordHandler(c *gin.Context) {
	userObj, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	u, ok := userObj.(*models.User)
	if !ok || u == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var req VerifyPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.Password == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Password is required"})
		return
	}

	// PasswordHash is stripped by json:"-" when user travels through HTTP validate-token.
	// Fetch directly from DB when empty.
	if u.PasswordHash == "" {
		var dbUser models.User
		if err := database.DB.WithContext(c.Request.Context()).
			Select("password_hash").
			Where("id = ?", u.ID).
			First(&dbUser).Error; err == nil {
			u.PasswordHash = dbUser.PasswordHash
		}
	}

	match, err := verifyPassword(req.Password, u.PasswordHash)
	if err != nil || !match {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Incorrect password"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func UpdateLocaleHandler(c *gin.Context) {
	userObj, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	u := userObj.(*models.User)

	var req UpdateLocaleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	if req.Locale != "vi" && req.Locale != "en" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid locale. Must be 'vi' or 'en'"})
		return
	}

	ctx := c.Request.Context()
	if err := database.DB.WithContext(ctx).Model(&models.User{ID: u.ID}).Update("locale", models.Locale(req.Locale)).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update locale"})
		return
	}

	var updated models.User
	if err := database.DB.WithContext(ctx).First(&updated, "id = ?", u.ID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load updated user"})
		return
	}

	c.JSON(http.StatusOK, updated)
}

func UpdateTimezoneHandler(c *gin.Context) {
	userObj, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	u := userObj.(*models.User)

	var req UpdateTimezoneRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.Timezone == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Timezone is required"})
		return
	}

	ctx := c.Request.Context()
	if err := database.DB.WithContext(ctx).Model(&models.User{ID: u.ID}).Update("timezone", req.Timezone).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update timezone in database"})
		return
	}

	var updated models.User
	if err := database.DB.WithContext(ctx).First(&updated, "id = ?", u.ID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load updated user"})
		return
	}

	c.JSON(http.StatusOK, updated)
}

// UpdateThemeHandler updates the preferred UI theme mode (system, light, dark).
func UpdateThemeHandler(c *gin.Context) {
	userObj, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	u := userObj.(*models.User)

	var req UpdateThemeRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.Theme == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Theme is required"})
		return
	}

	if req.Theme != string(models.ThemeSystem) && req.Theme != string(models.ThemeLight) && req.Theme != string(models.ThemeDark) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid theme. Allowed values: system, light, dark"})
		return
	}

	ctx := c.Request.Context()
	if err := database.DB.WithContext(ctx).Model(&models.User{ID: u.ID}).Update("theme", req.Theme).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update theme in database"})
		return
	}

	var updated models.User
	if err := database.DB.WithContext(ctx).First(&updated, "id = ?", u.ID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load updated user"})
		return
	}

	c.JSON(http.StatusOK, updated)
}

func UpdatePreferencesHandler(c *gin.Context) {
	userObj, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	u := userObj.(*models.User)

	var req UpdatePreferencesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	updates := make(map[string]any)
	if req.Locale != nil && (*req.Locale == "vi" || *req.Locale == "en") {
		updates["locale"] = models.Locale(*req.Locale)
	}
	if req.Timezone != nil && *req.Timezone != "" {
		updates["timezone"] = *req.Timezone
	}
	if req.Theme != nil && (*req.Theme == string(models.ThemeSystem) || *req.Theme == string(models.ThemeLight) || *req.Theme == string(models.ThemeDark)) {
		updates["theme"] = models.Theme(*req.Theme)
	}
	if req.PushPreferences != nil {
		updates["push_preferences"] = req.PushPreferences
	}

	ctx := c.Request.Context()
	if len(updates) > 0 {
		if err := database.DB.WithContext(ctx).Model(&models.User{ID: u.ID}).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update preferences in database"})
			return
		}
	}

	var updated models.User
	if err := database.DB.WithContext(ctx).First(&updated, "id = ?", u.ID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load updated user"})
		return
	}

	c.JSON(http.StatusOK, updated)
}

// ── 2FA Handlers ─────────────────────────────────────────────────────────────

// Verify2FAHandler verifies step 2 of login using TOTP code or a recovery code.
func Verify2FAHandler(c *gin.Context) {
	var req Verify2FARequest
	if err := c.ShouldBindJSON(&req); err != nil || req.PreAuthToken == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Pre-auth token and code are required"})
		return
	}

	session, token, refreshToken, err := Verify2FALogin(c.Request.Context(), req.PreAuthToken, req.Code, req.RecoveryCode, req.IsPWA)
	if err != nil {
		if errors.Is(err, ErrInvalidPreAuth) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Two-factor session expired. Please log in again."})
			return
		}
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid authentication code"})
		return
	}

	c.SetCookie("session", token, int(time.Until(session.ExpiresAt).Seconds()), "/", "", false, true)

	resp := gin.H{"status": "ok"}
	if session != nil && session.User != nil {
		resp["user"] = session.User
		resp["must_change_password"] = session.User.MustChangePassword
	}
	if req.IsPWA && refreshToken != "" {
		resp["refresh_token"] = refreshToken
	}

	c.JSON(http.StatusOK, resp)
}

// Setup2FAHandler initiates 2FA and returns secret + QR code.
func Setup2FAHandler(c *gin.Context) {
	userObj, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	u := userObj.(*models.User)
	res, err := Setup2FA(c.Request.Context(), u)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, res)
}

// Enable2FAHandler verifies the user's test code and turns 2FA on.
func Enable2FAHandler(c *gin.Context) {
	userObj, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	u := userObj.(*models.User)
	var req Enable2FARequest
	if err := c.ShouldBindJSON(&req); err != nil || req.Code == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Verification code is required"})
		return
	}

	if err := Enable2FA(c.Request.Context(), u, req.Code); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok", "message": "Two-factor authentication enabled successfully"})
}

// Disable2FAHandler turns 2FA off with password/code confirmation.
func Disable2FAHandler(c *gin.Context) {
	userObj, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	u := userObj.(*models.User)
	var req Disable2FARequest
	_ = c.ShouldBindJSON(&req)

	if err := Disable2FA(c.Request.Context(), u, req.Password, req.Code); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok", "message": "Two-factor authentication disabled"})
}

// RegenerateRecoveryCodesHandler generates a new set of backup recovery codes.
func RegenerateRecoveryCodesHandler(c *gin.Context) {
	userObj, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	u := userObj.(*models.User)
	var req RegenerateRecoveryCodesRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.Password == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Password confirmation is required"})
		return
	}

	codes, err := RegenerateRecoveryCodes(c.Request.Context(), u, req.Password)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":         "ok",
		"recovery_codes": codes,
	})
}

// ── Passkey Handlers ─────────────────────────────────────────────────────────

// PasskeyRegisterOptionsHandler returns WebAuthn creation options for registering a passkey.
func PasskeyRegisterOptionsHandler(c *gin.Context) {
	userObj, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	u := userObj.(*models.User)
	origin := c.Request.Header.Get("Origin")
	options, challengeID, err := BeginPasskeyRegistration(c.Request.Context(), u, origin)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// go-webauthn's CredentialCreation already serializes as {"publicKey":{...}}.
	// Merge challenge_id into the same top-level object to avoid double-nesting.
	raw, err := json.Marshal(options)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to encode options"})
		return
	}
	var merged map[string]any
	if err := json.Unmarshal(raw, &merged); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to decode options"})
		return
	}
	merged["challenge_id"] = challengeID
	c.JSON(http.StatusOK, merged)
}

// PasskeyRegisterVerifyHandler verifies and saves the new passkey credential.
func PasskeyRegisterVerifyHandler(c *gin.Context) {
	userObj, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	u := userObj.(*models.User)
	var req PasskeyRegisterVerifyRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.ChallengeID == "" || req.Credential == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Challenge ID and credential response are required"})
		return
	}

	origin := c.Request.Header.Get("Origin")
	passkey, err := FinishPasskeyRegistration(c.Request.Context(), u, req.ChallengeID, req.Name, req.Credential, origin)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":  "ok",
		"passkey": passkey,
	})
}

// PasskeyLoginOptionsHandler generates assertion options for passkey login.
func PasskeyLoginOptionsHandler(c *gin.Context) {
	var req PasskeyLoginOptionsRequest
	_ = c.ShouldBindJSON(&req)

	origin := c.Request.Header.Get("Origin")
	options, challengeID, err := BeginPasskeyLogin(c.Request.Context(), req.Username, origin)
	if err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, ErrUserNotFound) {
			status = http.StatusNotFound
		} else if errors.Is(err, ErrUserInactive) {
			status = http.StatusForbidden
		}
		c.JSON(status, gin.H{"error": err.Error(), "code": err.Error()})
		return
	}

	// go-webauthn's CredentialAssertion already serializes as {"publicKey":{...}}.
	// Merge challenge_id into the same top-level object to avoid double-nesting.
	raw, err := json.Marshal(options)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to encode options"})
		return
	}
	var merged map[string]any
	if err := json.Unmarshal(raw, &merged); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to decode options"})
		return
	}
	merged["challenge_id"] = challengeID
	c.JSON(http.StatusOK, merged)
}

// PasskeyLoginVerifyHandler verifies passkey assertion and logs the user in.
func PasskeyLoginVerifyHandler(c *gin.Context) {
	var req PasskeyLoginVerifyRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.ChallengeID == "" || req.Credential == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Challenge ID and credential response are required"})
		return
	}

	origin := c.Request.Header.Get("Origin")
	session, token, refreshToken, err := FinishPasskeyLogin(c.Request.Context(), req.ChallengeID, req.Credential, req.IsPWA, origin)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	c.SetCookie("session", token, int(time.Until(session.ExpiresAt).Seconds()), "/", "", false, true)

	resp := gin.H{"status": "ok"}
	if session != nil && session.User != nil {
		resp["user"] = session.User
		resp["must_change_password"] = session.User.MustChangePassword
	}
	if req.IsPWA && refreshToken != "" {
		resp["refresh_token"] = refreshToken
	}

	c.JSON(http.StatusOK, resp)
}

// ListPasskeysHandler lists all registered passkeys for the current user.
func ListPasskeysHandler(c *gin.Context) {
	userObj, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	u := userObj.(*models.User)
	passkeys, err := ListPasskeys(c.Request.Context(), u.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, passkeys)
}

// RenamePasskeyHandler renames a passkey.
func RenamePasskeyHandler(c *gin.Context) {
	userObj, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	u := userObj.(*models.User)
	var req RenamePasskeyRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Passkey name is required"})
		return
	}

	passkeyID := c.Param("id")
	if err := RenamePasskey(c.Request.Context(), u.ID, passkeyID, req.Name); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// DeletePasskeyHandler removes a passkey.
func DeletePasskeyHandler(c *gin.Context) {
	userObj, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	u := userObj.(*models.User)
	passkeyID := c.Param("id")
	if err := DeletePasskey(c.Request.Context(), u.ID, passkeyID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

