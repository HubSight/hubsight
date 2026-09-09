package appapi

import (
	"cctv/shared/pkg/auth"

	"github.com/gin-gonic/gin"
)

// RegisterAppRoutes mounts all dedicated mobile & desktop app endpoints onto the router.
func RegisterAppRoutes(rg *gin.RouterGroup) {
	appV1 := rg.Group("/app/v1")

	// Global Middlewares for entire /app/v1:
	// 1. Kill-Switch (Admin toggle -> HTTP 503 Service Unavailable)
	// 2. Mandatory App API Key (X-API-Key header -> 401/403)
	appV1.Use(AppKillSwitchMiddleware())
	appV1.Use(RequireAppApiKeyMiddleware())

	// Public App Routes (require valid API Key only)
	appV1.GET("/system/status", GetSystemStatusHandler)
	appV1.POST("/auth/login", AppLoginHandler)
	appV1.POST("/auth/2fa/verify", AppVerify2FAHandler)
	appV1.POST("/auth/refresh", AppRefreshTokenHandler)

	// Authenticated App Routes (require valid API Key + User Bearer Token)
	protected := appV1.Group("")
	protected.Use(auth.Middleware())
	{
		// Auth Lifecycle
		protected.POST("/auth/change-password", AppChangePasswordHandler)
		protected.POST("/auth/logout", AppLogoutHandler)

		// Profile Management
		protected.GET("/profile", GetProfileHandler)
		protected.PATCH("/profile", UpdateProfileHandler)
		protected.PUT("/profile/password", AppChangePasswordHandler)
		protected.GET("/profile/sessions", ListSessionsHandler)
		protected.DELETE("/profile/sessions/:id", RevokeSessionHandler)

		// Cameras & Live Streaming (Single Camera)
		protected.GET("/cameras", ListCamerasHandler)
		protected.GET("/cameras/:id", GetCameraHandler)
		protected.POST("/cameras/:id/live/webrtc", LiveWebRTCHandler)
		protected.POST("/cameras/:id/live/heartbeat", LiveHeartbeatHandler)
		protected.POST("/cameras/:id/live/release", LiveReleaseHandler)

		// Cameras Live Multi-View (Batch Operations)
		protected.POST("/cameras/live/batch-webrtc", BatchLiveWebRTCHandler)
		protected.POST("/cameras/live/batch-heartbeat", BatchLiveHeartbeatHandler)
		protected.POST("/cameras/live/batch-release", BatchLiveReleaseHandler)

		// Archive / NVR Playback
		protected.GET("/cameras/:id/archive/calendar", GetArchiveCalendarHandler)
		protected.GET("/cameras/:id/archive/timeline", GetArchiveTimelineHandler)
		protected.GET("/archive/:recording_id/play", GetArchivePlayStreamHandler)
		protected.GET("/archive/:recording_id/thumbnail", GetArchiveThumbnailHandler)

		// Push Notifications & Alerts
		protected.POST("/notifications/push-token", RegisterPushTokenHandler)
		protected.DELETE("/notifications/push-token", UnregisterPushTokenHandler)
		protected.GET("/notifications", ListNotificationsHandler)
		protected.GET("/notifications/unread-count", GetUnreadCountHandler)
		protected.PATCH("/notifications/:id/read", MarkNotificationReadHandler)
		protected.POST("/notifications/read-all", MarkAllNotificationsReadHandler)
		protected.DELETE("/notifications/:id", DeleteNotificationHandler)
	}
}
