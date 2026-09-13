package appapi

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"cctv/shared/pkg/auth"
	"cctv/shared/pkg/models"
	"cctv/shared/pkg/response"

	"github.com/gin-gonic/gin"
)

type AppLoginRequest struct {
	Username   string `json:"username" binding:"required"`
	Password   string `json:"password" binding:"required"`
	DeviceName string `json:"device_name"`
	Platform   string `json:"platform"`
	DeviceID   string `json:"device_id"`
}

type AppVerify2FARequest struct {
	PreAuthToken string `json:"pre_auth_token" binding:"required"`
	Code         string `json:"code"`
	RecoveryCode string `json:"recovery_code"`
}

type AppRefreshTokenRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

type AppChangePasswordRequest struct {
	CurrentPassword string `json:"current_password" binding:"required"`
	NewPassword     string `json:"new_password" binding:"required"`
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

	session, token, refreshToken, err := auth.Login(c.Request.Context(), req.Username, req.Password, true, clientID)
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

	session, token, refreshToken, err := auth.Verify2FALogin(c.Request.Context(), req.PreAuthToken, req.Code, req.RecoveryCode, true)
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
