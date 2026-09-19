package adminapi

import (
	"errors"
	"net/http"
	"strings"

	"cctv/shared/pkg/auth"
	"cctv/shared/pkg/database"
	"cctv/shared/pkg/models"
	"cctv/shared/pkg/response"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// RegisterAuthGovernanceRoutes mounts the account/RBAC/client subset of the
// Admin catalog. It can be mounted by core-service at /admin/v1 and by
// auth-service under its local /admin/v1/auth namespace; both remain separate
// from the legacy /api/auth routes.
func RegisterAuthGovernanceRoutes(protected *gin.RouterGroup) {
	protected.GET("/permissions", RequirePermission("users:view", "users:manage"), auth.ListPermissionsHandler)
	protected.GET("/roles", RequirePermission("users:view", "roles:manage"), auth.ListRolesHandler)
	protected.POST("/roles", RequirePermission("roles:manage"), auth.CreateRoleHandler)
	protected.GET("/roles/:role_id", RequirePermission("users:view", "roles:manage"), AdminGetRoleHandler)
	protected.PATCH("/roles/:role_id", RequirePermission("roles:manage"), withParam("role_id", "id", auth.UpdateRoleHandler))
	protected.DELETE("/roles/:role_id", RequirePermission("roles:manage"), AdminDeleteRoleHandler)

	protected.GET("/users", RequirePermission("users:view", "users:manage"), auth.ListUsersHandler)
	protected.POST("/users", RequirePermission("users:manage"), auth.CreateUserHandler)
	protected.GET("/users/:user_id", RequirePermission("users:view", "users:manage"), AdminGetUserHandler)
	protected.PATCH("/users/:user_id", RequirePermission("users:manage"), withParam("user_id", "id", auth.UpdateUserHandler))
	protected.DELETE("/users/:user_id", RequirePermission("users:manage"), AdminDeleteUserHandler)
	protected.GET("/users/:user_id/sessions", RequirePermission("users:manage"), AdminListUserSessionsHandler)
	protected.DELETE("/users/:user_id/sessions/:session_id", RequirePermission("users:manage"), AdminRevokeUserSessionHandler)
	protected.POST("/users/:user_id/sessions\\:revoke-all", RequirePermission("users:manage"), AdminRevokeAllUserSessionsHandler)
	protected.POST("/users/:user_id", RequirePermission("users:manage"), AdminUserActionHandler)

	protected.GET("/clients", RequirePermission("clients:manage"), AdminListClientsHandler)
	protected.POST("/clients", RequirePermission("clients:manage"), AdminCreateClientHandler)
	protected.GET("/clients/:client_id", RequirePermission("clients:manage"), AdminGetClientHandler)
	protected.PATCH("/clients/:client_id", RequirePermission("clients:manage"), AdminPatchClientHandler)
	protected.POST("/clients\\:verify", RequirePermission("clients:manage"), AdminVerifyClientHandler)
	protected.DELETE("/clients/:client_id", RequirePermission("clients:manage"), AdminDeleteClientHandler)
	protected.POST("/clients/:client_id", RequirePermission("clients:manage"), AdminClientActionHandler)
}

func withParam(source, target string, handler gin.HandlerFunc) gin.HandlerFunc {
	return func(c *gin.Context) {
		value := pathParam(c, source)
		if value != "" && c.Param(target) == "" {
			c.Params = append(c.Params, gin.Param{Key: source, Value: value})
			c.Params = append(c.Params, gin.Param{Key: target, Value: value})
		}
		handler(c)
	}
}

// WithActionParam adapts an action-delimited route such as
// /google-service-accounts/{id}:activate to a handler that expects {id}.
// Gin exposes the whole segment as one wildcard value, so the adapter also
// validates the action suffix before invoking the domain handler.
func WithActionParam(param, target, action string, handler gin.HandlerFunc) gin.HandlerFunc {
	return func(c *gin.Context) {
		value, gotAction := splitAction(pathParam(c, param))
		if gotAction != action || value == "" {
			adminError(c, http.StatusNotFound, response.ErrNotFound, nil)
			return
		}
		c.Params = append(c.Params, gin.Param{Key: target, Value: value})
		handler(c)
	}
}

func pathParam(c *gin.Context, key string) string {
	if value := c.Param(key); value != "" {
		return value
	}
	for _, param := range c.Params {
		if strings.HasPrefix(param.Key, key+":") {
			return param.Value
		}
	}
	return ""
}

func splitAction(value string) (string, string) {
	parts := strings.SplitN(value, ":", 2)
	if len(parts) != 2 {
		return value, ""
	}
	return parts[0], parts[1]
}

func AdminUserActionHandler(c *gin.Context) {
	userID, action := splitAction(pathParam(c, "user_id"))
	if userID == "" {
		adminError(c, http.StatusNotFound, response.ErrNotFound, nil)
		return
	}
	c.Params = append(c.Params, gin.Param{Key: "user_id", Value: userID})
	switch action {
	case "reset-password":
		withParam("user_id", "id", auth.ResetUserPasswordHandler)(c)
	case "block":
		AdminBlockUserHandler(true)(c)
	case "unblock":
		AdminBlockUserHandler(false)(c)
	default:
		adminError(c, http.StatusNotFound, response.ErrNotFound, nil)
	}
}

func AdminClientActionHandler(c *gin.Context) {
	clientID, action := splitAction(pathParam(c, "client_id"))
	if clientID == "" {
		adminError(c, http.StatusNotFound, response.ErrNotFound, nil)
		return
	}
	c.Params = append(c.Params, gin.Param{Key: "client_id", Value: clientID})
	switch action {
	case "enable":
		AdminSetClientEnabledHandler(true)(c)
	case "disable":
		AdminSetClientEnabledHandler(false)(c)
	case "rotate-key":
		withParam("client_id", "id", auth.RotateClientKeyHandler)(c)
	default:
		adminError(c, http.StatusNotFound, response.ErrNotFound, nil)
	}
}

func AdminGetRoleHandler(c *gin.Context) {
	var role models.Role
	if err := database.DB.WithContext(c.Request.Context()).Preload("Permissions").First(&role, "id = ?", c.Param("role_id")).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			adminError(c, http.StatusNotFound, response.ErrNotFound, nil)
			return
		}
		adminError(c, http.StatusInternalServerError, response.ErrDatabaseError, nil)
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok", "data": role, "request_id": c.GetString("request_id")})
}

