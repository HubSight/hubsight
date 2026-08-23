package pool

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
)

func getPoolServiceURL() string {
	url := os.Getenv("POOL_SERVICE_URL")
	if url == "" {
		url = "http://pool-service:8085"
	}
	return url
}

// PoolStatusHandler proxies the connection pool status to pool-service (admin only)
func PoolStatusHandler(c *gin.Context) {
	poolURL := fmt.Sprintf("%s/api/pool/status", getPoolServiceURL())
	req, err := http.NewRequestWithContext(c.Request.Context(), http.MethodGet, poolURL, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create pool status request: " + err.Error()})
		return
	}

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "pool-service unreachable: " + err.Error()})
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read pool status response"})
		return
	}

	c.Data(resp.StatusCode, "application/json", body)
}

// PoolSyncHandler triggers manual re-synchronization of camera streams in pool-service (admin only)
func PoolSyncHandler(c *gin.Context) {
	poolURL := fmt.Sprintf("%s/api/pool/sync", getPoolServiceURL())
	req, err := http.NewRequestWithContext(c.Request.Context(), http.MethodPost, poolURL, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create sync request: " + err.Error()})
		return
	}

	secret := os.Getenv("M2M_SECRET")
	if secret == "" {
		secret = "cctv-internal-m2m-secret"
	}
	req.Header.Set("X-Service-Key", secret)

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "pool-service unreachable: " + err.Error()})
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read sync response"})
		return
	}

	c.Data(resp.StatusCode, "application/json", body)
}
