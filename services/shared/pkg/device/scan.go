package device

import (
	"bytes"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type hawkeyesStartBody struct {
	ExtraCIDRs   []string `json:"extra_cidrs"`
	ExcludeHosts []string `json:"exclude_hosts"`
}

type scanStartInput struct {
	ExtraCIDRs []string `json:"extra_cidrs"`
}

func hawkeyesBase() string {
	base := strings.TrimRight(os.Getenv("HAWKEYES_SERVICE_URL"), "/")
	if base == "" {
		base = "http://hawkeyes-service:8091"
	}
	return base
}

func extractHost(rtspURL string) string {
	rtspURL = strings.TrimSpace(rtspURL)
	if rtspURL == "" {
		return ""
	}
	if !strings.Contains(rtspURL, "://") {
		rtspURL = "rtsp://" + rtspURL
	}
	u, err := url.Parse(rtspURL)
	if err != nil {
		return ""
	}
	host := u.Hostname()
	if host == "" {
		host, _, _ = net.SplitHostPort(u.Host)
	}
	return strings.ToLower(host)
}

func existingCameraHosts(c *gin.Context) []string {
	devs, err := GetAll(c.Request.Context())
	if err != nil {
		return nil
	}
	seen := map[string]bool{}
	var out []string
	for _, d := range devs {
		h := extractHost(d.Host)
		if h == "" || seen[h] {
			continue
		}
		seen[h] = true
		out = append(out, h)
	}
	return out
}

func proxyHawkeyes(c *gin.Context, method, path string, body any) {
	var rdr io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		rdr = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(c.Request.Context(), method, hawkeyesBase()+path, rdr)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "Failed to reach hawkeyes-service"})
		return
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "Hawkeyes service unavailable"})
		return
	}
	defer resp.Body.Close()
	c.Status(resp.StatusCode)
	c.Header("Content-Type", resp.Header.Get("Content-Type"))
	_, _ = io.Copy(c.Writer, resp.Body)
}

func StartDeviceScanHandler(c *gin.Context) {
	var input scanStartInput
	_ = c.ShouldBindJSON(&input)
	proxyHawkeyes(c, http.MethodPost, "/internal/scan", hawkeyesStartBody{
		ExtraCIDRs:   input.ExtraCIDRs,
		ExcludeHosts: existingCameraHosts(c),
	})
}

func GetDeviceScanHandler(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing scan id"})
		return
	}
	proxyHawkeyes(c, http.MethodGet, "/internal/scan/"+id, nil)
}

func CancelDeviceScanHandler(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing scan id"})
		return
	}
	proxyHawkeyes(c, http.MethodPost, "/internal/scan/"+id+"/cancel", map[string]any{})
}
