package router

import (
	"net/http"

	"strings"

	"cctv/internal/auth"
	"cctv/internal/camera"
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
			
			protected.GET("/cameras", camera.ListCamerasHandler)
			protected.POST("/cameras", camera.AddCameraHandler)
			protected.PUT("/cameras/:id", camera.UpdateCameraHandler)
			protected.DELETE("/cameras/:id", camera.DeleteCameraHandler)
			
			protected.GET("/archive/timeline", recording.TimelineHandler)
			protected.GET("/archive/:id/stream", recording.StreamHandler)
		}
	}

	return r
}