func AdminDeleteRoleHandler(c *gin.Context) {
	var role models.Role
	if err := database.DB.WithContext(c.Request.Context()).First(&role, "id = ?", c.Param("role_id")).Error; err != nil {
		adminError(c, http.StatusNotFound, response.ErrNotFound, nil)
		return
	}
	if role.IsSystem {
		adminError(c, http.StatusForbidden, response.ErrForbidden, gin.H{"reason": "system_role"})
		return
	}
	var req destructiveConfirmation
	if err := c.ShouldBindJSON(&req); err != nil || !confirmationMatches(req.Confirmation.Value, role.Name, role.Code) {
		adminError(c, http.StatusBadRequest, response.ErrInvalidInput, gin.H{"confirmation_required": role.Name})
		return
	}
	var users int64
	_ = database.DB.WithContext(c.Request.Context()).Model(&models.User{}).Where("role_id = ?", role.ID).Count(&users).Error
	if users > 0 {
		adminError(c, http.StatusConflict, response.ErrConflict, gin.H{"assigned_users": users})
		return
	}
	_ = database.DB.WithContext(c.Request.Context()).Model(&role).Association("Permissions").Clear()
	if err := database.DB.WithContext(c.Request.Context()).Delete(&role).Error; err != nil {
		adminError(c, http.StatusInternalServerError, response.ErrDatabaseError, nil)
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok", "request_id": c.GetString("request_id")})
}

func AdminGetUserHandler(c *gin.Context) {
	var user models.User
	if err := database.DB.WithContext(c.Request.Context()).Preload("RoleInfo.Permissions").First(&user, "id = ?", c.Param("user_id")).Error; err != nil {
		adminError(c, http.StatusNotFound, response.ErrNotFound, nil)
		return
	}
	auth.LoadUserPermissions(c.Request.Context(), &user)
	c.JSON(http.StatusOK, gin.H{"status": "ok", "data": user, "request_id": c.GetString("request_id")})
}

func AdminBlockUserHandler(blocked bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var user models.User
		if err := database.DB.WithContext(c.Request.Context()).First(&user, "id = ?", c.Param("user_id")).Error; err != nil {
			adminError(c, http.StatusNotFound, response.ErrNotFound, nil)
			return
		}
		current, _ := c.Get("user")
		if currentUser, ok := current.(*models.User); ok && currentUser.ID == user.ID && blocked {
			adminError(c, http.StatusBadRequest, response.ErrInvalidInput, gin.H{"reason": "cannot_block_current_user"})
			return
		}
		if user.Username == "admin" && blocked {
			adminError(c, http.StatusForbidden, response.ErrForbidden, gin.H{"reason": "default_admin"})
			return
		}
		if err := database.DB.WithContext(c.Request.Context()).Model(&user).Update("is_active", !blocked).Error; err != nil {
			adminError(c, http.StatusInternalServerError, response.ErrDatabaseError, nil)
			return
		}
		if blocked {
			_ = auth.RevokeAllUserSessions(c.Request.Context(), user.ID, "admin_block")
		}
		c.JSON(http.StatusOK, gin.H{"status": "ok", "is_active": !blocked, "user_id": user.ID, "request_id": c.GetString("request_id")})
	}
}

