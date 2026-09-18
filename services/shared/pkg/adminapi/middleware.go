package adminapi

import (
	"net/http"
	"strings"
	"sync"
	"time"

	"cctv/shared/pkg/auth"
	"cctv/shared/pkg/database"
	"cctv/shared/pkg/models"
	"cctv/shared/pkg/nanoid"
	"cctv/shared/pkg/response"

	"github.com/gin-gonic/gin"
)

type killSwitchCache struct {
	mu        sync.RWMutex
	enabled   bool
	expiresAt time.Time
}

var globalKillSwitch = &killSwitchCache{enabled: true}

// SetKillSwitchState immediately updates the Admin API kill-switch cache.
func SetKillSwitchState(enabled bool) {
	globalKillSwitch.mu.Lock()
	defer globalKillSwitch.mu.Unlock()
	globalKillSwitch.enabled = enabled
	globalKillSwitch.expiresAt = time.Now().Add(5 * time.Second)
}

// IsAdminAPIEnabled reads the dedicated Admin API setting with a short cache.
// A nil database is treated as enabled so route/middleware unit tests can run
// without opening a database connection.
func IsAdminAPIEnabled() bool {
	globalKillSwitch.mu.RLock()
	if time.Now().Before(globalKillSwitch.expiresAt) {
		value := globalKillSwitch.enabled
		globalKillSwitch.mu.RUnlock()
		return value
	}
	globalKillSwitch.mu.RUnlock()

	globalKillSwitch.mu.Lock()
	defer globalKillSwitch.mu.Unlock()
	if time.Now().Before(globalKillSwitch.expiresAt) {
		return globalKillSwitch.enabled
	}

	if database.DB == nil {
		globalKillSwitch.enabled = true
	} else {
		var setting models.Setting
		if err := database.DB.Select("admin_api_enabled").First(&setting).Error; err == nil {
			globalKillSwitch.enabled = setting.AdminApiEnabled
		} else {
			globalKillSwitch.enabled = true
		}
	}
	globalKillSwitch.expiresAt = time.Now().Add(3 * time.Second)
	return globalKillSwitch.enabled
}

// RequestIDMiddleware assigns a request ID to every Admin API request.
func RequestIDMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		requestID := strings.TrimSpace(c.GetHeader("X-Request-ID"))
		if requestID == "" {
			requestID = "req_" + nanoid.New()
		}
		c.Set("request_id", requestID)
		c.Header("X-Request-ID", requestID)
		c.Next()
	}
}

func abortError(c *gin.Context, status int, code string, details gin.H) {
	body := gin.H{
		"status":     "error",
		"code":       code,
		"error":      code,
		"request_id": c.GetString("request_id"),
	}
	if details != nil {
		body["details"] = details
	}
	c.AbortWithStatusJSON(status, body)
}

// AdminKillSwitchMiddleware rejects all Admin API requests while disabled.
func AdminKillSwitchMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !IsAdminAPIEnabled() {
			c.Header("Retry-After", "300")
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{
				"status":              "error",
				"code":                response.ErrAdminApiDisabled,
				"error":               response.ErrAdminApiDisabled,
				"maintenance":         true,
				"retry_after_seconds": 300,
				"request_id":          c.GetString("request_id"),
			})
			return
		}
		c.Next()
	}
}

// RequireAdminAPIKey accepts only X-API-Key and only keys provisioned for the
// dedicated admin_desktop/admin_api audience. It deliberately rejects all
// legacy client-ID and query-string credential fallbacks.
func RequireAdminAPIKey() gin.HandlerFunc {
	return func(c *gin.Context) {
		apiKey := strings.TrimSpace(c.GetHeader("X-API-Key"))
		if apiKey == "" {
			abortError(c, http.StatusUnauthorized, response.ErrAdminKeyRequired, nil)
			return
		}

		var client models.ApiClient
		if database.DB == nil {
			abortError(c, http.StatusForbidden, response.ErrInvalidAdminKey, nil)
			return
		}
		err := database.DB.WithContext(c.Request.Context()).
			Where("api_key = ? AND is_active = ? AND platform = ? AND audience = ?", apiKey, true, models.PlatformAdminDesktop, models.AudienceAdminAPI).
			First(&client).Error
		if err != nil {
			abortError(c, http.StatusForbidden, response.ErrInvalidAdminKey, nil)
			return
		}

		c.Set("api_client", &client)
		c.Set("admin_client_id", client.ClientID)
		go func(clientID string) {
			now := time.Now()
			if database.DB != nil {
				_ = database.DB.Model(&models.ApiClient{}).
					Where("id = ?", clientID).
					Update("last_used_at", &now).Error
			}
		}(client.ID)
		c.Next()
	}
}

func adminClient(c *gin.Context) (*models.ApiClient, bool) {
	value, exists := c.Get("api_client")
	if !exists {
		return nil, false
	}
	client, ok := value.(*models.ApiClient)
	return client, ok && client != nil
}

func hasAudience(claims *auth.JWTClaims, wanted string) bool {
	if claims == nil {
		return false
	}
	for _, audience := range claims.Audience {
		if audience == wanted {
			return true
		}
	}
	return false
}

// AdminJWTMiddleware validates a Bearer JWT, its admin audience, its client
// binding, and the active session. Cookies, query tokens, and opaque legacy
// sessions are intentionally not accepted.
func AdminJWTMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		client, ok := adminClient(c)
		if !ok {
			abortError(c, http.StatusUnauthorized, response.ErrInvalidAdminKey, nil)
			return
		}

		header := strings.TrimSpace(c.GetHeader("Authorization"))
		if !strings.HasPrefix(header, "Bearer ") {
			abortError(c, http.StatusUnauthorized, response.ErrInvalidAdminJWT, nil)
			return
		}
		token := strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))
		if token == "" {
			abortError(c, http.StatusUnauthorized, response.ErrInvalidAdminJWT, nil)
			return
		}

		claims, err := auth.ParseAndValidateJWT(token)
		if err != nil || !hasAudience(claims, models.AudienceAdminAPI) || claims.ClientID != client.ClientID {
			abortError(c, http.StatusUnauthorized, response.ErrInvalidAdminJWT, nil)
			return
		}

		session, user, err := auth.GetSessionAndUser(c.Request.Context(), token)
		if err != nil || session == nil || user == nil || session.ID != claims.SessionID || session.ClientID != client.ClientID {
			abortError(c, http.StatusUnauthorized, response.ErrInvalidAdminJWT, nil)
			return
		}
		if !user.IsActive {
			abortError(c, http.StatusUnauthorized, response.ErrUnauthorized, nil)
			return
		}

		c.Set("user", user)
		c.Set("session_id", session.ID)
		c.Set("session_token", token)
		c.Set("admin_claims", claims)
		c.Next()
	}
}

// RequirePermission applies the existing RBAC permission set within the Admin
// namespace while keeping transport authentication separate from legacy routes.
func RequirePermission(permissions ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		userValue, exists := c.Get("user")
		user, ok := userValue.(*models.User)
		if !exists || !ok || user == nil {
			abortError(c, http.StatusUnauthorized, response.ErrUnauthorized, nil)
			return
		}
		if user.Role == models.RoleAdmin {
			c.Next()
			return
		}
		if len(user.Permissions) == 0 {
			auth.LoadUserPermissions(c.Request.Context(), user)
		}
		for _, granted := range user.Permissions {
			if granted == "*" {
				c.Next()
				return
			}
			for _, required := range permissions {
				if granted == required {
					c.Next()
					return
				}
			}
		}
		abortError(c, http.StatusForbidden, response.ErrForbidden, nil)
	}
}
