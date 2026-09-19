package adminapi

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path/filepath"
	"strings"
	"time"

	"cctv/shared/pkg/appapi"
	"cctv/shared/pkg/database"
	"cctv/shared/pkg/device"
	"cctv/shared/pkg/live"
	"cctv/shared/pkg/member"
	"cctv/shared/pkg/models"
	"cctv/shared/pkg/mq"
	"cctv/shared/pkg/notification"
	"cctv/shared/pkg/nvr"
	"cctv/shared/pkg/pb"
	"cctv/shared/pkg/pool"
	"cctv/shared/pkg/recognitionlog"
	"cctv/shared/pkg/recording"
	"cctv/shared/pkg/response"
	"cctv/shared/pkg/storage"

	"github.com/gin-gonic/gin"
)

// RegisterCatalogCoreRoutes mounts catalog endpoints that are implemented by
// core-service domain packages. The paths are new Admin paths; only the
// domain service implementation is shared with the legacy API.
func RegisterCatalogCoreRoutes(rg *gin.RouterGroup) {
	protected := AdminProtectedGroup(rg)

	// Dashboard and system observability.
	protected.GET("/dashboard/summary", RequirePermission("system:monitor"), AdminDashboardSummaryHandler)
	protected.GET("/dashboard/activity", RequirePermission("system:monitor"), notification.ListNotificationsHandler)
	protected.GET("/system/health", RequirePermission("system:monitor"), AdminSystemHealthHandler)
	protected.POST("/system/storage\\:cleanup", RequirePermission("system:settings"), AdminStorageCleanupHandler)
	protected.GET("/system/audit-events", RequirePermission("system:monitor"), AdminAuditEventsHandler)

	// Camera inventory and lifecycle.
	protected.POST("/cameras", RequirePermission("cameras:manage"), device.AddDeviceHandler)
	protected.PATCH("/cameras/:camera_id", RequirePermission("cameras:manage"), withParam("camera_id", "id", device.UpdateDeviceHandler))
	protected.DELETE("/cameras/:camera_id", RequirePermission("cameras:manage"), AdminDeleteCameraHandler)
	protected.GET("/cameras/:camera_id/thumbnail", RequirePermission("cameras:view"), withParam("camera_id", "id", device.GetDeviceSnapshotHandler))
	protected.GET("/cameras/:camera_id/snapshot", RequirePermission("cameras:view"), withParam("camera_id", "id", device.GetDeviceSnapshotHandler))
	protected.PATCH("/cameras/:camera_id/homography", RequirePermission("cameras:manage"), withParam("camera_id", "id", device.SetHomographyHandler))
	protected.POST("/cameras/:camera_id/ptz\\:move", RequirePermission("cameras:manage"), withParam("camera_id", "id", device.CameraPTZHandler))
	protected.GET("/cameras/:camera_id/presets", RequirePermission("cameras:view"), withParam("camera_id", "id", device.GetCameraPresetsHandler))
	protected.POST("/cameras/:camera_id/presets", RequirePermission("cameras:manage"), withParam("camera_id", "id", device.ManageCameraPresetsHandler))
	protected.POST("/camera-discovery\\:scan", RequirePermission("cameras:manage"), device.StartDeviceScanHandler)
	protected.GET("/camera-discovery/jobs/:job_id", RequirePermission("cameras:manage"), withParam("job_id", "id", device.GetDeviceScanHandler))
	protected.POST("/camera-discovery/jobs/:job_action", RequirePermission("cameras:manage"), AdminDiscoveryActionHandler)
	protected.POST("/cameras\\:onvif-probe", RequirePermission("cameras:manage"), device.ProbeONVIFHandler)
	protected.GET("/cameras/:camera_id/recognition-logs", RequirePermission("members:view"), withParam("camera_id", "id", recognitionlog.ListHandler))
	protected.DELETE("/cameras/:camera_id/recognition-logs", RequirePermission("members:manage"), AdminClearRecognitionLogsHandler)
	protected.POST("/cameras/:camera_id", RequirePermission("cameras:manage"), AdminCameraActionHandler)

	// Live matrix and WebRTC. Batch negotiation is validated before the shared
	// signaling service is called and is hard-limited to 64 cameras.
	protected.GET("/live/capabilities", RequirePermission("cameras:view"), AdminLiveCapabilitiesHandler)
	protected.GET("/live/cameras", RequirePermission("cameras:view"), AdminLiveCamerasHandler)
	protected.POST("/live/sessions\\:negotiate", RequirePermission("cameras:view"), AdminLiveNegotiateHandler)
	protected.POST("/live/sessions\\:heartbeat", RequirePermission("cameras:view"), appapi.BatchLiveHeartbeatHandler)
	protected.POST("/live/sessions\\:release", RequirePermission("cameras:view"), appapi.BatchLiveReleaseHandler)
	protected.POST("/live/sessions\\:change-profile", RequirePermission("cameras:view"), AdminLiveChangeProfileHandler)
	protected.GET("/live/sessions\\:stats", RequirePermission("cameras:view"), pool.PoolStatusHandler)
	protected.POST("/live/sessions\\:qoe", RequirePermission("cameras:view"), AdminLiveQoEHandler)
	protected.GET("/live/cameras/:camera_id/status", RequirePermission("cameras:view"), withParam("camera_id", "id", live.LiveStatusHandler))

	// Archive and playback.
	protected.GET("/archive/timeline", RequirePermission("recordings:view"), recording.TimelineHandler)
	protected.GET("/archive/cameras/:camera_id/available-days", RequirePermission("recordings:view"), withParam("camera_id", "id", recording.AvailableDaysHandler))
	protected.GET("/archive/recordings/:recording_id", RequirePermission("recordings:view"), AdminGetRecordingHandler)
	protected.POST("/archive/recordings/:recording_action", RequirePermission("recordings:view"), AdminRecordingActionHandler)

	// Members, faces, and uploads.
	protected.GET("/members", RequirePermission("members:view"), member.ListMembersHandler)
	protected.POST("/members", RequirePermission("members:manage"), member.CreateMemberHandler)
	protected.GET("/members/:member_id", RequirePermission("members:view"), AdminGetMemberHandler)
	protected.PATCH("/members/:member_id", RequirePermission("members:manage"), withParam("member_id", "id", member.UpdateMemberHandler))
	protected.DELETE("/members/:member_id", RequirePermission("members:manage"), AdminDeleteMemberHandler)
	protected.PUT("/members/:member_id/avatar", RequirePermission("members:manage"), withParam("member_id", "id", member.UpdateMemberAvatarHandler))
	protected.DELETE("/members/:member_id/avatar", RequirePermission("members:manage"), AdminDeleteMemberAvatarHandler)
	protected.GET("/members/:member_id/faces", RequirePermission("members:view"), withParam("member_id", "id", member.ListMemberFacesHandler))
	protected.POST("/members/:member_id/faces\\:enroll", RequirePermission("members:manage"), withParam("member_id", "id", member.EnrollMemberFaceHandler))
	protected.DELETE("/members/:member_id/faces/:face_id", RequirePermission("members:manage"), AdminDeleteMemberFaceHandler)
	protected.POST("/members/:member_id/faces\\:batch-delete", RequirePermission("members:manage"), AdminBatchDeleteMemberFacesHandler)
	protected.POST("/uploads/images", RequirePermission("members:manage"), member.UploadImageHandler)
	protected.POST("/uploads/images\\:presign", RequirePermission("members:manage"), member.GetPresignedUploadURLHandler)

	// Notifications and native push subscriptions.
	protected.GET("/notifications", RequireAuthenticated(), notification.ListNotificationsHandler)
	protected.GET("/notifications/:notification_id", RequireAuthenticated(), AdminGetNotificationHandler)
	protected.PATCH("/notifications/:notification_id", RequireAuthenticated(), AdminPatchNotificationHandler)
	protected.POST("/notifications\\:read-all", RequireAuthenticated(), notification.MarkAllReadHandler)
	protected.DELETE("/notifications/:notification_id", RequireAuthenticated(), AdminDeleteNotificationHandler)
	protected.POST("/notifications\\:batch-delete", RequireAuthenticated(), AdminBatchDeleteNotificationsHandler)
	protected.POST("/notifications\\:clear", RequireAuthenticated(), AdminClearNotificationsHandler)
	protected.POST("/notifications\\:test", RequirePermission("system:monitor"), notification.TestPushHandler)
	protected.GET("/notifications/push-config", RequireAuthenticated(), notification.GetPushConfigHandler)
	protected.PUT("/notifications/push-subscriptions/current", RequireAuthenticated(), notification.SubscribePushHandler)
	protected.DELETE("/notifications/push-subscriptions/current", RequireAuthenticated(), AdminDeletePushSubscriptionHandler)

	// NVR and pool monitoring.
	protected.GET("/nvr/status", RequirePermission("system:monitor"), nvr.NvrStatusHandler)
	protected.GET("/pool/status", RequirePermission("system:monitor"), pool.PoolStatusHandler)
	protected.POST("/pool\\:sync", RequirePermission("system:monitor"), pool.PoolSyncHandler)

	// Scan jobs are the first persistent operation provider. Other async jobs
	// can adopt the same operation ID contract without changing the SDK route.
	protected.GET("/operations/:operation_id", RequirePermission("system:monitor"), withParam("operation_id", "id", device.GetDeviceScanHandler))
	protected.POST("/operations/:operation_id", RequirePermission("system:monitor"), AdminOperationActionHandler)
}

