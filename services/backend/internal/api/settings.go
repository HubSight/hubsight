package api

import (
	"net/http"

	"cctv/ent"
	"cctv/ent/setting"
	"cctv/internal/database"
	"cctv/internal/storage"
	"github.com/gin-gonic/gin"
)

type SettingsRequest struct {
	NvrStatus      *bool `json:"nvr_status"`
	StorageQuotaGb *int  `json:"storage_quota_gb"`
	RetentionDays  *int  `json:"retention_days"`
}

// GetSettings handles GET /api/settings
func GetSettings(c *gin.Context) {
	ctx := c.Request.Context()

	// Get or create default settings
	set, err := database.Client.Setting.Query().
		Where(setting.ID("global")).
		Only(ctx)

	if err != nil {
		if ent.IsNotFound(err) {
			set, err = database.Client.Setting.Create().
				SetID("global").
				SetNvrStatus(true).
				SetStorageQuotaGB(50).
				SetRetentionDays(4).
				Save(ctx)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create default settings"})
				return
			}
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to query settings"})
			return
		}
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

	update := database.Client.Setting.UpdateOneID("global")
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
		if ent.IsNotFound(err) {
			// If not found, create first then update
			creator := database.Client.Setting.Create().SetID("global")
			if req.NvrStatus != nil {
				creator = creator.SetNvrStatus(*req.NvrStatus)
			} else {
				creator = creator.SetNvrStatus(true)
			}
			if req.StorageQuotaGb != nil {
				creator = creator.SetStorageQuotaGB(*req.StorageQuotaGb)
			} else {
				creator = creator.SetStorageQuotaGB(50)
			}
			if req.RetentionDays != nil {
				creator = creator.SetRetentionDays(*req.RetentionDays)
			} else {
				creator = creator.SetRetentionDays(4)
			}
			set, err = creator.Save(ctx)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create and save settings"})
				return
			}
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update settings"})
			return
		}
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
		"message": "Storage cleaned successfully",
		"deleted_count": deletedCount,
		"freed_bytes": freedBytes,
	})
}
