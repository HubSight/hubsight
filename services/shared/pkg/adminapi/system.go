package adminapi

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"cctv/shared/pkg/database"
	"cctv/shared/pkg/models"
	"cctv/shared/pkg/response"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// AdminSystemStatusHandler is the API-key-only readiness endpoint.
func AdminSystemStatusHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":            "ok",
		"api_version":       "v1",
		"admin_api_enabled": IsAdminAPIEnabled(),
		"server_time":       time.Now().UTC(),
		"features": gin.H{
			"live_streaming":     true,
			"archive_playback":   true,
			"multi_view_batch":   true,
			"realtime_websocket": true,
			"two_factor_auth":    true,
		},
		"request_id": c.GetString("request_id"),
	})
}

func AdminCapabilitiesHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status": "ok",
		"data": gin.H{
			"matrix_limit":              64,
			"supported_matrix_profiles": []string{"thumbnail", "matrix_64", "matrix_16", "focus"},
			"realtime_transport":        "json_websocket",
			"authentication":            []string{"bearer_jwt", "x_api_key"},
			"media_transport":           "webrtc",
		},
		"request_id": c.GetString("request_id"),
	})
}

func getOrCreateAdminSettings(c *gin.Context) (*models.Setting, error) {
	var setting models.Setting
	err := database.DB.WithContext(c.Request.Context()).First(&setting).Error
	if err == nil {
		return &setting, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	setting = models.Setting{
		NvrStatus:       true,
		StorageQuotaGB:  50,
		RetentionDays:   4,
		AppApiEnabled:   true,
		AdminApiEnabled: true,
	}
	if err := database.DB.WithContext(c.Request.Context()).Create(&setting).Error; err != nil {
		return nil, err
	}
	return &setting, nil
}

func AdminGetSettingsHandler(c *gin.Context) {
	setting, err := getOrCreateAdminSettings(c)
	if err != nil {
		abortError(c, http.StatusInternalServerError, response.ErrInternalError, nil)
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok", "data": setting, "request_id": c.GetString("request_id")})
}

type adminSettingsPatchRequest struct {
	NvrStatus       *bool `json:"nvr_status"`
	StorageQuotaGB  *int  `json:"storage_quota_gb"`
	RetentionDays   *int  `json:"retention_days"`
	AdminAPIEnabled *bool `json:"admin_api_enabled"`
}

func AdminPatchSettingsHandler(c *gin.Context) {
	var req adminSettingsPatchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		abortError(c, http.StatusBadRequest, response.ErrInvalidInput, nil)
		return
	}
	setting, err := getOrCreateAdminSettings(c)
	if err != nil {
		abortError(c, http.StatusInternalServerError, response.ErrInternalError, nil)
		return
	}
	updates := map[string]any{}
	if req.NvrStatus != nil {
		updates["nvr_status"] = *req.NvrStatus
	}
	if req.StorageQuotaGB != nil {
		if *req.StorageQuotaGB < 0 {
			abortError(c, http.StatusBadRequest, response.ErrInvalidInput, gin.H{"field": "storage_quota_gb"})
			return
		}
		updates["storage_quota_gb"] = *req.StorageQuotaGB
	}
	if req.RetentionDays != nil {
		if *req.RetentionDays < 0 {
			abortError(c, http.StatusBadRequest, response.ErrInvalidInput, gin.H{"field": "retention_days"})
			return
		}
		updates["retention_days"] = *req.RetentionDays
	}
	if req.AdminAPIEnabled != nil {
		updates["admin_api_enabled"] = *req.AdminAPIEnabled
	}
	if len(updates) > 0 {
		if err := database.DB.WithContext(c.Request.Context()).Model(&models.Setting{}).
			Where("id = ?", setting.ID).Updates(updates).Error; err != nil {
			abortError(c, http.StatusInternalServerError, response.ErrInternalError, nil)
			return
		}
		if req.AdminAPIEnabled != nil {
			SetKillSwitchState(*req.AdminAPIEnabled)
		}
	}

	var updated models.Setting
	if err := database.DB.WithContext(c.Request.Context()).First(&updated, "id = ?", setting.ID).Error; err != nil {
		abortError(c, http.StatusInternalServerError, response.ErrInternalError, nil)
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok", "data": updated, "request_id": c.GetString("request_id")})
}

type adminCameraDTO struct {
	ID                string    `json:"id"`
	Name              string    `json:"name"`
	Host              string    `json:"host"`
	Brand             string    `json:"brand"`
	RtspPort          int       `json:"rtsp_port"`
	RtspTransport     string    `json:"rtsp_transport"`
	IsActive          bool      `json:"is_active"`
	IsStopped         bool      `json:"is_stopped"`
	EnableAI          bool      `json:"enable_ai"`
	ShowBbox          bool      `json:"show_bbox"`
	NvrMode           string    `json:"nvr_mode"`
	RecordQuality     string    `json:"record_quality"`
	IsFixed           bool      `json:"is_fixed"`
	HomographyValid   bool      `json:"homography_valid"`
	OnvifEnabled      bool      `json:"onvif_enabled"`
	OnvifPtzSupported bool      `json:"onvif_ptz_supported"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

func toAdminCameraDTO(camera models.Camera) adminCameraDTO {
	return adminCameraDTO{
		ID:                camera.ID,
		Name:              camera.Name,
		Host:              camera.Host,
		Brand:             camera.Brand,
		RtspPort:          camera.RtspPort,
		RtspTransport:     camera.RtspTransport,
		IsActive:          camera.IsActive,
		IsStopped:         camera.IsStopped,
		EnableAI:          camera.EnableAi,
		ShowBbox:          camera.ShowBbox,
		NvrMode:           camera.NvrMode,
		RecordQuality:     camera.RecordQuality,
		IsFixed:           camera.IsFixed,
		HomographyValid:   camera.HomographyValid,
		OnvifEnabled:      camera.OnvifEnabled,
		OnvifPtzSupported: camera.OnvifPtzSupported,
		CreatedAt:         camera.CreatedAt,
		UpdatedAt:         camera.UpdatedAt,
	}
}

func AdminListCamerasHandler(c *gin.Context) {
	limit := 50
	if raw := strings.TrimSpace(c.Query("limit")); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 {
			abortError(c, http.StatusBadRequest, response.ErrInvalidInput, gin.H{"field": "limit"})
			return
		}
		limit = parsed
	}
	if limit > 100 {
		limit = 100
	}

	query := database.DB.WithContext(c.Request.Context()).Order("id ASC")
	if cursor := strings.TrimSpace(c.Query("cursor")); cursor != "" {
		query = query.Where("id > ?", cursor)
	}
	var cameras []models.Camera
	if err := query.Limit(limit + 1).Find(&cameras).Error; err != nil {
		abortError(c, http.StatusInternalServerError, response.ErrInternalError, nil)
		return
	}
	hasMore := len(cameras) > limit
	if hasMore {
		cameras = cameras[:limit]
	}
	data := make([]adminCameraDTO, 0, len(cameras))
	for _, camera := range cameras {
		data = append(data, toAdminCameraDTO(camera))
	}
	nextCursor := ""
	if hasMore && len(cameras) > 0 {
		nextCursor = cameras[len(cameras)-1].ID
	}
	c.JSON(http.StatusOK, gin.H{
		"data":        data,
		"next_cursor": nextCursor,
		"has_more":    hasMore,
		"request_id":  c.GetString("request_id"),
	})
}

func AdminGetCameraHandler(c *gin.Context) {
	var camera models.Camera
	if err := database.DB.WithContext(c.Request.Context()).First(&camera, "id = ?", c.Param("camera_id")).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			abortError(c, http.StatusNotFound, response.ErrDeviceNotFound, nil)
			return
		}
		abortError(c, http.StatusInternalServerError, response.ErrInternalError, nil)
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok", "data": toAdminCameraDTO(camera), "request_id": c.GetString("request_id")})
}

// RegisterCoreRoutes mounts the initial Admin API vertical slice on core-service.
func RegisterCoreRoutes(rg *gin.RouterGroup) {
	admin := rg.Group("")
	admin.Use(RequestIDMiddleware(), AdminKillSwitchMiddleware(), RequireAdminAPIKey())
	admin.GET("/system/status", AdminSystemStatusHandler)

	protected := admin.Group("")
	protected.Use(AdminJWTMiddleware())
	protected.GET("/system/capabilities", AdminCapabilitiesHandler)
	protected.GET("/system/settings", RequirePermission("system:settings"), AdminGetSettingsHandler)
	protected.PATCH("/system/settings", RequirePermission("system:settings"), AdminPatchSettingsHandler)
	protected.GET("/cameras", RequirePermission("cameras:view"), AdminListCamerasHandler)
	protected.GET("/cameras/:camera_id", RequirePermission("cameras:view"), AdminGetCameraHandler)
}