func AdminCameraActionHandler(c *gin.Context) {
	cameraID, action := splitAction(pathParam(c, "camera_id"))
	if cameraID == "" {
		adminError(c, http.StatusNotFound, response.ErrNotFound, nil)
		return
	}
	c.Params = append(c.Params, gin.Param{Key: "id", Value: cameraID}, gin.Param{Key: "camera_id", Value: cameraID})
	switch action {
	case "start":
		device.StartDeviceHandler(c)
	case "stop":
		device.StopDeviceHandler(c)
	case "restart":
		AdminRestartCameraHandler(c)
	default:
		adminError(c, http.StatusNotFound, response.ErrNotFound, nil)
	}
}

func AdminDiscoveryActionHandler(c *gin.Context) {
	jobID, action := splitAction(pathParam(c, "job_action"))
	if action != "cancel" || jobID == "" {
		adminError(c, http.StatusNotFound, response.ErrNotFound, nil)
		return
	}
	c.Params = append(c.Params, gin.Param{Key: "id", Value: jobID}, gin.Param{Key: "job_id", Value: jobID})
	device.CancelDeviceScanHandler(c)
}

func AdminRecordingActionHandler(c *gin.Context) {
	recordingID, action := splitAction(pathParam(c, "recording_action"))
	if recordingID == "" {
		adminError(c, http.StatusNotFound, response.ErrNotFound, nil)
		return
	}
	var kind string
	switch action {
	case "playback-url":
		kind = "playback"
	case "download-url":
		kind = "download"
	case "thumbnail-url":
		kind = "thumbnail"
	default:
		adminError(c, http.StatusNotFound, response.ErrNotFound, nil)
		return
	}
	c.Params = append(c.Params, gin.Param{Key: "recording_id", Value: recordingID})
	AdminRecordingURLHandler(kind)(c)
}

