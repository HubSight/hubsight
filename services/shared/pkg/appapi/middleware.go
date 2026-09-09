package appapi

import (
	"net/http"
	"strings"
	"sync"
	"time"

	"cctv/shared/pkg/database"
	"cctv/shared/pkg/models"

	"github.com/gin-gonic/gin"
)

type killSwitchCache struct {
	mu        sync.RWMutex
	enabled   bool
	expiresAt time.Time
}

var globalKillSwitch = &killSwitchCache{
	enabled: true,
}

// SetKillSwitchState immediately updates the in-memory kill-switch cache.
func SetKillSwitchState(enabled bool) {
	globalKillSwitch.mu.Lock()
	defer globalKillSwitch.mu.Unlock()
	globalKillSwitch.enabled = enabled
	globalKillSwitch.expiresAt = time.Now().Add(5 * time.Second)
}

// IsAppApiEnabled checks the current kill-switch state (cached for 3 seconds).
func IsAppApiEnabled() bool {
	globalKillSwitch.mu.RLock()
	if time.Now().Before(globalKillSwitch.expiresAt) {
		val := globalKillSwitch.enabled
		globalKillSwitch.mu.RUnlock()
		return val
	}
	globalKillSwitch.mu.RUnlock()

	globalKillSwitch.mu.Lock()
	defer globalKillSwitch.mu.Unlock()

	// Double check after acquiring write lock
	if time.Now().Before(globalKillSwitch.expiresAt) {
		return globalKillSwitch.enabled
	}

	var s models.Setting
	err := database.DB.Select("app_api_enabled").First(&s).Error
	if err == nil {
		globalKillSwitch.enabled = s.AppApiEnabled
	} else {
		globalKillSwitch.enabled = true // default fallback
	}
	globalKillSwitch.expiresAt = time.Now().Add(3 * time.Second)
	return globalKillSwitch.enabled
}

// AppKillSwitchMiddleware rejects all app requests with 503 when admin disables the app API.
func AppKillSwitchMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !IsAppApiEnabled() {
			c.Header("Retry-After", "300")
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{
				"status":      "error",
				"code":        "APP_API_DISABLED",
				"maintenance": true,
				"message":     "Hệ thống đang tạm dừng kết nối ứng dụng. Vui lòng sử dụng phiên bản web hoặc thử lại sau.",
				"message_en":  "App connection is temporarily paused. Please use the web portal or try again later.",
			})
			return
		}
		c.Next()
	}
}

// RequireAppApiKeyMiddleware strictly requires a valid and active client API key.
func RequireAppApiKeyMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		apiKey := c.GetHeader("X-API-Key")
		if apiKey == "" {
			apiKey = c.GetHeader("X-HubSight-App-Key")
		}
		if apiKey == "" {
			apiKey = c.GetHeader("X-Client-ID")
		}
		if apiKey == "" {
			apiKey = c.Query("api_key")
		}

		apiKey = strings.TrimSpace(apiKey)
		if apiKey == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"status":     "error",
				"code":       "APP_KEY_REQUIRED",
				"message":    "API Key của ứng dụng là bắt buộc. Vui lòng cấu hình qua tệp .hscfg.",
				"message_en": "Application API key is required. Please enroll using your .hscfg profile.",
			})
			return
		}

		var client models.ApiClient
		err := database.DB.WithContext(c.Request.Context()).
			Where("(api_key = ? OR client_id = ?) AND is_active = ?", apiKey, apiKey, true).
			First(&client).Error

		if err != nil {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"status":     "error",
				"code":       "INVALID_APP_KEY",
				"message":    "API Key không hợp lệ hoặc đã bị khóa.",
				"message_en": "Application API key is invalid or has been revoked.",
			})
			return
		}

		// Update last_used_at in background
		go func(clientID string) {
			now := time.Now()
			_ = database.DB.Model(&models.ApiClient{}).
				Where("id = ?", clientID).
				Update("last_used_at", now).Error
		}(client.ID)

		c.Set("api_client", &client)
		c.Next()
	}
}
