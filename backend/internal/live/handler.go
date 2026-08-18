package live

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"cctv/internal/database"
	"github.com/gin-gonic/gin"
)

// LiveStreamHandler handles all HLS playlist, segment, and part requests directly using in-memory gohlslib muxer
func LiveStreamHandler(c *gin.Context) {
	idStr := c.Param("id")
	camID, err := strconv.Atoi(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid camera ID"})
		return
	}

	cam, err := database.Client.Camera.Get(c.Request.Context(), camID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Camera not found"})
		return
	}

	if !cam.IsActive {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Camera is currently inactive"})
		return
	}

	session, err := GlobalHub.EnsureSession(c.Request.Context(), cam)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to start live stream: " + err.Error()})
		return
	}

	// Touch session to keep it alive
	GlobalHub.TouchSession(camID)

	// Wait briefly for initial keyframe if needed
	_ = session.WaitForReady(3 * time.Second)

	// Rewrite request URL to match gohlslib root expectations (e.g. /api/live/1/index.m3u8 -> /index.m3u8)
	prefix := fmt.Sprintf("/api/live/%s", idStr)
	req := c.Request.Clone(c.Request.Context())
	req.URL.Path = strings.TrimPrefix(req.URL.Path, prefix)
	if !strings.HasPrefix(req.URL.Path, "/") {
		req.URL.Path = "/" + req.URL.Path
	}

	c.Header("Access-Control-Allow-Origin", "*")
	c.Header("Access-Control-Allow-Credentials", "true")

	session.Muxer.Handle(c.Writer, req)
}

// LiveStatusHandler returns real-time streaming health of a camera
func LiveStatusHandler(c *gin.Context) {
	idStr := c.Param("id")
	camID, err := strconv.Atoi(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid camera ID"})
		return
	}

	GlobalHub.mu.RLock()
	session, exists := GlobalHub.sessions[camID]
	GlobalHub.mu.RUnlock()

	c.JSON(http.StatusOK, gin.H{
		"camera_id": camID,
		"is_live":   exists && session != nil,
	})
}