func AdminOperationActionHandler(c *gin.Context) {
	operationID, action := splitAction(pathParam(c, "operation_id"))
	if operationID == "" || action != "cancel" {
		adminError(c, http.StatusNotFound, response.ErrNotFound, nil)
		return
	}
	c.Params = append(c.Params, gin.Param{Key: "id", Value: operationID})
	device.CancelDeviceScanHandler(c)
}

func AdminDeleteCameraHandler(c *gin.Context) {
	var camera models.Camera
	if err := database.DB.WithContext(c.Request.Context()).First(&camera, "id = ?", c.Param("camera_id")).Error; err != nil {
		adminError(c, http.StatusNotFound, response.ErrDeviceNotFound, nil)
		return
	}
	var req destructiveConfirmation
	if err := c.ShouldBindJSON(&req); err != nil || !confirmationMatches(req.Confirmation.Value, camera.Name, camera.ID) {
		adminError(c, http.StatusBadRequest, response.ErrInvalidInput, gin.H{"confirmation_required": camera.Name})
		return
	}
	withParam("camera_id", "id", device.DeleteDeviceHandler)(c)
}

func AdminRestartCameraHandler(c *gin.Context) {
	id := c.Param("camera_id")
	if id == "" {
		adminError(c, http.StatusBadRequest, response.ErrInvalidDeviceID, nil)
		return
	}
	stopped, err := device.SetStopped(c.Request.Context(), id, true)
	if err != nil {
		adminError(c, http.StatusNotFound, response.ErrDeviceNotFound, nil)
		return
	}
	started, err := device.SetStopped(c.Request.Context(), id, false)
	if err != nil {
		adminError(c, http.StatusInternalServerError, response.ErrDeviceUpdateFailed, nil)
		return
	}
	mq.PublishCameraEvent("camera.stopped", device.CameraEventPayload(stopped))
	mq.PublishCameraEvent("camera.started", device.CameraEventPayload(started))
	c.JSON(http.StatusOK, gin.H{"status": "ok", "camera": started, "request_id": c.GetString("request_id")})
}

