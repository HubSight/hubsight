package auth

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"time"

	"cctv/shared/pkg/database"
	"cctv/shared/pkg/models"

	"golang.org/x/crypto/argon2"
)

const (
	timeCost = 1
	memory   = 64 * 1024
	threads  = 4
	keyLen   = 32
	saltLen  = 16
)

func hashPassword(password string) (string, error) {
	salt := make([]byte, saltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}

	hash := argon2.IDKey([]byte(password), salt, timeCost, memory, threads, keyLen)
	b64Salt := base64.RawStdEncoding.EncodeToString(salt)
	b64Hash := base64.RawStdEncoding.EncodeToString(hash)

	encodedHash := fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version, memory, timeCost, threads, b64Salt, b64Hash)

	return encodedHash, nil
}

func verifyPassword(password, encodedHash string) (bool, error) {
	parts := strings.Split(encodedHash, "$")
	if len(parts) != 6 {
		return false, errors.New("invalid hash format")
	}

	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false, err
	}

	hash, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return false, err
	}

	compareHash := argon2.IDKey([]byte(password), salt, timeCost, memory, threads, uint32(len(hash)))
	return bytes.Equal(hash, compareHash), nil
}

func hashToken(token string) []byte {
	h := sha256.Sum256([]byte(token))
	return h[:]
}

