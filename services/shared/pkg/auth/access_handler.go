package auth

import (
	"net/http"
	"strings"

	"cctv/shared/pkg/database"
	"cctv/shared/pkg/models"
	"cctv/shared/pkg/mq"
	"cctv/shared/pkg/nanoid"

	"github.com/gin-gonic/gin"
)

// ─── PERMISSIONS ─────────────────────────────────────────────────────────────

// ListPermissionsHandler returns all available permissions grouped by module.
func ListPermissionsHandler(c *gin.Context) {
	ctx := c.Request.Context()
	var perms []models.Permission
	if err := database.DB.WithContext(ctx).Order("module asc, code asc").Find(&perms).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load permissions"})
		return
	}
	c.JSON(http.StatusOK, perms)
}

// ─── ROLES ───────────────────────────────────────────────────────────────────

// ListRolesHandler returns all roles with their assigned permissions.
func ListRolesHandler(c *gin.Context) {
	ctx := c.Request.Context()
	var roles []models.Role
	if err := database.DB.WithContext(ctx).
		Preload("Permissions").
		Order("is_system desc, name asc").
		Find(&roles).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load roles"})
		return
	}
	c.JSON(http.StatusOK, roles)
}

type CreateRoleRequest struct {
	Name          string   `json:"name" binding:"required"`
	Code          string   `json:"code" binding:"required"`
	Description   string   `json:"description"`
	PermissionIDs []string `json:"permission_ids"`
}

// CreateRoleHandler creates a new custom role.
func CreateRoleHandler(c *gin.Context) {
	var req CreateRoleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Name and code are required"})
		return
	}

	code := strings.ToLower(strings.TrimSpace(req.Code))
	name := strings.TrimSpace(req.Name)

	if code == "" || name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Role code and name cannot be empty"})
		return
	}

	ctx := c.Request.Context()

	// Check unique code
	var count int64
	_ = database.DB.WithContext(ctx).Model(&models.Role{}).Where("code = ?", code).Count(&count).Error
	if count > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "Role code already exists"})
		return
	}

	role := models.Role{
		ID:          nanoid.New(),
		Code:        code,
		Name:        name,
		Description: strings.TrimSpace(req.Description),
		IsSystem:    false,
	}

	if len(req.PermissionIDs) > 0 {
		var perms []*models.Permission
		_ = database.DB.WithContext(ctx).Where("id IN ?", req.PermissionIDs).Find(&perms).Error
		role.Permissions = perms
	}

	if err := database.DB.WithContext(ctx).Create(&role).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create role: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, role)
}

type UpdateRoleRequest struct {
	Name          string   `json:"name" binding:"required"`
	Description   string   `json:"description"`
	PermissionIDs []string `json:"permission_ids"`
}

// UpdateRoleHandler updates an existing role's metadata and permissions.
func UpdateRoleHandler(c *gin.Context) {
	id := c.Param("id")
	var req UpdateRoleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Name is required"})
		return
	}

	ctx := c.Request.Context()
	var role models.Role
	if err := database.DB.WithContext(ctx).Preload("Permissions").First(&role, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Role not found"})
		return
	}

	role.Name = strings.TrimSpace(req.Name)
	role.Description = strings.TrimSpace(req.Description)

	if err := database.DB.WithContext(ctx).Save(&role).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update role"})
		return
	}

	// Update permissions (for admin role, preserve all permissions)
	if role.Code != "admin" {
		var perms []*models.Permission
		if len(req.PermissionIDs) > 0 {
			_ = database.DB.WithContext(ctx).Where("id IN ?", req.PermissionIDs).Find(&perms).Error
		}
		_ = database.DB.WithContext(ctx).Model(&role).Association("Permissions").Replace(perms)
	}

	// Reload with updated permissions
	_ = database.DB.WithContext(ctx).Preload("Permissions").First(&role, "id = ?", id).Error
	c.JSON(http.StatusOK, role)
}

