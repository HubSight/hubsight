package adminapi

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"cctv/shared/pkg/appapi"
	"cctv/shared/pkg/auth"
	"cctv/shared/pkg/database"
	"cctv/shared/pkg/fingerprint"
	"cctv/shared/pkg/models"
	"cctv/shared/pkg/response"

	"github.com/gin-gonic/gin"
)

type adminLoginRequest struct {
	Username   string                        `json:"username" binding:"required"`
	Password   string                        `json:"password" binding:"required"`
	DeviceName string                        `json:"device_name"`
	Platform   string                        `json:"platform"`
	DeviceID   string                        `json:"device_id"`
	DeviceInfo *fingerprint.ClientDeviceInfo `json:"device_info,omitempty"`
}

type adminVerify2FARequest struct {
	PreAuthToken string                        `json:"pre_auth_token" binding:"required"`
	Code         string                        `json:"code"`
	RecoveryCode string                        `json:"recovery_code"`
	DeviceInfo   *fingerprint.ClientDeviceInfo `json:"device_info,omitempty"`
}

type adminRefreshRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

func adminDeviceInfo(c *gin.Context, requestInfo *fingerprint.ClientDeviceInfo, deviceName, platform, deviceID string) fingerprint.DeviceInfo {
	info := &fingerprint.ClientDeviceInfo{}
	if requestInfo != nil {
		copy := *requestInfo
		info = &copy
	}
	if info.Fingerprint == "" {
		info.Fingerprint = strings.TrimSpace(deviceID)
	}
	if info.DeviceLabel == "" {
		info.DeviceLabel = strings.TrimSpace(deviceName)
	}
	if info.Platform == "" {
		info.Platform = strings.TrimSpace(platform)
	}
	if info.ClientType == "" {
		info.ClientType = "desktop_admin"
	}
	return fingerprint.DetectWithClientInfo(c.Request, info)
}

func issueAdminToken(c *gin.Context, session *models.Session, client *models.ApiClient) (string, error) {
	if session == nil || session.User == nil || client == nil {
		return "", errors.New("incomplete admin session")
	}
	auth.LoadUserPermissions(c.Request.Context(), session.User)
	if !auth.HasAdminAPIAccess(session.User) {
		_ = auth.RevokeSession(c.Request.Context(), session.ID, "admin_access_revoked")
		return "", auth.ErrAdminAccess
	}
	ttl := time.Until(session.ExpiresAt)
	if ttl <= 0 {
		return "", errors.New("admin session expired")
	}
	token, err := auth.GenerateAdminJWT(session.User, session.ID, ttl, client.ClientID)
	if err != nil {
		return "", err
	}
	if err := auth.ReplaceSessionToken(c.Request.Context(), session.ID, token, client.ClientID); err != nil {
		return "", err
	}
	return token, nil
}

// AdminLoginHandler authenticates a desktop client without setting a cookie.
func AdminLoginHandler(c *gin.Context) {
	var req adminLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		abortError(c, http.StatusBadRequest, response.ErrInvalidInput, nil)
		return
	}
	client, ok := adminClient(c)
	if !ok {
		abortError(c, http.StatusForbidden, response.ErrInvalidAdminKey, nil)
		return
	}
	allowed, err := auth.UserCanAccessAdminAPI(c.Request.Context(), req.Username)
	if err != nil {
		abortError(c, http.StatusInternalServerError, response.ErrInternalError, nil)
		return
	}
	if !allowed {
		abortError(c, http.StatusForbidden, response.ErrAdminAccessRequired, nil)
		return
	}

	deviceInfo := adminDeviceInfo(c, req.DeviceInfo, req.DeviceName, req.Platform, req.DeviceID)
	session, loginToken, refreshToken, err := auth.LoginWithDevice(c.Request.Context(), req.Username, req.Password, true, &deviceInfo, client.ClientID)
	if err != nil {
		if errors.Is(err, auth.ErrTwoFactorRequired) {
			c.JSON(http.StatusOK, gin.H{
				"status":         "2fa_required",
				"pre_auth_token": loginToken,
				"request_id":     c.GetString("request_id"),
			})
			return
		}
		abortError(c, http.StatusUnauthorized, response.ErrInvalidCredentials, nil)
		return
	}

	token, err := issueAdminToken(c, session, client)
	if err != nil {
		if errors.Is(err, auth.ErrAdminAccess) {
			abortError(c, http.StatusForbidden, response.ErrAdminAccessRequired, nil)
			return
		}
		abortError(c, http.StatusInternalServerError, response.ErrInternalError, nil)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"status":               "ok",
		"token_type":           "Bearer",
		"access_token":         token,
		"refresh_token":        refreshToken,
		"expires_in":           int(time.Until(session.ExpiresAt).Seconds()),
		"must_change_password": session.User.MustChangePassword,
		"user":                 session.User,
		"client_id":            client.ClientID,
		"request_id":           c.GetString("request_id"),
	})
}

