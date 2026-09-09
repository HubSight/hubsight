package appapi

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"cctv/shared/pkg/auth"
	"cctv/shared/pkg/models"

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
		c.JSON(http.StatusBadRequest, gin.H{
			"status":     "error",
			"code":       "INVALID_INPUT",
			"message":    "Tên đăng nhập và mật khẩu là bắt buộc.",
			"message_en": "Username and password are required.",
		})
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
				"message":        "Yêu cầu mã xác thực 2 bước (2FA).",
				"message_en":     "Two-factor authentication code is required.",
			})
			return
		}
		c.JSON(http.StatusUnauthorized, gin.H{
			"status":     "error",
			"code":       "INVALID_CREDENTIALS",
			"message":    "Tên đăng nhập hoặc mật khẩu không chính xác.",
			"message_en": "Invalid username or password.",
		})
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
		c.JSON(http.StatusBadRequest, gin.H{
			"status":     "error",
			"code":       "INVALID_INPUT",
			"message":    "Mã xác thực không hợp lệ.",
			"message_en": "Authentication code is required.",
		})
		return
	}

	session, token, refreshToken, err := auth.Verify2FALogin(c.Request.Context(), req.PreAuthToken, req.Code, req.RecoveryCode, true)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{
			"status":     "error",
			"code":       "INVALID_2FA_CODE",
			"message":    "Mã xác thực 2 bước hoặc mã khôi phục không chính xác hoặc đã hết hạn.",
			"message_en": "Invalid or expired two-factor authentication code.",
		})
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
		c.JSON(http.StatusBadRequest, gin.H{
			"status":     "error",
			"code":       "REFRESH_TOKEN_REQUIRED",
			"message":    "Refresh token là bắt buộc.",
			"message_en": "Refresh token is required.",
		})
		return
	}

	session, newToken, newRefreshToken, err := auth.RefreshPWASession(c.Request.Context(), req.RefreshToken)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{
			"status":     "error",
			"code":       "INVALID_REFRESH_TOKEN",
			"message":    "Refresh token không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.",
			"message_en": "Invalid or expired refresh token. Please sign in again.",
		})
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
		c.JSON(http.StatusUnauthorized, gin.H{
			"status":     "error",
			"code":       "UNAUTHORIZED",
			"message":    "Yêu cầu xác thực tài khoản.",
			"message_en": "Authentication required.",
		})
		return
	}

	u := userObj.(*models.User)

	var req AppChangePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"status":     "error",
			"code":       "INVALID_INPUT",
			"message":    "Mật khẩu hiện tại và mật khẩu mới là bắt buộc.",
			"message_en": "Current password and new password are required.",
		})
		return
	}

	if len(req.NewPassword) < 8 {
		c.JSON(http.StatusBadRequest, gin.H{
			"status":     "error",
			"code":       "WEAK_PASSWORD",
			"message":    "Mật khẩu mới phải có tối thiểu 8 ký tự.",
			"message_en": "New password must be at least 8 characters.",
		})
		return
	}

	if err := auth.ChangePassword(c.Request.Context(), u, req.CurrentPassword, req.NewPassword); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"status":     "error",
			"code":       "CHANGE_PASSWORD_FAILED",
			"message":    err.Error(),
			"message_en": "Failed to update password: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":     "ok",
		"message":    "Đổi mật khẩu thành công.",
		"message_en": "Password changed successfully.",
	})
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

	c.JSON(http.StatusOK, gin.H{
		"status":     "ok",
		"message":    "Đăng xuất thành công.",
		"message_en": "Signed out successfully.",
	})
}
