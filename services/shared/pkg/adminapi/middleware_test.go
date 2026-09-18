package adminapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestAdminKillSwitchMiddleware(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(RequestIDMiddleware(), AdminKillSwitchMiddleware())
	r.GET("/test", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "ok"}) })

	SetKillSwitchState(false)
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	resp := httptest.NewRecorder()
	r.ServeHTTP(resp, req)
	if resp.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 when Admin API is disabled, got %d", resp.Code)
	}
	if resp.Header().Get("Retry-After") != "300" {
		t.Fatalf("expected Retry-After 300, got %q", resp.Header().Get("Retry-After"))
	}
	var body map[string]any
	if err := json.Unmarshal(resp.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body["code"] != "ADMIN_API_DISABLED" || body["maintenance"] != true {
		t.Fatalf("unexpected maintenance response: %#v", body)
	}

	SetKillSwitchState(true)
	defer SetKillSwitchState(true)
	resp = httptest.NewRecorder()
	r.ServeHTTP(resp, httptest.NewRequest(http.MethodGet, "/test", nil))
	if resp.Code != http.StatusOK {
		t.Fatalf("expected 200 when Admin API is enabled, got %d", resp.Code)
	}
}

func TestRequireAdminAPIKeyRejectsQueryCredentials(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(RequestIDMiddleware(), RequireAdminAPIKey())
	r.GET("/test", func(c *gin.Context) { c.Status(http.StatusOK) })

	resp := httptest.NewRecorder()
	r.ServeHTTP(resp, httptest.NewRequest(http.MethodGet, "/test?api_key=admin-secret", nil))
	if resp.Code != http.StatusUnauthorized {
		t.Fatalf("expected query credentials to be rejected with 401, got %d", resp.Code)
	}
}