func AdminDashboardSummaryHandler(c *gin.Context) {
	ctx := c.Request.Context()
	var cameras, members, notifications, recordings int64
	if err := database.DB.WithContext(ctx).Model(&models.Camera{}).Count(&cameras).Error; err != nil {
		adminError(c, http.StatusInternalServerError, response.ErrDatabaseError, nil)
		return
	}
	_ = database.DB.WithContext(ctx).Model(&models.Member{}).Where("is_active = ?", true).Count(&members).Error
	_ = database.DB.WithContext(ctx).Model(&models.Notification{}).Where("is_read = ?", false).Count(&notifications).Error
	_ = database.DB.WithContext(ctx).Model(&models.Recording{}).Count(&recordings).Error
	c.JSON(http.StatusOK, gin.H{"status": "ok", "data": gin.H{
		"cameras": cameras, "active_members": members, "unread_notifications": notifications, "recordings": recordings,
	}, "request_id": c.GetString("request_id")})
}

func AdminSystemHealthHandler(c *gin.Context) {
	ctx := c.Request.Context()
	dbStatus := "ok"
	if database.DB == nil {
		dbStatus = "unavailable"
	} else if sqlDB, err := database.DB.DB(); err != nil || sqlDB.PingContext(ctx) != nil {
		dbStatus = "unavailable"
	}
	status := http.StatusOK
	if dbStatus != "ok" {
		status = http.StatusServiceUnavailable
	}
	c.JSON(status, gin.H{"status": map[bool]string{true: "ok", false: "degraded"}[status == http.StatusOK], "data": gin.H{
		"core_service": "ok", "database": dbStatus, "admin_api": IsAdminAPIEnabled(),
	}, "request_id": c.GetString("request_id")})
}

