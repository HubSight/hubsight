package router

import (
	"net/http"

	"strings"

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
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization", "X-Requested-With"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
	}))

	// Public routes
	r.GET("/healthz", func(c *gin.Context) {
		c.String(http.StatusOK, "OK")
	})

	api := r.Group("/api")
	{
		authGroup := api.Group("/auth")
		{
			authGroup.POST("/login", auth.LoginHandler)
			authGroup.POST("/logout", auth.LogoutHandler)
		}

		// Protected routes
		protected := api.Group("/")
		protected.Use(auth.Middleware())
		{
			protected.GET("/auth/me", auth.MeHandler)
			protected.PUT("/auth/password", auth.ChangePasswordHandler)
			
			// Devices endpoints
			protected.GET("/devices", device.ListDevicesHandler)
			protected.POST("/devices", device.AddDeviceHandler)
			protected.PUT("/devices/:id", device.UpdateDeviceHandler)
			protected.DELETE("/devices/:id", device.DeleteDeviceHandler)

			// Camera endpoints (aliases for backward compatibility)
			protected.GET("/cameras", device.ListDevicesHandler)
			protected.POST("/cameras", device.AddDeviceHandler)
			protected.PUT("/cameras/:id", device.UpdateDeviceHandler)
			protected.DELETE("/cameras/:id", device.DeleteDeviceHandler)
			
			protected.GET("/archive/timeline", recording.TimelineHandler)
			protected.GET("/archive/:id/available-days", recording.AvailableDaysHandler)
			protected.GET("/archive/:id/stream", recording.StreamHandler)

			// Live streaming endpoints (WebRTC signaling)
			protected.POST("/live/:id/webrtc", live.WebRTCHandler)
			protected.GET("/live-status/:id", live.LiveStatusHandler)

			// NVR recorder monitor endpoint
			protected.GET("/recorder/status", nvr.NvrStatusHandler)
		}
	}

	return r
}