// DeleteRoleHandler removes a custom role if no users are currently assigned.
func DeleteRoleHandler(c *gin.Context) {
	id := c.Param("id")
	ctx := c.Request.Context()

	var role models.Role
	if err := database.DB.WithContext(ctx).First(&role, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Role not found"})
		return
	}

	if role.IsSystem {
		c.JSON(http.StatusForbidden, gin.H{"error": "Cannot delete system roles"})
		return
	}

	// Check if any user uses this role
	var userCount int64
	_ = database.DB.WithContext(ctx).Model(&models.User{}).Where("role_id = ?", id).Count(&userCount).Error
	if userCount > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot delete role while it is still assigned to users"})
		return
	}

	// Clear associations then delete role
	_ = database.DB.WithContext(ctx).Model(&role).Association("Permissions").Clear()
	if err := database.DB.WithContext(ctx).Delete(&role).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete role"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok", "message": "Role deleted successfully"})
}

// ─── USERS ───────────────────────────────────────────────────────────────────

// ListUsersHandler returns all users with their resolved role and permissions.
func ListUsersHandler(c *gin.Context) {
	ctx := c.Request.Context()
	var users []models.User
	if err := database.DB.WithContext(ctx).
		Preload("RoleInfo.Permissions").
		Order("created_at asc").
		Find(&users).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load users"})
		return
	}

	for i := range users {
		LoadUserPermissions(ctx, &users[i])
	}

	c.JSON(http.StatusOK, users)
}

type CreateUserRequest struct {
	Username           string  `json:"username" binding:"required"`
	FullName           string  `json:"full_name"`
	Password           string  `json:"password" binding:"required"`
	RoleID             *string `json:"role_id"`
	IsActive           *bool   `json:"is_active"`
	MustChangePassword *bool   `json:"must_change_password"`
}

// CreateUserHandler creates a new user account and links their initial role.
func CreateUserHandler(c *gin.Context) {
	var req CreateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Username and password are required"})
		return
	}

	username := strings.ToLower(strings.TrimSpace(req.Username))
	if len(username) < 3 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Username must be at least 3 characters"})
		return
	}
	if len(req.Password) < 6 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Password must be at least 6 characters"})
		return
	}

	ctx := c.Request.Context()
	var count int64
	_ = database.DB.WithContext(ctx).Model(&models.User{}).Where("username = ?", username).Count(&count).Error
	if count > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "Username already exists"})
		return
	}

	hash, err := hashPassword(req.Password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
		return
	}

	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	mustChange := true
	if req.MustChangePassword != nil {
		mustChange = *req.MustChangePassword
	}

	legacyRole := models.RoleViewer
	if req.RoleID != nil && *req.RoleID != "" {
		var role models.Role
		if err := database.DB.WithContext(ctx).First(&role, "id = ?", *req.RoleID).Error; err == nil {
			if role.Code == "admin" {
				legacyRole = models.RoleAdmin
			}
		}
	}

	newUser := models.User{
		Username:           username,
		FullName:           strings.TrimSpace(req.FullName),
		PasswordHash:       hash,
		Role:               legacyRole,
		RoleID:             req.RoleID,
		IsActive:           isActive,
		MustChangePassword: mustChange,
	}

	if err := database.DB.WithContext(ctx).Create(&newUser).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create user"})
		return
	}

	// Reload with relations
	_ = database.DB.WithContext(ctx).Preload("RoleInfo.Permissions").First(&newUser, "id = ?", newUser.ID).Error
	LoadUserPermissions(ctx, &newUser)

	c.JSON(http.StatusCreated, newUser)
}

type UpdateUserRequest struct {
	FullName           *string `json:"full_name"`
	RoleID             *string `json:"role_id"`
	IsActive           *bool   `json:"is_active"`
	MustChangePassword *bool   `json:"must_change_password"`
}