func AdminStorageCleanupHandler(c *gin.Context) {
	var req destructiveConfirmation
	if err := c.ShouldBindJSON(&req); err != nil || !confirmationMatches(req.Confirmation.Value) {
		adminError(c, http.StatusBadRequest, response.ErrInvalidInput, gin.H{"confirmation_required": "yes"})
		return
	}
	deleted, freed, err := storage.CleanupAllArchives(c.Request.Context())
	if err != nil {
		adminError(c, http.StatusInternalServerError, response.ErrStorageError, nil)
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok", "deleted_count": deleted, "freed_bytes": freed, "request_id": c.GetString("request_id")})
}

func AdminLiveCapabilitiesHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok", "data": gin.H{
		"matrix_limit": 64, "profiles": []string{"thumbnail", "matrix_64", "matrix_16", "focus"},
		"heartbeat_ttl_seconds": 45, "media_transport": "webrtc",
	}, "request_id": c.GetString("request_id")})
}

func AdminLiveCamerasHandler(c *gin.Context) {
	var cameras []models.Camera
	if err := database.DB.WithContext(c.Request.Context()).Order("id asc").Find(&cameras).Error; err != nil {
		adminError(c, http.StatusInternalServerError, response.ErrDatabaseError, nil)
		return
	}
	data := make([]gin.H, 0, len(cameras))
	for _, camera := range cameras {
		data = append(data, gin.H{"camera_id": camera.ID, "name": camera.Name, "is_live": camera.IsActive && !camera.IsStopped, "enable_ai": camera.EnableAi})
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok", "data": data, "request_id": c.GetString("request_id")})
}

func AdminLiveNegotiateHandler(c *gin.Context) {
	body, err := io.ReadAll(io.LimitReader(c.Request.Body, 8<<20))
	if err != nil {
		adminError(c, http.StatusBadRequest, response.ErrInvalidInput, nil)
		return
	}
	var input struct {
		Streams []struct {
			CameraID string `json:"camera_id"`
		} `json:"streams"`
		Cameras []struct {
			CameraID string `json:"camera_id"`
		} `json:"cameras"`
	}
	if err := json.Unmarshal(body, &input); err != nil {
		adminError(c, http.StatusBadRequest, response.ErrInvalidInput, nil)
		return
	}
	count := len(input.Streams)
	if count == 0 {
		count = len(input.Cameras)
	}
	if count == 0 || count > 64 {
		adminError(c, http.StatusBadRequest, response.ErrInvalidInput, gin.H{"max_cameras": 64})
		return
	}
	c.Request.Body = io.NopCloser(bytes.NewReader(body))
	appapi.BatchLiveWebRTCHandler(c)
}

// AdminLiveChangeProfileHandler migrates one live lease to a new profile. The
// pool keeps the old shared connection alive for its other viewers and only
// allocates a separate connection when the lease cannot be changed in place.
func AdminLiveChangeProfileHandler(c *gin.Context) {
	var req struct {
		CameraID   string `json:"camera_id"`
		StreamName string `json:"stream_name"`
		Profile    string `json:"profile"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.CameraID) == "" || strings.TrimSpace(req.StreamName) == "" || !live.IsLiveProfile(req.Profile) {
		adminError(c, http.StatusBadRequest, response.ErrInvalidInput, gin.H{"profiles": []string{live.LiveProfileThumbnail, live.LiveProfileMatrix64, live.LiveProfileMatrix16, live.LiveProfileFocus}})
		return
	}
	result, err := pool.GetGrpcClient().ChangeStreamProfile(c.Request.Context(), &pb.ChangeStreamProfileRequest{
		CameraId: req.CameraID, StreamName: req.StreamName, Profile: req.Profile,
	})
	if err != nil {
		adminError(c, http.StatusConflict, "LIVE_PROFILE_CHANGE_FAILED", gin.H{"reason": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok", "data": gin.H{
		"camera_id": req.CameraID, "stream_name": result.StreamName, "previous_stream_name": result.PreviousStreamName,
		"profile": result.Profile, "active_users": result.ActiveUsers, "migrated": result.Migrated,
	}, "request_id": c.GetString("request_id")})
}

func AdminGetRecordingHandler(c *gin.Context) {
	record, err := recording.GetByID(c.Request.Context(), c.Param("recording_id"))
	if err != nil {
		adminError(c, http.StatusNotFound, response.ErrRecordingNotFound, nil)
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok", "data": record, "request_id": c.GetString("request_id")})
}

func AdminRecordingURLHandler(kind string) gin.HandlerFunc {
	return func(c *gin.Context) {
		record, err := recording.GetByID(c.Request.Context(), c.Param("recording_id"))
		if err != nil {
			adminError(c, http.StatusNotFound, response.ErrRecordingNotFound, nil)
			return
		}
		objectKey := record.FilePath
		contentType := "video/mp4"
		if kind == "thumbnail" {
			if record.ThumbnailPath == nil || *record.ThumbnailPath == "" {
				adminError(c, http.StatusNotFound, response.ErrNotFound, nil)
				return
			}
			objectKey = *record.ThumbnailPath
			contentType = "image/jpeg"
		}
		if storage.S3Client == nil {
			adminError(c, http.StatusServiceUnavailable, response.ErrStorageUnavailable, nil)
			return
		}
		expiry := time.Hour
		query := url.Values{}
		if kind == "download" {
			name := filepath.Base(record.FilePath)
			if name == "" || name == "." {
				name = fmt.Sprintf("recording_%s.mp4", record.ID)
			}
			query.Set("response-content-disposition", fmt.Sprintf("attachment; filename=%q", name))
		}
		presigned, err := storage.S3Client.PresignedGetObject(c.Request.Context(), storage.S3Bucket, objectKey, expiry, query)
		if err != nil {
			adminError(c, http.StatusInternalServerError, response.ErrStorageError, nil)
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "ok", "data": gin.H{
			"recording_id": record.ID, "camera_id": record.CameraID, "url": presigned.String(), "content_type": contentType,
			"expires_at": time.Now().Add(expiry),
		}, "request_id": c.GetString("request_id")})
	}
}

func AdminGetMemberHandler(c *gin.Context) {
	var item models.Member
	if err := database.DB.WithContext(c.Request.Context()).Preload("Faces").First(&item, "id = ?", c.Param("member_id")).Error; err != nil {
		adminError(c, http.StatusNotFound, response.ErrMemberNotFound, nil)
		return
	}
	type faceDTO struct {
		ID             string    `json:"id"`
		MemberID       string    `json:"member_id"`
		SampleImageURL string    `json:"sample_image_url"`
		QualityScore   float64   `json:"quality_score"`
		Yaw            float64   `json:"yaw"`
		Pitch          float64   `json:"pitch"`
		BlurScore      float64   `json:"blur_score"`
		IsActive       bool      `json:"is_active"`
		CreatedAt      time.Time `json:"created_at"`
	}
	faces := make([]faceDTO, 0, len(item.Faces))
	for _, face := range item.Faces {
		faces = append(faces, faceDTO{
			ID: face.ID, MemberID: face.MemberID, SampleImageURL: face.SampleImageURL,
			QualityScore: face.QualityScore, Yaw: face.Yaw, Pitch: face.Pitch,
			BlurScore: face.BlurScore, IsActive: face.IsActive, CreatedAt: face.CreatedAt,
		})
	}
	data := gin.H{
		"id": item.ID, "name": item.Name, "role": item.Role, "avatar_url": item.AvatarURL,
		"is_active": item.IsActive, "created_at": item.CreatedAt, "updated_at": item.UpdatedAt,
		"faces": faces,
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok", "data": data, "request_id": c.GetString("request_id")})
}

func AdminDeleteMemberHandler(c *gin.Context) {
	var item models.Member
	if err := database.DB.WithContext(c.Request.Context()).First(&item, "id = ?", c.Param("member_id")).Error; err != nil {
		adminError(c, http.StatusNotFound, response.ErrMemberNotFound, nil)
		return
	}
	var req destructiveConfirmation
	if err := c.ShouldBindJSON(&req); err != nil || !confirmationMatches(req.Confirmation.Value, item.Name, item.ID) {
		adminError(c, http.StatusBadRequest, response.ErrInvalidInput, gin.H{"confirmation_required": item.Name})
		return
	}
	withParam("member_id", "id", member.DeleteMemberHandler)(c)
}

func AdminDeleteMemberAvatarHandler(c *gin.Context) {
	var item models.Member
	if err := database.DB.WithContext(c.Request.Context()).First(&item, "id = ?", c.Param("member_id")).Error; err != nil {
		adminError(c, http.StatusNotFound, response.ErrMemberNotFound, nil)
		return
	}
	if value, ok := readConfirmation(c); !ok || !confirmationMatches(value, item.Name, item.ID) {
		adminError(c, http.StatusBadRequest, response.ErrInvalidInput, gin.H{"confirmation_required": item.Name})
		return
	}
	withParam("member_id", "id", member.DeleteMemberAvatarHandler)(c)
}

func AdminDeleteMemberFaceHandler(c *gin.Context) {
	var face models.MemberFace
	if err := database.DB.WithContext(c.Request.Context()).Preload("Member").First(&face, "id = ? AND member_id = ?", c.Param("face_id"), c.Param("member_id")).Error; err != nil {
		adminError(c, http.StatusNotFound, response.ErrFaceSampleNotFound, nil)
		return
	}
	var req destructiveConfirmation
	name := ""
	if face.Member != nil {
		name = face.Member.Name
	}
	if err := c.ShouldBindJSON(&req); err != nil || !confirmationMatches(req.Confirmation.Value, name, face.ID) {
		adminError(c, http.StatusBadRequest, response.ErrInvalidInput, gin.H{"confirmation_required": nameOrYes(name)})
		return
	}
	member.DeleteMemberFaceHandler(c)
}

func AdminBatchDeleteMemberFacesHandler(c *gin.Context) {
	if value, ok := readConfirmation(c); !ok || !confirmationMatches(value) {
		adminError(c, http.StatusBadRequest, response.ErrInvalidInput, gin.H{"confirmation_required": "yes"})
		return
	}
	withParam("member_id", "id", member.BatchDeleteMemberFacesHandler)(c)
}

func AdminClearRecognitionLogsHandler(c *gin.Context) {
	var camera models.Camera
	if err := database.DB.WithContext(c.Request.Context()).First(&camera, "id = ?", c.Param("camera_id")).Error; err != nil {
		adminError(c, http.StatusNotFound, response.ErrDeviceNotFound, nil)
		return
	}
	var req destructiveConfirmation
	if err := c.ShouldBindJSON(&req); err != nil || !confirmationMatches(req.Confirmation.Value, camera.Name, camera.ID) {
		adminError(c, http.StatusBadRequest, response.ErrInvalidInput, gin.H{"confirmation_required": camera.Name})
		return
	}
	withParam("camera_id", "id", recognitionlog.ClearHandler)(c)
}

func AdminGetNotificationHandler(c *gin.Context) {
	var item models.Notification
	if err := database.DB.WithContext(c.Request.Context()).First(&item, "id = ?", c.Param("notification_id")).Error; err != nil {
		adminError(c, http.StatusNotFound, response.ErrNotificationNotFound, nil)
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok", "data": item, "request_id": c.GetString("request_id")})
}

func AdminPatchNotificationHandler(c *gin.Context) {
	var req struct {
		IsRead *bool `json:"is_read"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.IsRead == nil {
		adminError(c, http.StatusBadRequest, response.ErrInvalidInput, nil)
		return
	}
	result := database.DB.WithContext(c.Request.Context()).Model(&models.Notification{}).Where("id = ?", c.Param("notification_id")).Update("is_read", *req.IsRead)
	if result.Error != nil {
		adminError(c, http.StatusInternalServerError, response.ErrDatabaseError, nil)
		return
	}
	if result.RowsAffected == 0 {
		adminError(c, http.StatusNotFound, response.ErrNotificationNotFound, nil)
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok", "is_read": *req.IsRead, "request_id": c.GetString("request_id")})
}

func AdminDeleteNotificationHandler(c *gin.Context) {
	var item models.Notification
	if err := database.DB.WithContext(c.Request.Context()).First(&item, "id = ?", c.Param("notification_id")).Error; err != nil {
		adminError(c, http.StatusNotFound, response.ErrNotificationNotFound, nil)
		return
	}
	var req destructiveConfirmation
	if err := c.ShouldBindJSON(&req); err != nil || !confirmationMatches(req.Confirmation.Value) {
		adminError(c, http.StatusBadRequest, response.ErrInvalidInput, gin.H{"confirmation_required": "yes"})
		return
	}
	if err := database.DB.WithContext(c.Request.Context()).Delete(&item).Error; err != nil {
		adminError(c, http.StatusInternalServerError, response.ErrDatabaseError, nil)
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok", "request_id": c.GetString("request_id")})
}

func AdminBatchDeleteNotificationsHandler(c *gin.Context) {
	var req struct {
		IDs          []string `json:"ids"`
		Confirmation struct {
			Value string `json:"value"`
		} `json:"confirmation"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || len(req.IDs) == 0 || !confirmationMatches(req.Confirmation.Value) {
		adminError(c, http.StatusBadRequest, response.ErrInvalidInput, gin.H{"confirmation_required": "yes"})
		return
	}
	deleted, err := notification.BatchDeleteNotifications(c.Request.Context(), strings.Join(req.IDs, ","))
	if err != nil {
		adminError(c, http.StatusInternalServerError, response.ErrDatabaseError, nil)
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok", "deleted": deleted, "request_id": c.GetString("request_id")})
}

func AdminClearNotificationsHandler(c *gin.Context) {
	var req destructiveConfirmation
	if err := c.ShouldBindJSON(&req); err != nil || !confirmationMatches(req.Confirmation.Value) {
		adminError(c, http.StatusBadRequest, response.ErrInvalidInput, gin.H{"confirmation_required": "yes"})
		return
	}
	result := database.DB.WithContext(c.Request.Context()).Where("1 = 1").Delete(&models.Notification{})
	if result.Error != nil {
		adminError(c, http.StatusInternalServerError, response.ErrDatabaseError, nil)
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok", "deleted": result.RowsAffected, "request_id": c.GetString("request_id")})
}

func AdminDeletePushSubscriptionHandler(c *gin.Context) {
	var req struct {
		Endpoint string `json:"endpoint"`
		Token    string `json:"token"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || (strings.TrimSpace(req.Endpoint) == "" && strings.TrimSpace(req.Token) == "") {
		adminError(c, http.StatusBadRequest, response.ErrInvalidInput, nil)
		return
	}
	endpoint := strings.TrimSpace(req.Endpoint)
	if endpoint == "" {
		endpoint = notification.FCMEndpointPrefix + strings.TrimSpace(req.Token)
	}
	result := database.DB.WithContext(c.Request.Context()).Where("endpoint = ?", endpoint).Delete(&models.PushSubscription{})
	if result.Error != nil {
		adminError(c, http.StatusInternalServerError, response.ErrDatabaseError, nil)
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok", "deleted": result.RowsAffected, "request_id": c.GetString("request_id")})
}

func nameOrYes(name string) string {
	if strings.TrimSpace(name) == "" {
		return "yes"
	}
	return name
}

func readConfirmation(c *gin.Context) (string, bool) {
	body, err := io.ReadAll(io.LimitReader(c.Request.Body, 1<<20))
	if err != nil {
		return "", false
	}
	c.Request.Body = io.NopCloser(bytes.NewReader(body))
	var payload struct {
		Confirmation struct {
			Value string `json:"value"`
		} `json:"confirmation"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return "", false
	}
	return payload.Confirmation.Value, true
}
