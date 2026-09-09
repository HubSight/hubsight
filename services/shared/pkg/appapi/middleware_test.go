package appapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func init() {
	gin.SetMode(gin.TestMode)
}

func TestAppKillSwitchMiddleware(t *testing.T) {
	r := gin.New()
	r.Use(AppKillSwitchMiddleware())
	r.GET("/test", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	// 1. Test when Kill-Switch is ACTIVE (Disabled = false -> 503)
	SetKillSwitchState(false)

	req503, _ := http.NewRequest(http.MethodGet, "/test", nil)
	w503 := httptest.NewRecorder()
	r.ServeHTTP(w503, req503)

	if w503.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected HTTP 503 when API disabled, got %d", w503.Code)
	}

	var resp503 map[string]any
	if err := json.Unmarshal(w503.Body.Bytes(), &resp503); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp503["code"] != "APP_API_DISABLED" {
		t.Errorf("expected code APP_API_DISABLED, got %v", resp503["code"])
	}
	if resp503["maintenance"] != true {
		t.Errorf("expected maintenance = true, got %v", resp503["maintenance"])
	}
	if w503.Header().Get("Retry-After") != "300" {
		t.Errorf("expected Retry-After: 300 header, got %s", w503.Header().Get("Retry-After"))
	}

	// 2. Test when Kill-Switch is INACTIVE (Enabled = true -> 200)
	SetKillSwitchState(true)

	req200, _ := http.NewRequest(http.MethodGet, "/test", nil)
	w200 := httptest.NewRecorder()
	r.ServeHTTP(w200, req200)

	if w200.Code != http.StatusOK {
		t.Fatalf("expected HTTP 200 when API enabled, got %d", w200.Code)
	}

	var resp200 map[string]any
	if err := json.Unmarshal(w200.Body.Bytes(), &resp200); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp200["status"] != "ok" {
		t.Errorf("expected status ok, got %v", resp200["status"])
	}
}

func TestRequireAppApiKeyMiddleware_MissingKey(t *testing.T) {
	r := gin.New()
	r.Use(RequireAppApiKeyMiddleware())
	r.GET("/test", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	// Request with no API key header
	req, _ := http.NewRequest(http.MethodGet, "/test", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected HTTP 401 when API key is missing, got %d", w.Code)
	}

	var resp map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp["code"] != "APP_KEY_REQUIRED" {
		t.Errorf("expected code APP_KEY_REQUIRED, got %v", resp["code"])
	}
}