func AdminDeleteUserHandler(c *gin.Context) {
	var user models.User
	if err := database.DB.WithContext(c.Request.Context()).First(&user, "id = ?", c.Param("user_id")).Error; err != nil {
		adminError(c, http.StatusNotFound, response.ErrNotFound, nil)
		return
	}
	if user.Username == "admin" {
		adminError(c, http.StatusForbidden, response.ErrForbidden, gin.H{"reason": "default_admin"})
		return
	}
	var req destructiveConfirmation
	if err := c.ShouldBindJSON(&req); err != nil || !confirmationMatches(req.Confirmation.Value, user.Username, user.ID) {
		adminError(c, http.StatusBadRequest, response.ErrInvalidInput, gin.H{"confirmation_required": user.Username})
		return
	}
	_ = auth.RevokeAllUserSessions(c.Request.Context(), user.ID, "admin_delete")
	if err := database.DB.WithContext(c.Request.Context()).Delete(&user).Error; err != nil {
		adminError(c, http.StatusInternalServerError, response.ErrDatabaseError, nil)
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok", "request_id": c.GetString("request_id")})
}

func AdminListUserSessionsHandler(c *gin.Context) {
	sessions, err := auth.ListSessions(c.Request.Context(), c.Param("user_id"))
	if err != nil {
		adminError(c, http.StatusInternalServerError, response.ErrDatabaseError, nil)
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok", "data": sessions, "request_id": c.GetString("request_id")})
}

func AdminRevokeUserSessionHandler(c *gin.Context) {
	var session models.Session
	if err := database.DB.WithContext(c.Request.Context()).Where("id = ? AND user_id = ?", c.Param("session_id"), c.Param("user_id")).First(&session).Error; err != nil {
		adminError(c, http.StatusNotFound, response.ErrSessionNotFound, nil)
		return
	}
	if err := auth.RevokeSession(c.Request.Context(), session.ID, "admin_revoke"); err != nil {
		adminError(c, http.StatusInternalServerError, response.ErrDatabaseError, nil)
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok", "request_id": c.GetString("request_id")})
}

func AdminRevokeAllUserSessionsHandler(c *gin.Context) {
	var user models.User
	if err := database.DB.WithContext(c.Request.Context()).First(&user, "id = ?", c.Param("user_id")).Error; err != nil {
		adminError(c, http.StatusNotFound, response.ErrNotFound, nil)
		return
	}
	var req destructiveConfirmation
	if err := c.ShouldBindJSON(&req); err != nil || !confirmationMatches(req.Confirmation.Value, user.Username, user.ID) {
		adminError(c, http.StatusBadRequest, response.ErrInvalidInput, gin.H{"confirmation_required": user.Username})
		return
	}
	if err := auth.RevokeAllUserSessions(c.Request.Context(), user.ID, "admin_revoke_all"); err != nil {
		adminError(c, http.StatusInternalServerError, response.ErrDatabaseError, nil)
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok", "request_id": c.GetString("request_id")})
}

type adminClientRequest struct {
	Name         string `json:"name" binding:"required"`
	Platform     string `json:"platform" binding:"required"`
	Audience     string `json:"audience"`
	ClientType   string `json:"client_type"`
	RateLimitRPS int    `json:"rate_limit_rps"`
}

func redactClient(client models.ApiClient) gin.H {
	return gin.H{
		"id": client.ID, "client_id": client.ClientID, "name": client.Name,
		"platform": client.Platform, "audience": client.Audience,
		"client_type": client.ClientType, "is_active": client.IsActive,
		"is_system": client.IsSystem, "rate_limit_rps": client.RateLimitRPS,
		"created_at": client.CreatedAt, "updated_at": client.UpdatedAt,
		"last_used_at": client.LastUsedAt,
	}
}

func AdminListClientsHandler(c *gin.Context) {
	var clients []models.ApiClient
	if err := database.DB.WithContext(c.Request.Context()).Order("is_system desc, created_at desc").Find(&clients).Error; err != nil {
		adminError(c, http.StatusInternalServerError, response.ErrDatabaseError, nil)
		return
	}
	data := make([]gin.H, 0, len(clients))
	for _, client := range clients {
		data = append(data, redactClient(client))
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok", "data": data, "request_id": c.GetString("request_id")})
}

func AdminCreateClientHandler(c *gin.Context) {
	var req adminClientRequest
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.Name) == "" {
		adminError(c, http.StatusBadRequest, response.ErrInvalidInput, nil)
		return
	}
	platform := strings.TrimSpace(req.Platform)
	audience := strings.TrimSpace(req.Audience)
	switch platform {
	case models.PlatformMobile, models.PlatformWebSPA, models.PlatformThirdParty, models.PlatformAdminDesktop:
	default:
		adminError(c, http.StatusBadRequest, response.ErrInvalidInput, gin.H{"field": "platform"})
		return
	}
	if platform == models.PlatformAdminDesktop {
		audience = models.AudienceAdminAPI
	} else if audience == models.AudienceAdminAPI {
		adminError(c, http.StatusBadRequest, response.ErrInvalidInput, gin.H{"reason": "admin_api_requires_admin_desktop_platform"})
		return
	}
	if audience == "" {
		audience = "web_api"
	}
	apiKey, err := auth.GenerateClientApiKey(platform)
	if err != nil {
		adminError(c, http.StatusInternalServerError, response.ErrInternalError, nil)
		return
	}
	client := models.ApiClient{
		ClientID: auth.GenerateClientId(platform), APIKey: apiKey,
		Name: strings.TrimSpace(req.Name), Platform: platform, Audience: audience,
		ClientType: strings.TrimSpace(req.ClientType), IsActive: true,
		RateLimitRPS: req.RateLimitRPS,
	}
	if client.ClientType == "" {
		client.ClientType = models.ClientTypePublic
	}
	if err := database.DB.WithContext(c.Request.Context()).Create(&client).Error; err != nil {
		adminError(c, http.StatusConflict, response.ErrConflict, nil)
		return
	}
	data := redactClient(client)
	data["api_key"] = client.APIKey
	c.JSON(http.StatusCreated, gin.H{"status": "ok", "client": data, "request_id": c.GetString("request_id")})
}

func AdminGetClientHandler(c *gin.Context) {
	var client models.ApiClient
	if err := database.DB.WithContext(c.Request.Context()).Where("client_id = ? OR id = ?", c.Param("client_id"), c.Param("client_id")).First(&client).Error; err != nil {
		adminError(c, http.StatusNotFound, response.ErrClientNotFound, nil)
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok", "data": redactClient(client), "request_id": c.GetString("request_id")})
}

func AdminPatchClientHandler(c *gin.Context) {
	var client models.ApiClient
	if err := database.DB.WithContext(c.Request.Context()).Where("client_id = ? OR id = ?", c.Param("client_id"), c.Param("client_id")).First(&client).Error; err != nil {
		adminError(c, http.StatusNotFound, response.ErrClientNotFound, nil)
		return
	}
	var req struct {
		Name         *string `json:"name"`
		Platform     *string `json:"platform"`
		Audience     *string `json:"audience"`
		RateLimitRPS *int    `json:"rate_limit_rps"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		adminError(c, http.StatusBadRequest, response.ErrInvalidInput, nil)
		return
	}
	updates := map[string]any{}
	if req.Name != nil && strings.TrimSpace(*req.Name) != "" {
		updates["name"] = strings.TrimSpace(*req.Name)
	}
	if req.Platform != nil {
		platform := strings.TrimSpace(*req.Platform)
		switch platform {
		case models.PlatformMobile, models.PlatformWebSPA, models.PlatformThirdParty, models.PlatformAdminDesktop:
			updates["platform"] = platform
		default:
			adminError(c, http.StatusBadRequest, response.ErrInvalidInput, gin.H{"field": "platform"})
			return
		}
		if platform != models.PlatformAdminDesktop && req.Audience == nil {
			updates["audience"] = "web_api"
		}
	}
	if req.Audience != nil {
		audience := strings.TrimSpace(*req.Audience)
		if audience == models.AudienceAdminAPI && client.Platform != models.PlatformAdminDesktop {
			if platform, ok := updates["platform"].(string); !ok || platform != models.PlatformAdminDesktop {
				adminError(c, http.StatusBadRequest, response.ErrInvalidInput, gin.H{"reason": "admin_api_requires_admin_desktop_platform"})
				return
			}
		}
		updates["audience"] = audience
	}
	if req.RateLimitRPS != nil && *req.RateLimitRPS >= 0 {
		updates["rate_limit_rps"] = *req.RateLimitRPS
	}
	if platform, ok := updates["platform"].(string); ok && platform == models.PlatformAdminDesktop {
		updates["audience"] = models.AudienceAdminAPI
	}
	if len(updates) == 0 {
		adminError(c, http.StatusBadRequest, response.ErrInvalidInput, nil)
		return
	}
	if err := database.DB.WithContext(c.Request.Context()).Model(&client).Updates(updates).Error; err != nil {
		adminError(c, http.StatusInternalServerError, response.ErrDatabaseError, nil)
		return
	}
	_ = database.DB.WithContext(c.Request.Context()).First(&client, "id = ?", client.ID).Error
	c.JSON(http.StatusOK, gin.H{"status": "ok", "data": redactClient(client), "request_id": c.GetString("request_id")})
}

func AdminSetClientEnabledHandler(enabled bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var client models.ApiClient
		if err := database.DB.WithContext(c.Request.Context()).Where("client_id = ? OR id = ?", c.Param("client_id"), c.Param("client_id")).First(&client).Error; err != nil {
			adminError(c, http.StatusNotFound, response.ErrClientNotFound, nil)
			return
		}
		if client.IsSystem && !enabled {
			adminError(c, http.StatusForbidden, response.ErrForbidden, gin.H{"reason": "system_client"})
			return
		}
		if err := database.DB.WithContext(c.Request.Context()).Model(&client).Update("is_active", enabled).Error; err != nil {
			adminError(c, http.StatusInternalServerError, response.ErrDatabaseError, nil)
			return
		}
		client.IsActive = enabled
		c.JSON(http.StatusOK, gin.H{"status": "ok", "data": redactClient(client), "request_id": c.GetString("request_id")})
	}
}

func AdminVerifyClientHandler(c *gin.Context) {
	var req struct {
		ClientID string `json:"client_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.ClientID) == "" {
		adminError(c, http.StatusBadRequest, response.ErrInvalidInput, nil)
		return
	}
	var client models.ApiClient
	if err := database.DB.WithContext(c.Request.Context()).Where("client_id = ?", strings.TrimSpace(req.ClientID)).First(&client).Error; err != nil {
		adminError(c, http.StatusNotFound, response.ErrClientNotFound, nil)
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok", "valid": client.IsActive, "data": redactClient(client), "request_id": c.GetString("request_id")})
}

func AdminDeleteClientHandler(c *gin.Context) {
	var client models.ApiClient
	if err := database.DB.WithContext(c.Request.Context()).Where("client_id = ? OR id = ?", c.Param("client_id"), c.Param("client_id")).First(&client).Error; err != nil {
		adminError(c, http.StatusNotFound, response.ErrClientNotFound, nil)
		return
	}
	if client.IsSystem {
		adminError(c, http.StatusForbidden, response.ErrForbidden, gin.H{"reason": "system_client"})
		return
	}
	var req destructiveConfirmation
	if err := c.ShouldBindJSON(&req); err != nil || !confirmationMatches(req.Confirmation.Value, client.Name, client.ClientID) {
		adminError(c, http.StatusBadRequest, response.ErrInvalidInput, gin.H{"confirmation_required": client.Name})
		return
	}
	if err := database.DB.WithContext(c.Request.Context()).Delete(&client).Error; err != nil {
		adminError(c, http.StatusInternalServerError, response.ErrDatabaseError, nil)
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok", "request_id": c.GetString("request_id")})
}

type destructiveConfirmation struct {
	Confirmation struct {
		Value string `json:"value"`
	} `json:"confirmation"`
}

func confirmationMatches(value string, candidates ...string) bool {
	value = strings.TrimSpace(value)
	hasNamedCandidate := false
	for _, candidate := range candidates {
		candidate = strings.TrimSpace(candidate)
		if candidate != "" {
			hasNamedCandidate = true
		}
		if value != "" && candidate != "" && value == candidate {
			return true
		}
	}
	return !hasNamedCandidate && value == "yes"
}

func adminError(c *gin.Context, status int, code string, details gin.H) {
	body := gin.H{"status": "error", "code": code, "error": code, "request_id": c.GetString("request_id")}
	if details != nil {
		body["details"] = details
	}
	c.AbortWithStatusJSON(status, body)
}
