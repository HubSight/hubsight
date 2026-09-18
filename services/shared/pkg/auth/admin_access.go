package auth

import (
	"context"
	"errors"

	"cctv/shared/pkg/database"
	"cctv/shared/pkg/models"
)

const AdminAPIAccessPermission = "admin_api:access"

var ErrAdminAccess = errors.New("admin API access is not granted")

// HasAdminAPIAccess is the single authorization predicate used by Admin API
// login, token validation, and permission middleware. Role admin always has
// access; other roles need an explicit dedicated permission or wildcard.
func HasAdminAPIAccess(user *models.User) bool {
	if user == nil || !user.IsActive {
		return false
	}
	if user.Role == models.RoleAdmin {
		return true
	}
	for _, permission := range user.Permissions {
		if permission == "*" || permission == AdminAPIAccessPermission {
			return true
		}
	}
	return false
}

// UserCanAccessAdminAPI checks the account's current RBAC assignment before
// the Admin login flow creates a session or a 2FA pre-auth challenge.
func UserCanAccessAdminAPI(ctx context.Context, username string) (bool, error) {
	var user models.User
	if err := database.DB.WithContext(ctx).Preload("RoleInfo.Permissions").
		Where("username = ?", username).First(&user).Error; err != nil {
		return false, err
	}
	LoadUserPermissions(ctx, &user)
	return HasAdminAPIAccess(&user), nil
}
