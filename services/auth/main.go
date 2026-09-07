package main

import (
	"context"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"strings"

	"cctv/shared/pkg/auth"
	"cctv/shared/pkg/config"
	"cctv/shared/pkg/database"
	"cctv/shared/pkg/models"
	"cctv/shared/pkg/mq"
	"cctv/shared/pkg/pb"

	"github.com/gin-gonic/gin"
	"google.golang.org/grpc"
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

	// Start gRPC server
	go func() {
		lis, err := net.Listen("tcp", ":50051")
		if err != nil {
			log.Fatalf("Failed to listen on gRPC port 50051: %v", err)
		}
		s := grpc.NewServer()
		pb.RegisterAuthServiceServer(s, &grpcAuthServer{})
		log.Printf("Auth Service gRPC listening on :50051")
		if err := s.Serve(lis); err != nil {
			log.Fatalf("Failed to serve gRPC: %v", err)
		}
	}()

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

		// Two-Factor Authentication verification during login
		authGroup.POST("/2fa/verify", auth.Verify2FAHandler)

		// Passkey / Passwordless Authentication (FIDO2)
		authGroup.POST("/passkeys/login/options", auth.PasskeyLoginOptionsHandler)
		authGroup.POST("/passkeys/login/verify", auth.PasskeyLoginVerifyHandler)

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
		protected.PUT("/timezone", auth.UpdateTimezoneHandler)
		protected.PUT("/preferences", auth.UpdatePreferencesHandler)

		// Two-Factor Authentication (2FA) Management
		protected.POST("/2fa/setup", auth.Setup2FAHandler)
		protected.POST("/2fa/enable", auth.Enable2FAHandler)
		protected.POST("/2fa/disable", auth.Disable2FAHandler)
		protected.POST("/2fa/recovery-codes", auth.RegenerateRecoveryCodesHandler)

		// Passkey (WebAuthn) Credential Management
		protected.GET("/passkeys", auth.ListPasskeysHandler)
		protected.POST("/passkeys/register/options", auth.PasskeyRegisterOptionsHandler)
		protected.POST("/passkeys/register/verify", auth.PasskeyRegisterVerifyHandler)
		protected.PUT("/passkeys/:id", auth.RenamePasskeyHandler)
		protected.DELETE("/passkeys/:id", auth.DeletePasskeyHandler)

		// Access Control & RBAC
		protected.GET("/permissions", auth.ListPermissionsHandler)
		protected.GET("/roles", auth.ListRolesHandler)
		protected.POST("/roles", auth.RequirePermission("roles:manage"), auth.CreateRoleHandler)
		protected.PUT("/roles/:id", auth.RequirePermission("roles:manage"), auth.UpdateRoleHandler)
		protected.DELETE("/roles/:id", auth.RequirePermission("roles:manage"), auth.DeleteRoleHandler)

		protected.GET("/users", auth.RequirePermission("users:view", "users:manage"), auth.ListUsersHandler)
		protected.POST("/users", auth.RequirePermission("users:manage"), auth.CreateUserHandler)
		protected.PUT("/users/:id", auth.RequirePermission("users:manage"), auth.UpdateUserHandler)
		protected.POST("/users/:id/reset-password", auth.RequirePermission("users:manage"), auth.ResetUserPasswordHandler)
		protected.DELETE("/users/:id", auth.RequirePermission("users:manage"), auth.DeleteUserHandler)
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
	Valid       bool         `json:"valid"`
	User        *models.User `json:"user,omitempty"`
	Role        string       `json:"role,omitempty"`
	Username    string       `json:"username,omitempty"`
	FullName    string       `json:"full_name,omitempty"`
	Permissions []string     `json:"permissions,omitempty"`
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
		Valid:       true,
		User:        u,
		Role:        string(u.Role),
		Username:    u.Username,
		FullName:    u.FullName,
		Permissions: u.Permissions,
	})
}

// gRPC Implementation
type grpcAuthServer struct {
	pb.UnimplementedAuthServiceServer
}

func (s *grpcAuthServer) VerifyToken(ctx context.Context, req *pb.VerifyTokenRequest) (*pb.VerifyTokenResponse, error) {
	if req.Token == "" {
		return &pb.VerifyTokenResponse{Valid: false}, nil
	}

	u, err := auth.GetUserBySession(ctx, req.Token)
	if err != nil || u == nil {
		return &pb.VerifyTokenResponse{Valid: false}, nil
	}

	return &pb.VerifyTokenResponse{
		Valid: true,
		User: &pb.UserData{
			Id:       u.ID,
			Username: u.Username,
			FullName: u.FullName,
			Role:     string(u.Role),
			IsActive: u.IsActive,
		},
	}, nil
}
