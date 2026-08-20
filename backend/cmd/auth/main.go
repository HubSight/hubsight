package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"

	"cctv/ent"
	"cctv/internal/auth"
	"cctv/internal/config"
	"cctv/internal/database"
	"cctv/internal/mq"
	"github.com/gin-gonic/gin"
)

func main() {
	log.Println("Starting Standalone CCTV Auth Service (SSO/OIDC Ready)...")

	cfg := config.Load()
	if err := database.Connect(cfg.DatabaseURL); err != nil {
		log.Fatalf("Failed to initialize database in auth-service: %v", err)
	}
	defer database.Close()

	// Ensure default admin user exists
	if err := auth.CreateInitialUser(context.Background(), "admin", "123Qwe!@"); err != nil {
		log.Printf("CreateInitialUser notice: %v", err)
	}

	if err := mq.Init(); err != nil {
		log.Printf("RabbitMQ connection failed: %v", err)
	} else {
		defer mq.Close()
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8081"
	}

	r := gin.Default()

	// CORS Setup
	r.Use(func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")
		if origin != "" {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
		} else {
			c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		}
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	})

	// Health Check
	r.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok", "service": "auth-service"})
	})

	// OpenID Connect (OIDC) Discovery Endpoint
	r.GET("/.well-known/openid-configuration", func(c *gin.Context) {
		issuer := os.Getenv("OIDC_ISSUER")
		if issuer == "" {
			issuer = fmt.Sprintf("http://%s", c.Request.Host)
		}
		c.JSON(http.StatusOK, gin.H{
			"issuer":                                issuer,
			"authorization_endpoint":                fmt.Sprintf("%s/oauth2/authorize", issuer),
			"token_endpoint":                        fmt.Sprintf("%s/oauth2/token", issuer),
			"userinfo_endpoint":                     fmt.Sprintf("%s/auth/me", issuer),
			"jwks_uri":                              fmt.Sprintf("%s/.well-known/jwks.json", issuer),
			"response_types_supported":              []string{"code", "token", "id_token"},
			"subject_types_supported":               []string{"public"},
			"id_token_signing_alg_values_supported": []string{"RS256", "HS256"},
			"scopes_supported":                      []string{"openid", "profile", "email", "roles"},
			"claims_supported":                      []string{"sub", "iss", "name", "preferred_username", "roles"},
		})
	})

	// Public Auth Endpoints
	authGroup := r.Group("/auth")
	{
		authGroup.POST("/login", auth.LoginHandler)
		authGroup.POST("/refresh", auth.RefreshHandler)
		authGroup.POST("/logout", auth.LogoutHandler)

		// Internal Token Validation (called by cctv-api gateway / other microservices)
		authGroup.POST("/validate-token", handleValidateToken)
	}

	// Protected Auth Endpoints (require active session)
	protected := r.Group("/auth")
	protected.Use(auth.Middleware())
	{
		protected.GET("/me", auth.MeHandler)
		protected.PUT("/password", auth.ChangePasswordHandler)
		protected.POST("/verify-password", auth.VerifyPasswordHandler)
		protected.PUT("/locale", auth.UpdateLocaleHandler)
	}

	log.Printf("Auth Service listening on :%s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("Auth Service failed to start: %v", err)
	}
}

type ValidateTokenRequest struct {
	Token string `json:"token"`
}

type ValidateTokenResponse struct {
	Valid    bool      `json:"valid"`
	User     *ent.User `json:"user,omitempty"`
	Role     string    `json:"role,omitempty"`
	Username string    `json:"username,omitempty"`
	FullName string    `json:"full_name,omitempty"`
}

func handleValidateToken(c *gin.Context) {
	var req ValidateTokenRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.Token == "" {
		authHeader := c.GetHeader("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			req.Token = strings.TrimPrefix(authHeader, "Bearer ")
		} else {
			cookie, err := c.Cookie("session")
			if err == nil {
				req.Token = cookie
			}
		}
	}

	if req.Token == "" {
		c.JSON(http.StatusOK, ValidateTokenResponse{Valid: false})
		return
	}

	u, err := auth.GetUserBySession(c.Request.Context(), req.Token)
	if err != nil || u == nil {
		c.JSON(http.StatusOK, ValidateTokenResponse{Valid: false})
		return
	}

	c.JSON(http.StatusOK, ValidateTokenResponse{
		Valid:    true,
		User:     u,
		Role:     string(u.Role),
		Username: u.Username,
		FullName: u.FullName,
	})
}