func GenerateToken() string {
	b := make([]byte, 32)
	rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

func createSessionForUser(ctx context.Context, userID string, isPWA bool) (*models.Session, string, string, error) {
	token := GenerateToken()
	expiresAt := time.Now().Add(24 * 7 * time.Hour) // 1 week

	sess := models.Session{
		UserID:    userID,
		TokenHash: hashToken(token),
		ExpiresAt: expiresAt,
		IsPwa:     isPWA,
	}

	var refreshToken string
	if isPWA {
		refreshToken = GenerateToken()
		sess.RefreshTokenHash = hashToken(refreshToken)
	}

	if err := database.DB.WithContext(ctx).Create(&sess).Error; err != nil {
		return nil, "", "", err
	}

	now := time.Now()
	_ = database.DB.WithContext(ctx).Model(&models.User{ID: userID}).Update("last_login_at", &now).Error

	return &sess, token, refreshToken, nil
}

func Login(ctx context.Context, username, password string, isPWA bool) (*models.Session, string, string, error) {
	var u models.User
	if err := database.DB.WithContext(ctx).Where("username = ?", username).First(&u).Error; err != nil {
		return nil, "", "", errors.New("invalid credentials")
	}

	if !u.IsActive {
		return nil, "", "", errors.New("user is inactive")
	}

	match, err := verifyPassword(password, u.PasswordHash)
	if err != nil || !match {
		return nil, "", "", errors.New("invalid credentials")
	}

	// If 2FA is enabled, issue a temporary pre-auth challenge token
	if u.TwoFactorEnabled {
		preAuthToken := GenerateToken()
		globalPreAuthStore.Save(preAuthToken, u.ID, isPWA, 5*time.Minute)
		return nil, preAuthToken, "", ErrTwoFactorRequired
	}

	return createSessionForUser(ctx, u.ID, isPWA)
}

func RefreshPWASession(ctx context.Context, refreshToken string) (*models.Session, string, string, error) {
	if refreshToken == "" {
		return nil, "", "", errors.New("invalid refresh token")
	}

	rHash := hashToken(refreshToken)
	var sess models.Session
	if err := database.DB.WithContext(ctx).
		Preload("User").
		Where("is_pwa = ? AND refresh_token_hash = ?", true, rHash).
		First(&sess).Error; err != nil {
		return nil, "", "", errors.New("invalid refresh token")
	}

	u := sess.User
	if u == nil || !u.IsActive {
		return nil, "", "", errors.New("user inactive or not found")
	}

	// Generate new session token and rotated refresh token
	newToken := GenerateToken()
	newRefreshToken := GenerateToken()
	newExpiresAt := time.Now().Add(24 * 7 * time.Hour)
	now := time.Now()

	updates := map[string]any{
		"token_hash":         hashToken(newToken),
		"refresh_token_hash": hashToken(newRefreshToken),
		"expires_at":         newExpiresAt,
		"last_seen_at":       &now,
	}

	if err := database.DB.WithContext(ctx).Model(&models.Session{ID: sess.ID}).Updates(updates).Error; err != nil {
		return nil, "", "", err
	}

	sess.TokenHash = hashToken(newToken)
	sess.RefreshTokenHash = hashToken(newRefreshToken)
	sess.ExpiresAt = newExpiresAt
	sess.LastSeenAt = &now

	return &sess, newToken, newRefreshToken, nil
}

func GetUserBySession(ctx context.Context, token string) (*models.User, error) {
	tokenHash := hashToken(token)
	var sess models.Session
	if err := database.DB.WithContext(ctx).
		Preload("User").
		Where("token_hash = ? AND expires_at > ?", tokenHash, time.Now()).
		First(&sess).Error; err != nil {
		return nil, errors.New("unauthorized")
	}

	u := sess.User
	if u == nil || !u.IsActive {
		return nil, errors.New("unauthorized")
	}

	// Update last_seen_at inline with context (matches Ent behavior)
	now := time.Now()
	_ = database.DB.WithContext(ctx).Model(&models.Session{ID: sess.ID}).Update("last_seen_at", &now).Error

	LoadUserPermissions(ctx, u)
	return u, nil
}

// LoadUserPermissions resolves and caches a user's permissions and role info.
func LoadUserPermissions(ctx context.Context, u *models.User) {
	if u == nil {
		return
	}

	// Administrator role always has all permissions plus wildcard
	if u.Role == models.RoleAdmin {
		var allPerms []models.Permission
		_ = database.DB.WithContext(ctx).Find(&allPerms).Error
		u.Permissions = make([]string, 0, len(allPerms)+1)
		u.Permissions = append(u.Permissions, "*")
		for _, p := range allPerms {
			u.Permissions = append(u.Permissions, p.Code)
		}
		if u.RoleInfo == nil && u.RoleID != nil {
			var r models.Role
			if err := database.DB.WithContext(ctx).Preload("Permissions").First(&r, "id = ?", *u.RoleID).Error; err == nil {
				u.RoleInfo = &r
			}
		}
		return
	}

	// For assigned custom or system roles
	if u.RoleID != nil && *u.RoleID != "" {
		var r models.Role
		if err := database.DB.WithContext(ctx).Preload("Permissions").First(&r, "id = ?", *u.RoleID).Error; err == nil {
			u.RoleInfo = &r
			u.Permissions = make([]string, 0, len(r.Permissions))
			for _, p := range r.Permissions {
				u.Permissions = append(u.Permissions, p.Code)
			}
			return
		}
	}

	// Fallback to viewer role permissions
	u.Permissions = []string{"cameras:view", "recordings:view"}
}

func Logout(ctx context.Context, token string) error {
	return database.DB.WithContext(ctx).
		Where("token_hash = ?", hashToken(token)).
		Delete(&models.Session{}).Error
}

func CreateInitialUser(ctx context.Context, username, password string) error {
	var count int64
	if err := database.DB.WithContext(ctx).Model(&models.User{}).Where("username = ?", username).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		// Ensure initial user is admin
		_ = database.DB.WithContext(ctx).Model(&models.User{}).
			Where("username = ?", username).
			Update("role", models.RoleAdmin).Error
		return nil
	}

	hash, err := hashPassword(password)
	if err != nil {
		return err
	}

	newUser := models.User{
		Username:     username,
		PasswordHash: hash,
		Role:         models.RoleAdmin,
		IsActive:     true,
	}
	return database.DB.WithContext(ctx).Create(&newUser).Error
}

func ChangePassword(ctx context.Context, u *models.User, oldPassword, newPassword string) error {
	match, err := verifyPassword(oldPassword, u.PasswordHash)
	if err != nil || !match {
		return errors.New("incorrect old password")
	}

	hash, err := hashPassword(newPassword)
	if err != nil {
		return err
	}

	if err := database.DB.WithContext(ctx).Model(&models.User{ID: u.ID}).Update("password_hash", hash).Error; err != nil {
		return err
	}
	u.PasswordHash = hash
	return nil
}
