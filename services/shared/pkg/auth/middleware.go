package auth

import (
	"bytes"
	"encoding/json"
	"net/http"
	"os"
	"time"

	"cctv/shared/pkg/models"
	"github.com/gin-gonic/gin"
)

var httpClient = &http.Client{Timeout: 5 * time.Second}

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
				cookie = authHeader
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
				Valid bool         `json:"valid"`
				User  *models.User `json:"user"`
			}
			if err := json.NewDecoder(resp.Body).Decode(&valResp); err == nil && valResp.Valid && valResp.User != nil {
				c.Set("user", valResp.User)
				c.Next()
				return
			}
		}

		// Fallback to local query if auth-service is unreachable during startup
		user, err := GetUserBySession(c.Request.Context(), cookie)
		if err != nil || !user.IsActive {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			return
		}

		c.Set("user", user)
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
