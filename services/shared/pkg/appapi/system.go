package appapi

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// GetSystemStatusHandler returns system readiness, API version, and feature capabilities.
func GetSystemStatusHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":          "ok",
		"app_api_version": "v1",
		"app_api_enabled": IsAppApiEnabled(),
		"server_time":     time.Now().UTC(),
		"features": gin.H{
			"live_streaming":   true,
			"archive_playback": true,
			"multi_view_batch": true,
			"fcm_push":         true,
			"two_factor_auth":  true,
		},
	})
}
