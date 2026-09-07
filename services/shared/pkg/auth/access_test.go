package auth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"cctv/shared/pkg/models"

	"github.com/gin-gonic/gin"
)

func TestRequirePermission_AdminBypass(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()

	adminUser := &models.User{
		ID:       "admin_123",
		Username: "admin",
		Role:     models.RoleAdmin,
		IsActive: true,
	}

	r.Use(func(c *gin.Context) {
		c.Set("user", adminUser)
		c.Next()
	})

	r.GET("/test-protected", RequirePermission("cameras:manage"), func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	req := httptest.NewRequest(http.MethodGet, "/test-protected", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected status 200 for admin bypass, got %d", w.Code)
	}
}

func TestRequirePermission_ViewerAllowedAndDenied(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()

	viewerUser := &models.User{
		ID:          "viewer_123",
		Username:    "viewer01",
		Role:        models.RoleViewer,
		Permissions: []string{"cameras:view", "recordings:view"},
		IsActive:    true,
	}

	r.Use(func(c *gin.Context) {
		c.Set("user", viewerUser)
		c.Next()
	})

	r.GET("/allowed", RequirePermission("cameras:view"), func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	r.POST("/denied", RequirePermission("cameras:manage"), func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	// 1. Test allowed endpoint
	req1 := httptest.NewRequest(http.MethodGet, "/allowed", nil)
	w1 := httptest.NewRecorder()
	r.ServeHTTP(w1, req1)
	if w1.Code != http.StatusOK {
		t.Fatalf("Expected status 200 for allowed permission, got %d", w1.Code)
	}

	// 2. Test denied endpoint
	req2 := httptest.NewRequest(http.MethodPost, "/denied", nil)
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, req2)
	if w2.Code != http.StatusForbidden {
		t.Fatalf("Expected status 403 for denied permission, got %d", w2.Code)
	}
}

func TestLoadUserPermissions_NilSafe(t *testing.T) {
	// Should not panic on nil user
	LoadUserPermissions(context.Background(), nil)
}

func TestDeleteUserHandler_PermanentlyDisabled(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.DELETE("/users/:id", DeleteUserHandler)

	req := httptest.NewRequest(http.MethodDelete, "/users/user_123", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("Expected status 400 when attempting to delete user, got %d", w.Code)
	}
}
