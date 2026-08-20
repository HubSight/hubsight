package router

import (
	"net/http"
	"strings"

	cctvapi "cctv/internal/api"
	"cctv/internal/auth"
	"cctv/internal/device"
	"cctv/internal/live"
	"cctv/internal/nvr"
	"cctv/internal/recording"
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
		ExposeHeaders:    []string{"Content-Length"},
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
		}

		// Protected domain routes (Validated via auth-service)
		protected := api.Group("/")
		protected.Use(auth.Middleware())
		{
			// Devices endpoints (Read is allowed for all authenticated users)
			protected.GET("/devices", device.ListDevicesHandler)
			protected.GET("/cameras", device.ListDevicesHandler)

			// Admin-only endpoints
			adminOnly := protected.Group("/")
			adminOnly.Use(auth.RequireRole("admin"))
			{
				adminOnly.POST("/devices", device.AddDeviceHandler)
				adminOnly.PUT("/devices/:id", device.UpdateDeviceHandler)
				adminOnly.DELETE("/devices/:id", device.DeleteDeviceHandler)

				adminOnly.POST("/cameras", device.AddDeviceHandler)
				adminOnly.PUT("/cameras/:id", device.UpdateDeviceHandler)
				adminOnly.DELETE("/cameras/:id", device.DeleteDeviceHandler)

				// NVR recorder monitor endpoint
				adminOnly.GET("/recorder/status", nvr.NvrStatusHandler)
				
				// Global settings
				adminOnly.GET("/settings", cctvapi.GetSettings)
				adminOnly.PUT("/settings", cctvapi.UpdateSettings)
				adminOnly.POST("/settings/storage/cleanup", cctvapi.CleanupStorage)
			}

			// Archive and timeline endpoints
			protected.GET("/archive/timeline", recording.TimelineHandler)
			protected.GET("/archive/:id/available-days", recording.AvailableDaysHandler)
			protected.GET("/archive/:id/stream", recording.StreamHandler)

			// Live streaming endpoints (WebRTC signaling)
			protected.POST("/live/:id/webrtc", live.WebRTCHandler)
			protected.GET("/live-status/:id", live.LiveStatusHandler)
		}
	}

	return r
}