// AdminVerify2FAHandler completes the password-plus-TOTP/passkey-compatible
// two-step login flow and binds the resulting session to the Admin client.
func AdminVerify2FAHandler(c *gin.Context) {
	var req adminVerify2FARequest
	if err := c.ShouldBindJSON(&req); err != nil {
		abortError(c, http.StatusBadRequest, response.ErrInvalidInput, nil)
		return
	}
	client, ok := adminClient(c)
	if !ok {
		abortError(c, http.StatusForbidden, response.ErrInvalidAdminKey, nil)
		return
	}

	deviceInfo := adminDeviceInfo(c, req.DeviceInfo, "", "", "")
	session, _, refreshToken, err := auth.Verify2FALogin(c.Request.Context(), req.PreAuthToken, req.Code, req.RecoveryCode, true, &deviceInfo)
	if err != nil {
		abortError(c, http.StatusUnauthorized, response.ErrTwoFactorInvalid, nil)
		return
	}
	token, err := issueAdminToken(c, session, client)
	if err != nil {
		if errors.Is(err, auth.ErrAdminAccess) {
			abortError(c, http.StatusForbidden, response.ErrAdminAccessRequired, nil)
			return
		}
		abortError(c, http.StatusInternalServerError, response.ErrInternalError, nil)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"status":        "ok",
		"token_type":    "Bearer",
		"access_token":  token,
		"refresh_token": refreshToken,
		"expires_in":    int(time.Until(session.ExpiresAt).Seconds()),
		"user":          session.User,
		"client_id":     client.ClientID,
		"request_id":    c.GetString("request_id"),
	})
}

// AdminRefreshHandler rotates the refresh grant and re-issues an Admin JWT.
func AdminRefreshHandler(c *gin.Context) {
	var req adminRefreshRequest
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.RefreshToken) == "" {
		abortError(c, http.StatusBadRequest, response.ErrRefreshTokenRequired, nil)
		return
	}
	client, ok := adminClient(c)
	if !ok {
		abortError(c, http.StatusForbidden, response.ErrInvalidAdminKey, nil)
		return
	}

	session, _, newRefreshToken, err := auth.RefreshPWASession(c.Request.Context(), req.RefreshToken)
	if err != nil || session == nil || session.ClientID != client.ClientID {
		if session != nil {
			_ = auth.RevokeSession(c.Request.Context(), session.ID, "admin_client_mismatch")
		}
		abortError(c, http.StatusUnauthorized, response.ErrInvalidRefreshToken, nil)
		return
	}
	auth.LoadUserPermissions(c.Request.Context(), session.User)
	if !auth.HasAdminAPIAccess(session.User) {
		_ = auth.RevokeSession(c.Request.Context(), session.ID, "admin_access_revoked")
		abortError(c, http.StatusForbidden, response.ErrAdminAccessRequired, nil)
		return
	}
	token, err := issueAdminToken(c, session, client)
	if err != nil {
		abortError(c, http.StatusInternalServerError, response.ErrInternalError, nil)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"status":        "ok",
		"token_type":    "Bearer",
		"access_token":  token,
		"refresh_token": newRefreshToken,
		"expires_in":    int(time.Until(session.ExpiresAt).Seconds()),
		"client_id":     client.ClientID,
		"request_id":    c.GetString("request_id"),
	})
}

