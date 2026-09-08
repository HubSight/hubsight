package auth

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net/http"
	"strings"
	"time"

	"cctv/shared/pkg/database"
	"cctv/shared/pkg/models"
	"cctv/shared/pkg/nanoid"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// GenerateClientApiKey creates a secure, prefixed API key for a given client platform.
func GenerateClientApiKey(platform string) (string, error) {
	var prefix string
	switch platform {
	case models.PlatformMobile, "flutter_mobile":
		prefix = "hs_mob_"
	case models.PlatformWebSPA:
		prefix = "hs_web_"
	default:
		prefix = "hs_ext_"
	}

	b := make([]byte, 18) // 36 hex characters
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return prefix + hex.EncodeToString(b), nil
}

// GenerateClientId creates a human-readable unique client ID.
func GenerateClientId(platform string) string {
	var prefix string
	switch platform {
	case models.PlatformMobile, "flutter_mobile":
		prefix = "mob_"
	case models.PlatformWebSPA:
		prefix = "web_"
	default:
		prefix = "ext_"
	}
	return prefix + nanoid.New()
}

// ValidateClientApiKey verifies that an API key exists and is currently active.
// Automatically updates last_used_at with a 60-second debounce.
func ValidateClientApiKey(apiKey string) (*models.ApiClient, error) {
	apiKey = strings.TrimSpace(apiKey)
	if apiKey == "" {
		return nil, errors.New("api key is empty")
	}

	var client models.ApiClient
	if err := database.DB.Where("api_key = ?", apiKey).First(&client).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("client not found")
		}
		return nil, err
	}

	if !client.IsActive {
		return nil, errors.New("client is deactivated")
	}

	now := time.Now()
	if client.LastUsedAt == nil || now.Sub(*client.LastUsedAt) > time.Minute {
		go func(id string, t time.Time) {
			_ = database.DB.Model(&models.ApiClient{}).Where("id = ?", id).Update("last_used_at", &t).Error
		}(client.ID, now)
	}

	return &client, nil
}

// RequireClientKey middleware ensures requests include a valid, active X-API-Key.
// Allows requests with X-Service-Key for internal microservice calls.
func RequireClientKey() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Bypass if internal service key is present
		if serviceKey := c.GetHeader("X-Service-Key"); serviceKey != "" {
			c.Next()
			return
		}

		apiKey := c.GetHeader("X-API-Key")
		if apiKey == "" {
			apiKey = c.Query("api_key")
		}

		if apiKey == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "Missing X-API-Key header",
				"code":  "CLIENT_KEY_REQUIRED",
			})
			return
		}

		client, err := ValidateClientApiKey(apiKey)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error": "Invalid or deactivated client API key",
				"code":  "INVALID_CLIENT_KEY",
			})
			return
		}

		c.Set("api_client", client)
		c.Set("client_id", client.ClientID)
		c.Next()
	}
}

// ─── CLIENT MANAGEMENT HANDLERS ──────────────────────────────────────────────

// ListClientsHandler returns all registered API clients.
func ListClientsHandler(c *gin.Context) {
	ctx := c.Request.Context()
	var clients []models.ApiClient
	if err := database.DB.WithContext(ctx).
		Order("is_system desc, created_at desc").
		Find(&clients).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load clients"})
		return
	}
	c.JSON(http.StatusOK, clients)
}

type CreateClientRequest struct {
	Name         string `json:"name" binding:"required"`
	Platform     string `json:"platform" binding:"required"`
	ClientType   string `json:"client_type"`
	RateLimitRPS int    `json:"rate_limit_rps"`
}

// CreateClientHandler registers a new API client and generates a unique client_id & api_key.
func CreateClientHandler(c *gin.Context) {
	var req CreateClientRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Client name cannot be empty"})
		return
	}

	platform := strings.TrimSpace(req.Platform)
	switch platform {
	case models.PlatformMobile, "flutter_mobile", models.PlatformWebSPA, models.PlatformThirdParty:
		if platform == "flutter_mobile" {
			platform = models.PlatformMobile
		}
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid platform. Allowed: mobile, web_spa, third_party"})
		return
	}

	clientType := strings.TrimSpace(req.ClientType)
	if clientType == "" {
		clientType = models.ClientTypePublic
	}

	apiKey, err := GenerateClientApiKey(platform)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate API key"})
		return
	}

	clientID := GenerateClientId(platform)

	client := models.ApiClient{
		ID:           nanoid.New(),
		ClientID:     clientID,
		APIKey:       apiKey,
		Name:         name,
		Platform:     platform,
		ClientType:   clientType,
		IsActive:     true,
		IsSystem:     false,
		RateLimitRPS: req.RateLimitRPS,
	}

	if err := database.DB.WithContext(c.Request.Context()).Create(&client).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save client: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, client)
}

