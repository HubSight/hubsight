package live

import (
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"cctv/internal/database"
	"github.com/gin-gonic/gin"
)

// LivePlaylistHandler serves the index.m3u8 playlist file, starting the stream worker if not already active
func LivePlaylistHandler(c *gin.Context) {
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

	// Wait up to 6 seconds for the initial HLS playlist creation
	if err := session.WaitForReady(6 * time.Second); err != nil {
		c.JSON(http.StatusGatewayTimeout, gin.H{"error": "Live stream initialization timeout"})
		return
	}

	c.Header("Content-Type", "application/vnd.apple.mpegurl")
	c.Header("Cache-Control", "no-cache, no-store, must-revalidate")
	c.Header("Pragma", "no-cache")
	c.Header("Expires", "0")
	c.Header("Access-Control-Allow-Origin", "*")

	c.File(session.PlaylistPath)
}

// LiveSegmentHandler serves the transient .ts video segments
func LiveSegmentHandler(c *gin.Context) {
	idStr := c.Param("id")
	segment := c.Param("segment")

	camID, err := strconv.Atoi(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid camera ID"})
		return
	}

	// Sanitize segment name to prevent directory traversal
	cleanSegment := filepath.Base(segment)
	if cleanSegment != segment || cleanSegment == "." || cleanSegment == ".." {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid segment parameter"})
		return
	}

	GlobalHub.TouchSession(camID)

	segmentPath := filepath.Join(GlobalHub.baseDir, "cam_"+idStr, cleanSegment)
	if _, err := os.Stat(segmentPath); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Segment not found or expired"})
		return
	}

	c.Header("Content-Type", "video/MP2T")
	c.Header("Cache-Control", "no-cache")
	c.Header("Access-Control-Allow-Origin", "*")

	c.File(segmentPath)
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
		"is_live":   exists && session != nil && session.IsReady,
	})
}