func AdminLogoutHandler(c *gin.Context) {
	if err := auth.Logout(c.Request.Context(), c.GetString("session_token")); err != nil {
		abortError(c, http.StatusInternalServerError, response.ErrInternalError, nil)
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok", "request_id": c.GetString("request_id")})
}

func AdminMeHandler(c *gin.Context) {
	userValue, exists := c.Get("user")
	if !exists || userValue == nil {
		abortError(c, http.StatusUnauthorized, response.ErrUnauthorized, nil)
		return
	}
	client, _ := adminClient(c)
	c.JSON(http.StatusOK, gin.H{
		"status":     "ok",
		"user":       userValue,
		"client_id":  client.ClientID,
		"session_id": c.GetString("session_id"),
		"request_id": c.GetString("request_id"),
	})
}

func AdminDeletePasskeyHandler(c *gin.Context) {
	userValue, exists := c.Get("user")
	user, ok := userValue.(*models.User)
	if !exists || !ok || user == nil {
		abortError(c, http.StatusUnauthorized, response.ErrUnauthorized, nil)
		return
	}
	var passkey models.PasskeyCredential
	if err := database.DB.WithContext(c.Request.Context()).Where("id = ? AND user_id = ?", c.Param("id"), user.ID).First(&passkey).Error; err != nil {
		abortError(c, http.StatusNotFound, response.ErrNotFound, nil)
		return
	}
	confirmation, confirmed := readConfirmation(c)
	if !confirmed || !confirmationMatches(confirmation, passkey.Name, passkey.ID) {
		abortError(c, http.StatusBadRequest, response.ErrInvalidInput, gin.H{"confirmation_required": nameOrYes(passkey.Name)})
		return
	}
	auth.DeletePasskeyHandler(c)
}

// AdminPasskeyLoginVerifyHandler completes passkey login and converts the
// resulting session into an Admin-audience JWT. The legacy passkey handler is
// deliberately not reused because it sets a browser cookie and issues a
// legacy-audience token.
func AdminPasskeyLoginVerifyHandler(c *gin.Context) {
	var req auth.PasskeyLoginVerifyRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.ChallengeID == "" || req.Credential == "" {
		abortError(c, http.StatusBadRequest, response.ErrInvalidInput, nil)
		return
	}
	client, ok := adminClient(c)
	if !ok {
		abortError(c, http.StatusForbidden, response.ErrInvalidAdminKey, nil)
		return
	}
	deviceInfo := adminDeviceInfo(c, req.DeviceInfo, "", "", "")
	session, _, refreshToken, err := auth.FinishPasskeyLogin(c.Request.Context(), req.ChallengeID, req.Credential, true, c.GetHeader("Origin"), &deviceInfo)
	if err != nil || session == nil {
		abortError(c, http.StatusUnauthorized, response.ErrPasskeyFailed, nil)
		return
	}
	token, err := issueAdminToken(c, session, client)
	if err != nil {
		if errors.Is(err, auth.ErrAdminAccess) {
			abortError(c, http.StatusForbidden, response.ErrAdminAccessRequired, nil)
			return
		}
		abortError(c, http.StatusInternalServerError, response.ErrInternalError, nil)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"status":        "ok",
		"token_type":    "Bearer",
		"access_token":  token,
		"refresh_token": refreshToken,
		"expires_in":    int(time.Until(session.ExpiresAt).Seconds()),
		"user":          session.User,
		"client_id":     client.ClientID,
		"request_id":    c.GetString("request_id"),
	})
}

