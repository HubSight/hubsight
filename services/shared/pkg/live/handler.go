package live

import (
	"bytes"
	"cctv/shared/pkg/database"
	"cctv/shared/pkg/pb"
	"cctv/shared/pkg/pool"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

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

	if !cam.IsActive || cam.IsStopped {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Camera is currently stopped"})
		return
	}

	// Read SDP Offer from request body
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to read SDP offer"})
		return
	}

	// 1. Forward WebRTC Offer to pool-service via gRPC
	client := pool.GetGrpcClient()
	resp, err := client.SignalWebRTC(c.Request.Context(), &pb.SignalWebRTCRequest{
		CameraId:    camID,
		SdpOffer:    string(body),
		ContentType: c.Request.Header.Get("Content-Type"),
	})

	if err == nil {
		if resp.PoolStreamName != "" {
			c.Header("X-Pool-Stream-Name", resp.PoolStreamName)
		}
		if resp.PoolConnIndex != "" {
			c.Header("X-Pool-Conn-Index", resp.PoolConnIndex)
		}
		c.Data(http.StatusOK, c.Request.Header.Get("Content-Type"), []byte(resp.SdpAnswer))
		return
	}
	fmt.Printf("[Live Proxy] pool-service unavailable (%v), falling back to direct go2rtc signaling\n", err)

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
	srcFfmpeg := fmt.Sprintf("ffmpeg:%s#audio=opus", camName)

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

	httpClient := &http.Client{Timeout: 10 * time.Second}
	httpResp, err := httpClient.Do(req)
	if err != nil {
		fmt.Printf("go2rtc error reaching server: %v\n", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to reach go2rtc server: " + err.Error()})
		return
	}
	defer httpResp.Body.Close()

	respBody, err := io.ReadAll(httpResp.Body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read go2rtc answer"})
		return
	}

	if httpResp.StatusCode >= 300 {
		c.JSON(httpResp.StatusCode, gin.H{"error": fmt.Sprintf("go2rtc error: %s", string(respBody))})
		return
	}

	c.Data(httpResp.StatusCode, httpResp.Header.Get("Content-Type"), respBody)
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

	c.JSON(http.StatusOK, gin.H{
		"camera_id":  camID,
		"is_live":    cam.IsActive && !cam.IsStopped,
		"is_stopped": cam.IsStopped,
	})
}

// AIHeartbeatHandler registers or refreshes a live viewer session.
// Kept as a no-op-safe counter for NVR monitor fallback. Vision-service,
// recognition logs, and Web Push are independent of this heartbeat and
// run 24/7 for every camera with enable_ai=true.
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

// PoolReleaseHandler returns a live-pool lease when a viewer disconnects.
func PoolReleaseHandler(c *gin.Context) {
	camID := c.Param("id")
	streamName := c.Query("stream_name")
	if camID == "" || streamName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "camera id and stream_name are required"})
		return
	}

	client := pool.GetGrpcClient()
	_, err := client.ReleaseStream(c.Request.Context(), &pb.ReleaseStreamRequest{
		CameraId:   camID,
		StreamName: streamName,
	})
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "Failed to release pool stream: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "released", "stream_name": streamName})
}

// PoolHeartbeatHandler refreshes LastUsedAt on a live-pool lease so GC does not reap an active viewer.
func PoolHeartbeatHandler(c *gin.Context) {
	camID := c.Param("id")
	streamName := c.Query("stream_name")
	if camID == "" || streamName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "camera id and stream_name are required"})
		return
	}

	client := pool.GetGrpcClient()
	_, err := client.HeartbeatStream(c.Request.Context(), &pb.HeartbeatStreamRequest{
		CameraId:   camID,
		StreamName: streamName,
	})
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "Failed to heartbeat pool stream: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "alive", "stream_name": streamName})
}