// UpdateUserHandler updates user account details, assigned role, or status.
func UpdateUserHandler(c *gin.Context) {
	id := c.Param("id")
	ctx := c.Request.Context()

	var user models.User
	if err := database.DB.WithContext(ctx).First(&user, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	var req UpdateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload"})
		return
	}

	// Prevent self-lockout if current user is editing themselves
	currUserObj, _ := c.Get("user")
	if currUser, ok := currUserObj.(*models.User); ok && currUser.ID == user.ID {
		if req.IsActive != nil && !*req.IsActive {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot deactivate your own account"})
			return
		}
	}

	// Prevent deactivating default 'admin' account
	if user.Username == "admin" && req.IsActive != nil && !*req.IsActive {
		c.JSON(http.StatusForbidden, gin.H{"error": "Cannot deactivate default admin account"})
		return
	}

	isBlocking := req.IsActive != nil && !*req.IsActive

	updates := make(map[string]any)
	if req.FullName != nil {
		updates["full_name"] = strings.TrimSpace(*req.FullName)
	}
	if req.IsActive != nil {
		updates["is_active"] = *req.IsActive
	}
	if req.MustChangePassword != nil {
		updates["must_change_password"] = *req.MustChangePassword
	}
	if req.RoleID != nil {
		updates["role_id"] = *req.RoleID
		// Sync legacy role column
		var role models.Role
		if err := database.DB.WithContext(ctx).First(&role, "id = ?", *req.RoleID).Error; err == nil {
			if role.Code == "admin" {
				updates["role"] = models.RoleAdmin
			} else {
				updates["role"] = models.RoleViewer
			}
		}
	}

	if len(updates) > 0 {
		if err := database.DB.WithContext(ctx).Model(&user).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update user"})
			return
		}
	}

	// If user was blocked (deactivated), revoke all active sessions immediately and emit realtime kickout event
	if isBlocking {
		// 1. Soft-revoke all existing sessions in DB, blacklist in Redis, and emit realtime revocation
		_ = RevokeAllUserSessions(ctx, user.ID, "admin_revoke")

		// 2. Publish realtime event to RabbitMQ relay_queue so relay-service force-disconnects active sockets
		_ = mq.PublishEvent("user.blocked", map[string]any{
			"user_id":  user.ID,
			"username": user.Username,
			"reason":   "blocked_by_admin",
		})
	}

	_ = database.DB.WithContext(ctx).Preload("RoleInfo.Permissions").First(&user, "id = ?", id).Error
	LoadUserPermissions(ctx, &user)

	c.JSON(http.StatusOK, user)
}

type ResetPasswordRequest struct {
	NewPassword        string `json:"new_password" binding:"required"`
	MustChangePassword *bool  `json:"must_change_password"`
}

// ResetUserPasswordHandler allows administrators to reset a user's password.
func ResetUserPasswordHandler(c *gin.Context) {
	id := c.Param("id")
	var req ResetPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil || len(req.NewPassword) < 6 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "New password must be at least 6 characters"})
		return
	}

	ctx := c.Request.Context()
	var user models.User
	if err := database.DB.WithContext(ctx).First(&user, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	hash, err := hashPassword(req.NewPassword)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
		return
	}

	mustChange := true
	if req.MustChangePassword != nil {
		mustChange = *req.MustChangePassword
	}

	if err := database.DB.WithContext(ctx).Model(&user).Updates(map[string]any{
		"password_hash":        hash,
		"must_change_password": mustChange,
	}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to reset password"})
		return
	}

	// Invalidate user's existing sessions
	_ = RevokeAllUserSessions(ctx, user.ID, "admin_revoke")

	c.JSON(http.StatusOK, gin.H{"status": "ok", "message": "Password reset successfully"})
}

// DeleteUserHandler informs callers that user deletion has been permanently disabled.
func DeleteUserHandler(c *gin.Context) {
	c.JSON(http.StatusBadRequest, gin.H{
		"error": "Tính năng xóa người dùng đã bị vô hiệu hóa. Vui lòng sử dụng tính năng khóa tài khoản.",
	})
}
