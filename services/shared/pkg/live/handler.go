package live

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"cctv/shared/pkg/database"

	"github.com/gin-gonic/gin"
)

func init() {
	// Start background cleanup of stale viewers at startup.
	Tracker.StartCleanup()
}

// WebRTCHandler acts as a signaling proxy for go2rtc.
func WebRTCHandler(c *gin.Context) {
	idStr := c.Param("id")
	if idStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid camera ID"})
		return
	}
	camID := idStr

	cam, err := database.Client.Camera.Get(c.Request.Context(), camID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Camera not found"})
		return
	}

	if !cam.IsActive {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Camera is currently inactive"})
		return
	}

	// Read SDP Offer from request body
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to read SDP offer"})
		return
	}

	// Check if pool-service is configured
	poolServiceURL := os.Getenv("POOL_SERVICE_URL")
	if poolServiceURL == "" {
		poolServiceURL = "http://pool-service:8085"
	}

	// 1. Forward WebRTC Offer to pool-service (which manages the <= 5 clients/conn scaling)
	poolSignalingURL := fmt.Sprintf("%s/api/pool/cameras/%s/webrtc", poolServiceURL, url.PathEscape(camID))
	poolReq, err := http.NewRequestWithContext(c.Request.Context(), http.MethodPost, poolSignalingURL, bytes.NewReader(body))
	if err == nil {
		poolReq.Header.Set("Content-Type", c.Request.Header.Get("Content-Type"))
		client := &http.Client{Timeout: 10 * time.Second}
		resp, err := client.Do(poolReq)
		if err == nil {
			defer resp.Body.Close()
			respBody, readErr := io.ReadAll(resp.Body)
			if readErr == nil && resp.StatusCode < 500 {
				if poolStreamName := resp.Header.Get("X-Pool-Stream-Name"); poolStreamName != "" {
					c.Header("X-Pool-Stream-Name", poolStreamName)
				}
				if poolConnIndex := resp.Header.Get("X-Pool-Conn-Index"); poolConnIndex != "" {
					c.Header("X-Pool-Conn-Index", poolConnIndex)
				}
				c.Data(resp.StatusCode, resp.Header.Get("Content-Type"), respBody)
				return
			}
		}
		fmt.Printf("[Live Proxy] pool-service unavailable (%v), falling back to direct go2rtc signaling\n", err)
	}

	// Fallback directly to go2rtc if pool-service is unreachable
	camName := fmt.Sprintf("cam_%s", camID)

	webrtcURL := os.Getenv("WEBRTC_SERVICE_URL")
	if webrtcURL == "" {
		webrtcURL = os.Getenv("GO2RTC_URL")
		if webrtcURL == "" {
			webrtcURL = "http://webrtc-service:1984"
		}
	}

	// Register stream directly in webrtc-service dynamically
	srcDirect := cam.Host
	if !strings.Contains(srcDirect, "#") {
		srcDirect = fmt.Sprintf("%s#backchannel=0#transport=tcp", srcDirect)
	} else if !strings.Contains(srcDirect, "transport=") {
		srcDirect = fmt.Sprintf("%s#transport=tcp", srcDirect)
	}
	srcFfmpeg := fmt.Sprintf("ffmpeg:%s#audio=opus", cam.Host)

	putURL := fmt.Sprintf("%s/api/streams?name=%s&src=%s&src=%s",
		webrtcURL,
		url.QueryEscape(camName),
		url.QueryEscape(srcDirect),
		url.QueryEscape(srcFfmpeg),
	)
	putReq, err := http.NewRequestWithContext(c.Request.Context(), http.MethodPut, putURL, nil)
	if err == nil {
		client := &http.Client{Timeout: 5 * time.Second}
		if putResp, err := client.Do(putReq); err == nil {
			putResp.Body.Close()
		}
	}

	// Forward SDP Offer to webrtc-service
	signalingURL := fmt.Sprintf("%s/api/webrtc?src=%s", webrtcURL, url.QueryEscape(camName))
	req, err := http.NewRequestWithContext(c.Request.Context(), http.MethodPost, signalingURL, bytes.NewReader(body))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create proxy request"})
		return
	}

	req.Header.Set("Content-Type", c.Request.Header.Get("Content-Type"))

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		fmt.Printf("go2rtc error reaching server: %v\n", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to reach go2rtc server: " + err.Error()})
		return
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read go2rtc answer"})
		return
	}

	if resp.StatusCode >= 300 {
		c.JSON(resp.StatusCode, gin.H{"error": fmt.Sprintf("go2rtc error: %s", string(respBody))})
		return
	}

	c.Data(resp.StatusCode, resp.Header.Get("Content-Type"), respBody)
}

// LiveStatusHandler returns real-time streaming health of a camera
func LiveStatusHandler(c *gin.Context) {
	idStr := c.Param("id")
	if idStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid camera ID"})
		return
	}
	camID := idStr

	cam, err := database.Client.Camera.Get(c.Request.Context(), camID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Camera not found"})
		return
	}

	// Since we delegate to go2rtc on the fly, we just return whether it's active in DB
	c.JSON(http.StatusOK, gin.H{
		"camera_id": camID,
		"is_live":   cam.IsActive,
	})
}

// AIHeartbeatHandler registers or refreshes a viewer for on-demand CV processing.
// The frontend calls this every 15 seconds while the user is watching a live stream.
// The viewer_id must be a stable UUID generated per browser session.
// When the first viewer registers for a camera, the vision-service will automatically
// pick it up on its next poll cycle and begin AI detection.
func AIHeartbeatHandler(c *gin.Context) {
	idStr := c.Param("id")
	if idStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid camera ID"})
		return
	}
	camID := idStr

	viewerID := c.Query("viewer_id")
	if viewerID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "viewer_id is required"})
		return
	}

	firstViewer := Tracker.RegisterViewer(camID, viewerID)
	c.JSON(http.StatusOK, gin.H{
		"camera_id":    camID,
		"viewer_id":    viewerID,
		"first_viewer": firstViewer, // true when CV was just activated for this camera
	})
}

// AIStopHandler explicitly unregisters a viewer, freeing CV resources immediately
// instead of waiting for the heartbeat TTL to expire.
func AIStopHandler(c *gin.Context) {
	idStr := c.Param("id")
	if idStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid camera ID"})
		return
	}
	camID := idStr

	viewerID := c.Query("viewer_id")
	if viewerID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "viewer_id is required"})
		return
	}

	lastViewer := Tracker.UnregisterViewer(camID, viewerID)
	c.JSON(http.StatusOK, gin.H{
		"camera_id":   camID,
		"viewer_id":   viewerID,
		"last_viewer": lastViewer, // true when CV was just deactivated for this camera
	})
}
