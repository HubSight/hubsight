package auth

import (
	"bytes"
	"encoding/json"
	"net/http"
	"os"
	"strings"
	"time"

	"cctv/shared/pkg/models"

	"github.com/gin-gonic/gin"
)

var httpClient = &http.Client{Timeout: 5 * time.Second}

func isAllowedWhilePasswordChangeRequired(path string) bool {
	path = strings.TrimSuffix(path, "/")
	switch path {
	case "/auth/me", "/api/auth/me",
		"/auth/password", "/api/auth/password",
		"/auth/logout", "/api/auth/logout",
		"/auth/refresh", "/api/auth/refresh":
		return true
	default:
		return false
	}
}

func Middleware() gin.HandlerFunc {
	authServiceURL := os.Getenv("AUTH_SERVICE_URL")
	if authServiceURL == "" {
		authServiceURL = "http://localhost:8081"
	}

	return func(c *gin.Context) {
		cookie, err := c.Cookie("session")
		if err != nil || cookie == "" {
			authHeader := c.GetHeader("Authorization")
			if authHeader != "" {
				cookie = strings.TrimPrefix(authHeader, "Bearer ")
			}
		}

		if cookie == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			return
		}

		// Validate token via Auth Service
		reqBody, _ := json.Marshal(map[string]string{"token": cookie})
		resp, err := httpClient.Post(authServiceURL+"/auth/validate-token", "application/json", bytes.NewBuffer(reqBody))
		if err == nil && resp.StatusCode == http.StatusOK {
			defer resp.Body.Close()
			var valResp struct {
				Valid     bool         `json:"valid"`
				User      *models.User `json:"user"`
				SessionID string       `json:"session_id"`
			}
			if err := json.NewDecoder(resp.Body).Decode(&valResp); err == nil && valResp.Valid && valResp.User != nil {
				if valResp.User.MustChangePassword && !isAllowedWhilePasswordChangeRequired(c.Request.URL.Path) {
					c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
						"error": "Password change required",
						"code":  "MUST_CHANGE_PASSWORD",
					})
					return
				}
				c.Set("user", valResp.User)
				if valResp.SessionID != "" {
					c.Set("session_id", valResp.SessionID)
				}
				c.Set("session_token", cookie)
				c.Next()
				return
			}
		}

		// Fallback to local query if auth-service is unreachable during startup
		sess, user, err := GetSessionAndUser(c.Request.Context(), cookie)
		if err != nil || !user.IsActive {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			return
		}

		if user.MustChangePassword && !isAllowedWhilePasswordChangeRequired(c.Request.URL.Path) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error": "Password change required",
				"code":  "MUST_CHANGE_PASSWORD",
			})
			return
		}

		c.Set("user", user)
		if sess != nil {
			c.Set("session_id", sess.ID)
		}
		c.Set("session_token", cookie)
		c.Next()
	}
}

// RequireRole checks if the authenticated user has one of the allowed roles
func RequireRole(roles ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		userObj, exists := c.Get("user")
		if !exists {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			return
		}

		u, ok := userObj.(*models.User)
		if !ok || u == nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			return
		}

		userRole := string(u.Role)
		for _, role := range roles {
			if userRole == role {
				c.Next()
				return
			}
		}

		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "Forbidden: Insufficient permissions"})
	}
}

// RequirePermission checks if the authenticated user has ANY of the specified permissions.
// If the user has role 'admin' or the wildcard '*' permission, access is granted automatically.
func RequirePermission(perms ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		userObj, exists := c.Get("user")
		if !exists {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			return
		}

		u, ok := userObj.(*models.User)
		if !ok || u == nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			return
		}

		// Admin role always has all permissions
		if u.Role == models.RoleAdmin {
			c.Next()
			return
		}

		if len(u.Permissions) == 0 {
			LoadUserPermissions(c.Request.Context(), u)
		}

		userPerms := make(map[string]bool, len(u.Permissions))
		for _, p := range u.Permissions {
			userPerms[p] = true
		}

		if userPerms["*"] {
			c.Next()
			return
		}

		for _, reqPerm := range perms {
			if userPerms[reqPerm] {
				c.Next()
				return
			}
		}

		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "Forbidden: Insufficient permissions"})
	}
}
