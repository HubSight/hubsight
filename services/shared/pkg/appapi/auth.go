package appapi

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"cctv/shared/pkg/auth"
	"cctv/shared/pkg/fingerprint"
	"cctv/shared/pkg/models"
	"cctv/shared/pkg/response"

	"github.com/gin-gonic/gin"
)

type AppLoginRequest struct {
	Username   string                        `json:"username" binding:"required"`
	Password   string                        `json:"password" binding:"required"`
	DeviceName string                        `json:"device_name"`
	Platform   string                        `json:"platform"`
	DeviceID   string                        `json:"device_id"`
	DeviceInfo *fingerprint.ClientDeviceInfo `json:"device_info,omitempty"`
	Latitude   *float64                      `json:"latitude,omitempty"`
	Longitude  *float64                      `json:"longitude,omitempty"`
	Accuracy   *float64                      `json:"accuracy,omitempty"`
}

type AppVerify2FARequest struct {
	PreAuthToken string                        `json:"pre_auth_token" binding:"required"`
	Code         string                        `json:"code"`
	RecoveryCode string                        `json:"recovery_code"`
	DeviceInfo   *fingerprint.ClientDeviceInfo `json:"device_info,omitempty"`
	Latitude     *float64                      `json:"latitude,omitempty"`
	Longitude    *float64                      `json:"longitude,omitempty"`
	Accuracy     *float64                      `json:"accuracy,omitempty"`
}

type AppRefreshTokenRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

type AppChangePasswordRequest struct {
	CurrentPassword string `json:"current_password" binding:"required"`
	NewPassword     string `json:"new_password" binding:"required"`
}

// buildAppDeviceInfo keeps the legacy app login fields working while allowing
// newer clients to send the shared device_info contract. Coordinates are
// optional: when absent, DetectWithClientInfo resolves an approximate location
// from the request IP address.
func buildAppDeviceInfo(
	deviceInfo *fingerprint.ClientDeviceInfo,
	deviceName, platform, deviceID string,
	latitude, longitude, accuracy *float64,
) *fingerprint.ClientDeviceInfo {
	info := &fingerprint.ClientDeviceInfo{}
	if deviceInfo != nil {
		copy := *deviceInfo
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
		info.ClientType = appClientType(info.Platform)
	}
	if info.Latitude == nil {
		info.Latitude = latitude
	}
	if info.Longitude == nil {
		info.Longitude = longitude
	}
	if info.Accuracy == nil {
		info.Accuracy = accuracy
	}

	return info
}

func appClientType(platform string) string {
	switch strings.ToLower(strings.TrimSpace(platform)) {
	case "ios", "ipados", "iphone", "ipad", "mobile_ios":
		return "mobile_ios"
	case "android", "mobile_android":
		return "mobile_android"
	case "windows", "desktop_windows":
		return "desktop_windows"
	case "mac", "macos", "darwin", "desktop_mac":
		return "desktop_mac"
	case "linux", "desktop_linux":
		return "desktop_linux"
	default:
		return ""
	}
}

// AppLoginHandler handles standard username/password login for mobile and desktop apps.
func AppLoginHandler(c *gin.Context) {
	var req AppLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, response.ErrInvalidInput)
		return
	}

	clientID := "app_client_mobile"
	if clientObj, exists := c.Get("api_client"); exists {
		if cl, ok := clientObj.(*models.ApiClient); ok && cl != nil {
			clientID = cl.ClientID
		}
	}

	deviceInfo := fingerprint.DetectWithClientInfo(c.Request, buildAppDeviceInfo(
		req.DeviceInfo,
		req.DeviceName,
		req.Platform,
		req.DeviceID,
		req.Latitude,
		req.Longitude,
		req.Accuracy,
	))
	session, token, refreshToken, err := auth.LoginWithDevice(c.Request.Context(), req.Username, req.Password, true, &deviceInfo, clientID)
	if err != nil {
		if errors.Is(err, auth.ErrTwoFactorRequired) {
			c.JSON(http.StatusOK, gin.H{
				"status":         "2fa_required",
				"pre_auth_token": token,
			})
			return
		}
		response.Error(c, http.StatusUnauthorized, response.ErrInvalidCredentials)
		return
	}

	expiresIn := 86400
	if session != nil {
		expiresIn = int(time.Until(session.ExpiresAt).Seconds())
	}

	c.JSON(http.StatusOK, gin.H{
		"status":               "ok",
		"token_type":           "Bearer",
		"token":                token,
		"access_token":         token,
		"refresh_token":        refreshToken,
		"expires_in":           expiresIn,
		"must_change_password": session.User.MustChangePassword,
		"user":                 session.User,
	})
}