type UpdateClientRequest struct {
	Name         string `json:"name" binding:"required"`
	Platform     string `json:"platform" binding:"required"`
	RateLimitRPS int    `json:"rate_limit_rps"`
}

// UpdateClientHandler updates client metadata (Name, Platform, RateLimitRPS).
func UpdateClientHandler(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Client ID is required"})
		return
	}

	var req UpdateClientRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Client name cannot be empty"})
		return
	}

	ctx := c.Request.Context()
	var client models.ApiClient
	if err := database.DB.WithContext(ctx).First(&client, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Client not found"})
		return
	}

	platform := strings.TrimSpace(req.Platform)
	switch platform {
	case models.PlatformMobile, "flutter_mobile", models.PlatformWebSPA, models.PlatformThirdParty:
		if platform == "flutter_mobile" {
			platform = models.PlatformMobile
		}
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid platform"})
		return
	}

	client.Name = name
	client.Platform = platform
	client.RateLimitRPS = req.RateLimitRPS
	client.UpdatedAt = time.Now()

	if err := database.DB.WithContext(ctx).Save(&client).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update client"})
		return
	}

	c.JSON(http.StatusOK, client)
}

// ToggleClientHandler activates or deactivates an API client (Emergency Kill-Switch).
// Protects default system clients from being deactivated.
func ToggleClientHandler(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Client ID is required"})
		return
	}

	ctx := c.Request.Context()
	var client models.ApiClient
	if err := database.DB.WithContext(ctx).First(&client, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Client not found"})
		return
	}

	// Prevent deactivating system client
	if client.IsSystem && client.IsActive {
		c.JSON(http.StatusForbidden, gin.H{"error": "Cannot deactivate default system client"})
		return
	}

	client.IsActive = !client.IsActive
	client.UpdatedAt = time.Now()

	if err := database.DB.WithContext(ctx).Model(&client).Updates(map[string]interface{}{
		"is_active":  client.IsActive,
		"updated_at": client.UpdatedAt,
	}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to toggle client status"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":    "ok",
		"is_active": client.IsActive,
		"client":    client,
	})
}

// RotateClientKeyHandler regenerates a client's API key.
// Protects default system clients from key rotation.
func RotateClientKeyHandler(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Client ID is required"})
		return
	}

	ctx := c.Request.Context()
	var client models.ApiClient
	if err := database.DB.WithContext(ctx).First(&client, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Client not found"})
		return
	}

	if client.IsSystem {
		c.JSON(http.StatusForbidden, gin.H{"error": "Cannot rotate API key of default system client"})
		return
	}

	newKey, err := GenerateClientApiKey(client.Platform)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate new API key"})
		return
	}

	client.APIKey = newKey
	client.UpdatedAt = time.Now()

	if err := database.DB.WithContext(ctx).Model(&client).Updates(map[string]interface{}{
		"api_key":    newKey,
		"updated_at": client.UpdatedAt,
	}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to rotate API key"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":  "ok",
		"api_key": newKey,
		"client":  client,
	})
}

// DeleteClientHandler permanently deletes a non-system client.
func DeleteClientHandler(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Client ID is required"})
		return
	}

	ctx := c.Request.Context()
	var client models.ApiClient
	if err := database.DB.WithContext(ctx).First(&client, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Client not found"})
		return
	}

	if client.IsSystem {
		c.JSON(http.StatusForbidden, gin.H{"error": "Cannot delete default system client"})
		return
	}

	if err := database.DB.WithContext(ctx).Delete(&client).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete client"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// VerifyClientHandler checks if a given API key is valid.
func VerifyClientHandler(c *gin.Context) {
	apiKey := c.GetHeader("X-API-Key")
	if apiKey == "" {
		apiKey = c.Query("api_key")
	}

	if apiKey == "" {
		var req struct {
			APIKey string `json:"api_key"`
		}
		if err := c.ShouldBindJSON(&req); err == nil {
			apiKey = req.APIKey
		}
	}

	client, err := ValidateClientApiKey(apiKey)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"valid": false, "error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"valid":     true,
		"client_id": client.ClientID,
		"name":      client.Name,
		"platform":  client.Platform,
		"is_system": client.IsSystem,
	})
}
