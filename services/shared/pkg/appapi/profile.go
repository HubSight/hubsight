package appapi

import (
	"crypto/sha256"
	"net/http"
	"strings"
	"time"

	"cctv/shared/pkg/auth"
	"cctv/shared/pkg/database"
	"cctv/shared/pkg/models"

	"github.com/gin-gonic/gin"
)

type UpdateProfileRequest struct {
	FullName        *string         `json:"full_name"`
	Locale          *models.Locale  `json:"locale"`
	Timezone        *string         `json:"timezone"`
	Theme           *models.Theme   `json:"theme"`
	PushPreferences map[string]bool `json:"push_preferences"`
}

type SessionItemDTO struct {
	ID        string    `json:"id"`
	ClientID  string    `json:"client_id"`
	IsPWA     bool      `json:"is_pwa"`
	IsCurrent bool      `json:"is_current"`
	ExpiresAt time.Time `json:"expires_at"`
	CreatedAt time.Time `json:"created_at"`
}

// GetProfileHandler returns the full personal profile of the authenticated user.
func GetProfileHandler(c *gin.Context) {
	userObj, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	u := userObj.(*models.User)

	// Fetch fresh user profile from DB with RoleInfo
	var fresh models.User
	if err := database.DB.WithContext(c.Request.Context()).
		Preload("RoleInfo").
		Where("id = ?", u.ID).
		First(&fresh).Error; err == nil {
		auth.LoadUserPermissions(c.Request.Context(), &fresh)
		c.JSON(http.StatusOK, fresh)
		return
	}

	c.JSON(http.StatusOK, u)
}

// UpdateProfileHandler updates profile details (name, preferences, locale, timezone, theme).
func UpdateProfileHandler(c *gin.Context) {
	userObj, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	u := userObj.(*models.User)

	var req UpdateProfileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"status":  "error",
			"code":    "INVALID_INPUT",
			"message": "Dữ liệu cập nhật không hợp lệ.",
		})
		return
	}

	updates := map[string]any{
		"updated_at": time.Now(),
	}

	if req.FullName != nil {
		updates["full_name"] = strings.TrimSpace(*req.FullName)
	}
	if req.Locale != nil && (*req.Locale == models.LocaleVi || *req.Locale == models.LocaleEn) {
		updates["locale"] = *req.Locale
	}
	if req.Timezone != nil && *req.Timezone != "" {
		updates["timezone"] = strings.TrimSpace(*req.Timezone)
	}
	if req.Theme != nil && (*req.Theme == models.ThemeLight || *req.Theme == models.ThemeDark || *req.Theme == models.ThemeSystem) {
		updates["theme"] = *req.Theme
	}
	if req.PushPreferences != nil {
		updates["push_preferences"] = req.PushPreferences
	}

	if err := database.DB.WithContext(c.Request.Context()).
		Model(&models.User{ID: u.ID}).
		Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"status":  "error",
			"message": "Lỗi lưu thông tin hồ sơ: " + err.Error(),
		})
		return
	}

	var fresh models.User
	_ = database.DB.WithContext(c.Request.Context()).
		Preload("RoleInfo").
		Where("id = ?", u.ID).
		First(&fresh).Error
	auth.LoadUserPermissions(c.Request.Context(), &fresh)

	c.JSON(http.StatusOK, gin.H{
		"status":  "ok",
		"message": "Cập nhật hồ sơ thành công.",
		"user":    fresh,
	})
}

// ListSessionsHandler lists all active sessions for the current user.
func ListSessionsHandler(c *gin.Context) {
	userObj, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	u := userObj.(*models.User)

	currentToken := ""
	authHeader := c.GetHeader("Authorization")
	if strings.HasPrefix(authHeader, "Bearer ") {
		currentToken = strings.TrimPrefix(authHeader, "Bearer ")
	} else if cookie, err := c.Cookie("session"); err == nil && cookie != "" {
		currentToken = cookie
	}

	var currentTokenHash []byte
	if currentToken != "" {
		h := sha256.Sum256([]byte(currentToken))
		currentTokenHash = h[:]
	}

	var sessions []models.Session
	err := database.DB.WithContext(c.Request.Context()).
		Where("user_id = ? AND expires_at > ?", u.ID, time.Now()).
		Order("created_at DESC").
		Find(&sessions).Error

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch sessions"})
		return
	}

	dtos := make([]SessionItemDTO, 0, len(sessions))
	for _, s := range sessions {
		isCurrent := false
		if len(currentTokenHash) > 0 && string(s.TokenHash) == string(currentTokenHash) {
			isCurrent = true
		}
		dtos = append(dtos, SessionItemDTO{
			ID:        s.ID,
			ClientID:  s.ClientID,
			IsPWA:     s.IsPwa,
			IsCurrent: isCurrent,
			ExpiresAt: s.ExpiresAt,
			CreatedAt: s.CreatedAt,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"status":   "ok",
		"sessions": dtos,
	})
}

// RevokeSessionHandler terminates a specific session (remote logout).
func RevokeSessionHandler(c *gin.Context) {
	userObj, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	u := userObj.(*models.User)
	sessionID := c.Param("id")
	if sessionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Session ID is required"})
		return
	}

	res := database.DB.WithContext(c.Request.Context()).
		Where("id = ? AND user_id = ?", sessionID, u.ID).
		Delete(&models.Session{})

	if res.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to revoke session"})
		return
	}

	if res.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":  "ok",
		"message": "Thu hồi phiên đăng nhập thành công.",
	})
}
