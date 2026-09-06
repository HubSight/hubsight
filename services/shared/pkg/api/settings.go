package api

import (
	"context"
	"errors"
	"net/http"

	"cctv/shared/pkg/database"
	"cctv/shared/pkg/models"
	"cctv/shared/pkg/storage"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type SettingsRequest struct {
	NvrStatus      *bool `json:"nvr_status"`
	StorageQuotaGb *int  `json:"storage_quota_gb"`
	RetentionDays  *int  `json:"retention_days"`
}

func getOrCreateSettings(ctx context.Context) (*models.Setting, error) {
	var s models.Setting
	err := database.DB.WithContext(ctx).First(&s).Error
	if err == nil {
		return &s, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	s = models.Setting{
		NvrStatus:      true,
		StorageQuotaGB: 50,
		RetentionDays:  4,
	}
	if err := database.DB.WithContext(ctx).Create(&s).Error; err != nil {
		return nil, err
	}
	return &s, nil
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

	updates := map[string]interface{}{}
	if req.NvrStatus != nil {
		updates["nvr_status"] = *req.NvrStatus
	}
	if req.StorageQuotaGb != nil {
		updates["storage_quota_gb"] = *req.StorageQuotaGb
	}
	if req.RetentionDays != nil {
		updates["retention_days"] = *req.RetentionDays
	}

	if len(updates) > 0 {
		if err := database.DB.WithContext(ctx).Model(&models.Setting{}).Where("id = ?", current.ID).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update settings"})
			return
		}
	}

	var updated models.Setting
	if err := database.DB.WithContext(ctx).First(&updated, "id = ?", current.ID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to reload settings"})
		return
	}

	c.JSON(http.StatusOK, updated)
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
