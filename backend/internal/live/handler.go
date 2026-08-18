package live

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"

	"cctv/internal/database"

	"github.com/gin-gonic/gin"
)

// WebRTCHandler acts as a signaling proxy for go2rtc.
func WebRTCHandler(c *gin.Context) {
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

	// Read SDP Offer from request body
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to read SDP offer"})
		return
	}

	camName := fmt.Sprintf("cam_%d", camID)

	// 1. Ensure the stream is registered in go2rtc dynamically
	putURL := fmt.Sprintf("http://go2rtc:1984/api/streams?name=%s&src=%s", url.QueryEscape(camName), url.QueryEscape(cam.Host))
	putReq, err := http.NewRequestWithContext(c.Request.Context(), http.MethodPut, putURL, nil)
	if err == nil {
		client := &http.Client{}
		if putResp, err := client.Do(putReq); err == nil {
			putResp.Body.Close()
		}
	}

	// 2. Forward SDP Offer to go2rtc
	go2rtcURL := fmt.Sprintf("http://go2rtc:1984/api/webrtc?src=%s", url.QueryEscape(camName))
	req, err := http.NewRequestWithContext(c.Request.Context(), http.MethodPost, go2rtcURL, bytes.NewReader(body))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create proxy request"})
		return
	}
	
	// go2rtc expects raw SDP in body, or JSON if formatted. We just pass what we got.
	req.Header.Set("Content-Type", c.Request.Header.Get("Content-Type"))

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		fmt.Printf("go2rtc error reaching server: %v\n", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to reach go2rtc server: " + err.Error()})
		return
	}
	defer resp.Body.Close()

	// Read go2rtc Answer
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read go2rtc answer"})
		return
	}

	fmt.Printf("go2rtc responded with %d: %s\n", resp.StatusCode, string(respBody))

	if resp.StatusCode >= 300 {
		c.JSON(resp.StatusCode, gin.H{"error": fmt.Sprintf("go2rtc error: %s", string(respBody))})
		return
	}

	// Return SDP Answer to Frontend
	c.Data(resp.StatusCode, resp.Header.Get("Content-Type"), respBody)
}

// LiveStatusHandler returns real-time streaming health of a camera
func LiveStatusHandler(c *gin.Context) {
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

	// Since we delegate to go2rtc on the fly, we just return whether it's active in DB
	c.JSON(http.StatusOK, gin.H{
		"camera_id": camID,
		"is_live":   cam.IsActive,
	})
}
