package api

import (
	"context"
	"net/http"

	"cctv/ent"
	"cctv/internal/database"
	"cctv/internal/storage"
	"github.com/gin-gonic/gin"
)

type SettingsRequest struct {
	NvrStatus      *bool `json:"nvr_status"`
	StorageQuotaGb *int  `json:"storage_quota_gb"`
	RetentionDays  *int  `json:"retention_days"`
}

func getOrCreateSettings(ctx context.Context) (*ent.Setting, error) {
	set, err := database.Client.Setting.Query().Only(ctx)
	if err == nil {
		return set, nil
	}
	if !ent.IsNotFound(err) {
		return nil, err
	}

	return database.Client.Setting.Create().
		SetNvrStatus(true).
		SetStorageQuotaGB(50).
		SetRetentionDays(4).
		Save(ctx)
}

// GetSettings handles GET /api/settings
func GetSettings(c *gin.Context) {
	ctx := c.Request.Context()

	set, err := getOrCreateSettings(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to query settings"})
		return
	}

	c.JSON(http.StatusOK, set)
}

// UpdateSettings handles PUT /api/settings
func UpdateSettings(c *gin.Context) {
	ctx := c.Request.Context()

	var req SettingsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request payload"})
		return
	}

	current, err := getOrCreateSettings(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to query settings"})
		return
	}

	update := database.Client.Setting.UpdateOne(current)
	if req.NvrStatus != nil {
		update = update.SetNvrStatus(*req.NvrStatus)
	}
	if req.StorageQuotaGb != nil {
		update = update.SetStorageQuotaGB(*req.StorageQuotaGb)
	}
	if req.RetentionDays != nil {
		update = update.SetRetentionDays(*req.RetentionDays)
	}

	set, err := update.Save(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update settings"})
		return
	}

	c.JSON(http.StatusOK, set)
}

// CleanupStorage handles POST /api/settings/storage/cleanup
func CleanupStorage(c *gin.Context) {
	ctx := c.Request.Context()
	deletedCount, freedBytes, err := storage.CleanupAllArchives(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to clean up storage"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":       "Storage cleaned successfully",
		"deleted_count": deletedCount,
		"freed_bytes":   freedBytes,
	})
}