// AdminRelayValidateHandler is the narrow internal validation contract used
// by the standard JSON WebSocket relay. It deliberately accepts the same
// dedicated API key + Admin JWT pair as REST and returns no session cookie.
func AdminRelayValidateHandler(c *gin.Context) {
	client, ok := adminClient(c)
	if !ok {
		abortError(c, http.StatusForbidden, response.ErrInvalidAdminKey, nil)
		return
	}
	header := strings.TrimSpace(c.GetHeader("Authorization"))
	if !strings.HasPrefix(header, "Bearer ") {
		abortError(c, http.StatusUnauthorized, response.ErrInvalidAdminJWT, nil)
		return
	}
	token := strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))
	claims, err := auth.ParseAndValidateJWT(token)
	if err != nil || !hasAudience(claims, models.AudienceAdminAPI) || claims.ClientID != client.ClientID {
		abortError(c, http.StatusUnauthorized, response.ErrInvalidAdminJWT, nil)
		return
	}
	session, user, err := auth.GetSessionAndUser(c.Request.Context(), token)
	if err != nil || session == nil || user == nil || session.ID != claims.SessionID || session.ClientID != client.ClientID || !user.IsActive {
		abortError(c, http.StatusUnauthorized, response.ErrInvalidAdminJWT, nil)
		return
	}
	auth.LoadUserPermissions(c.Request.Context(), user)
	if !auth.HasAdminAPIAccess(user) {
		abortError(c, http.StatusForbidden, response.ErrAdminAccessRequired, nil)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"valid":       true,
		"user_id":     user.ID,
		"username":    user.Username,
		"role":        user.Role,
		"permissions": user.Permissions,
		"session_id":  session.ID,
		"client_id":   client.ClientID,
	})
}

// RegisterAuthRoutes registers only the new Admin authentication namespace.
func RegisterAuthRoutes(rg *gin.RouterGroup) {
	public := AdminPublicGroup(rg)
	public.POST("/login", AdminLoginHandler)
	public.POST("/2fa/verify", AdminVerify2FAHandler)
	public.POST("/refresh", AdminRefreshHandler)
	public.POST("/passkeys/login/options", auth.PasskeyLoginOptionsHandler)
	public.POST("/passkeys/login/verify", AdminPasskeyLoginVerifyHandler)
	public.POST("/relay/validate", AdminRelayValidateHandler)

	protected := AdminProtectedGroup(rg)
	protected.POST("/logout", AdminLogoutHandler)
	protected.GET("/me", AdminMeHandler)
	protected.POST("/verify-password", auth.VerifyPasswordHandler)
	protected.PUT("/password", auth.ChangePasswordHandler)
	protected.PUT("/profile", appapi.UpdateProfileHandler)
	protected.GET("/profile", appapi.GetProfileHandler)
	protected.GET("/profile/sessions", auth.ListSessionsHandler)
	protected.DELETE("/profile/sessions/:id", auth.RevokeSessionHandler)
	protected.POST("/profile/sessions\\:revoke-others", auth.RevokeAllOtherSessionsHandler)
	protected.POST("/2fa/setup", auth.Setup2FAHandler)
	protected.POST("/2fa/enable", auth.Enable2FAHandler)
	protected.POST("/2fa/disable", auth.Disable2FAHandler)
	protected.POST("/2fa/recovery-codes\\:regenerate", auth.RegenerateRecoveryCodesHandler)
	protected.GET("/passkeys", auth.ListPasskeysHandler)
	protected.POST("/passkeys/registration/options", auth.PasskeyRegisterOptionsHandler)
	protected.POST("/passkeys/registration/verify", auth.PasskeyRegisterVerifyHandler)
	protected.PATCH("/passkeys/:id", auth.RenamePasskeyHandler)
	protected.DELETE("/passkeys/:id", AdminDeletePasskeyHandler)

	RegisterAuthGovernanceRoutes(protected)
}