// AppVerify2FAHandler verifies 2FA TOTP code or recovery code during login.
func AppVerify2FAHandler(c *gin.Context) {
	var req AppVerify2FARequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, response.ErrInvalidInput)
		return
	}

	deviceInfo := fingerprint.DetectWithClientInfo(c.Request, buildAppDeviceInfo(
		req.DeviceInfo,
		"",
		"",
		"",
		req.Latitude,
		req.Longitude,
		req.Accuracy,
	))
	session, token, refreshToken, err := auth.Verify2FALogin(c.Request.Context(), req.PreAuthToken, req.Code, req.RecoveryCode, true, &deviceInfo)
	if err != nil {
		response.Error(c, http.StatusUnauthorized, response.ErrTwoFactorInvalid)
		return
	}

	expiresIn := 86400
	if session != nil {
		expiresIn = int(time.Until(session.ExpiresAt).Seconds())
	}

	c.JSON(http.StatusOK, gin.H{
		"status":               "ok",
		"token_type":           "Bearer",
		"token":                token,
		"access_token":         token,
		"refresh_token":        refreshToken,
		"expires_in":           expiresIn,
		"must_change_password": session.User.MustChangePassword,
		"user":                 session.User,
	})
}

// AppRefreshTokenHandler rotates and refreshes access tokens using refresh_token.
func AppRefreshTokenHandler(c *gin.Context) {
	var req AppRefreshTokenRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.RefreshToken == "" {
		response.Error(c, http.StatusBadRequest, response.ErrRefreshTokenRequired)
		return
	}

	session, newToken, newRefreshToken, err := auth.RefreshPWASession(c.Request.Context(), req.RefreshToken)
	if err != nil {
		response.Error(c, http.StatusUnauthorized, response.ErrInvalidRefreshToken)
		return
	}

	expiresIn := 86400
	if session != nil {
		expiresIn = int(time.Until(session.ExpiresAt).Seconds())
	}

	c.JSON(http.StatusOK, gin.H{
		"status":        "ok",
		"token_type":    "Bearer",
		"token":         newToken,
		"access_token":  newToken,
		"refresh_token": newRefreshToken,
		"expires_in":    expiresIn,
	})
}

// AppChangePasswordHandler allows users (or forced password change users) to set a new password.
func AppChangePasswordHandler(c *gin.Context) {
	userObj, exists := c.Get("user")
	if !exists {
		response.Error(c, http.StatusUnauthorized, response.ErrUnauthorized)
		return
	}

	u := userObj.(*models.User)

	var req AppChangePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, response.ErrInvalidInput)
		return
	}

	if len(req.NewPassword) < 8 {
		response.Error(c, http.StatusBadRequest, response.ErrInvalidInput, map[string]any{"field": "new_password", "rule": "min_length_8"})
		return
	}

	if err := auth.ChangePassword(c.Request.Context(), u, req.CurrentPassword, req.NewPassword); err != nil {
		response.Error(c, http.StatusBadRequest, response.ErrIncorrectPassword)
		return
	}

	response.OK(c)
}

// AppLogoutHandler revokes the active session token.
func AppLogoutHandler(c *gin.Context) {
	token := ""
	authHeader := c.GetHeader("Authorization")
	if strings.HasPrefix(authHeader, "Bearer ") {
		token = strings.TrimPrefix(authHeader, "Bearer ")
	} else if cookie, err := c.Cookie("session"); err == nil && cookie != "" {
		token = cookie
	}

	if token != "" {
		_ = auth.Logout(c.Request.Context(), token)
	}

	// Also clear session cookie if present
	c.SetCookie("session", "", -1, "/", "", false, true)

	response.OK(c)
}
