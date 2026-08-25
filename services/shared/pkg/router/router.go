package router

import (
	"net/http"
	"strings"

	cctvapi "cctv/shared/pkg/api"
	"cctv/shared/pkg/auth"
	"cctv/shared/pkg/device"
	"cctv/shared/pkg/live"
	"cctv/shared/pkg/member"
	"cctv/shared/pkg/notification"
	"cctv/shared/pkg/nvr"
	"cctv/shared/pkg/pool"
	"cctv/shared/pkg/recognitionlog"
	"cctv/shared/pkg/recording"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func New() *gin.Engine {
	r := gin.Default()

	r.Use(cors.New(cors.Config{
		AllowOriginFunc: func(origin string) bool {
			return origin == "https://cctv.quoctran.space" || strings.HasPrefix(origin, "http://localhost") || strings.HasPrefix(origin, "https://localhost")
		},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization", "X-Requested-With", "X-Service-Key"},
		ExposeHeaders:    []string{"Content-Length", "X-Pool-Stream-Name", "X-Pool-Conn-Index"},
		AllowCredentials: true,
	}))

	// Health check
	r.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok", "service": "core-service"})
	})

	api := r.Group("/api")
	{
		// Internal service-to-service routes
		internal := api.Group("/internal")
		{
			internal.GET("/ai-cameras", device.ListAICamerasHandler)
			internal.GET("/pool/cameras", device.ListPoolCamerasHandler)
			internal.GET("/face-embeddings", member.ListAllEmbeddingsInternalHandler)
			internal.POST("/notifications/ingest", notification.IngestVisionEventHandler)
			internal.POST("/recognition-logs/ingest", recognitionlog.IngestHandler)
		}

		// Protected domain routes (Validated via auth-service)
		protected := api.Group("/")
		protected.Use(auth.Middleware())
		{
			// Members endpoints
			protected.GET("/members", member.ListMembersHandler)

			// Media / Image Upload & Presigned URL endpoints
			protected.POST("/upload/image", member.UploadImageHandler)
			protected.GET("/upload/presigned-url", member.GetPresignedUploadURLHandler)

			// Devices endpoints (Read is allowed for all authenticated users)
			protected.GET("/devices", device.ListDevicesHandler)
			protected.GET("/cameras", device.ListDevicesHandler)

			// Admin-only endpoints
			adminOnly := protected.Group("/")
			adminOnly.Use(auth.RequireRole("admin"))
			{
				// Member management
				adminOnly.POST("/members", member.CreateMemberHandler)
				adminOnly.PUT("/members/:id", member.UpdateMemberHandler)
				adminOnly.POST("/members/:id/avatar", member.UpdateMemberAvatarHandler)
				adminOnly.DELETE("/members/:id/avatar", member.DeleteMemberAvatarHandler)
				adminOnly.DELETE("/members/:id", member.DeleteMemberHandler)
				adminOnly.POST("/members/:id/faces/enroll", member.EnrollMemberFaceHandler)
				adminOnly.POST("/members/:id/faces", member.AddMemberFaceHandler)
				adminOnly.GET("/members/:id/faces", member.ListMemberFacesHandler)
				adminOnly.DELETE("/members/:id/faces", member.BatchDeleteMemberFacesHandler)
				adminOnly.DELETE("/members/:id/faces/:face_id", member.DeleteMemberFaceHandler)

				adminOnly.POST("/devices/scan", device.StartDeviceScanHandler)
				adminOnly.GET("/devices/scan/:id", device.GetDeviceScanHandler)
				adminOnly.POST("/devices/scan/:id/cancel", device.CancelDeviceScanHandler)
				adminOnly.POST("/devices", device.AddDeviceHandler)
				adminOnly.PUT("/devices/:id", device.UpdateDeviceHandler)
				adminOnly.DELETE("/devices/:id", device.DeleteDeviceHandler)

				adminOnly.POST("/cameras", device.AddDeviceHandler)
				adminOnly.PUT("/cameras/:id", device.UpdateDeviceHandler)
				adminOnly.DELETE("/cameras/:id", device.DeleteDeviceHandler)
				adminOnly.POST("/cameras/:id/stop", device.StopDeviceHandler)
				adminOnly.POST("/cameras/:id/start", device.StartDeviceHandler)
				adminOnly.POST("/devices/:id/stop", device.StopDeviceHandler)
				adminOnly.POST("/devices/:id/start", device.StartDeviceHandler)

				// NVR recorder monitor endpoint
				adminOnly.GET("/recorder/status", nvr.NvrStatusHandler)

				// Connection Pool & Stream monitor endpoints
				adminOnly.GET("/pool/status", pool.PoolStatusHandler)
				adminOnly.POST("/pool/sync", pool.PoolSyncHandler)

				// Global settings
				adminOnly.GET("/settings", cctvapi.GetSettings)
				adminOnly.PUT("/settings", cctvapi.UpdateSettings)
				adminOnly.POST("/settings/storage/cleanup", cctvapi.CleanupStorage)
			}

			// Archive and timeline endpoints
			protected.GET("/archive/timeline", recording.TimelineHandler)
			protected.GET("/archive/:id/available-days", recording.AvailableDaysHandler)
			protected.GET("/archive/:id/stream", recording.StreamHandler)
			protected.GET("/archive/:id/thumbnail", recording.ThumbnailHandler)

			// Notification endpoints
			protected.GET("/cameras/:id/recognition-logs", recognitionlog.ListHandler)
			protected.DELETE("/cameras/:id/recognition-logs", recognitionlog.ClearHandler)

			protected.GET("/notifications", notification.ListNotificationsHandler)
			protected.PATCH("/notifications/:id/read", notification.MarkReadHandler)
			protected.POST("/notifications/read-all", notification.MarkAllReadHandler)
			protected.DELETE("/notifications", notification.ClearAllNotificationsHandler)
			protected.DELETE("/notifications/:id", notification.DeleteNotificationHandler)
			protected.POST("/notifications/subscribe-push", notification.SubscribePushHandler)
			protected.GET("/notifications/vapid-key", notification.GetVapidPublicKeyHandler)

			// Live streaming endpoints (WebRTC signaling)
			protected.POST("/live/:id/webrtc", live.WebRTCHandler)
			protected.GET("/live-status/:id", live.LiveStatusHandler)
			protected.POST("/live/:id/release", live.PoolReleaseHandler)
			protected.POST("/live/:id/heartbeat", live.PoolHeartbeatHandler)
			// Optional live-viewer heartbeat (NVR monitor fallback only).
			// Does NOT start/stop vision-service — CV + logs + push run 24/7 when enable_ai.
			protected.POST("/live/:id/ai/heartbeat", live.AIHeartbeatHandler)
			protected.POST("/live/:id/ai/stop", live.AIStopHandler)
		}
	}

	return r
}
