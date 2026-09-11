package auth

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"cctv/shared/pkg/database"
	"cctv/shared/pkg/fingerprint"
	"cctv/shared/pkg/models"
	"cctv/shared/pkg/mq"
	"cctv/shared/pkg/nanoid"
	"cctv/shared/pkg/redis"

	"golang.org/x/crypto/argon2"
)

const (
	timeCost = 1
	memory   = 64 * 1024
	threads  = 4
	keyLen   = 32
	saltLen  = 16
)

// HashPassword hashes a plain-text password using Argon2id with cryptographically random salt.
func HashPassword(password string) (string, error) {
	return hashPassword(password)
}

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

func createSessionForUser(ctx context.Context, userID string, isPWA bool, devInfo *fingerprint.DeviceInfo, clientID ...string) (*models.Session, string, string, error) {
	if devInfo == nil {
		devInfo = &fingerprint.DeviceInfo{
			ClientType:  "web",
			DeviceLabel: "Trình duyệt Web",
			IPAddress:   "127.0.0.1",
			GeoCity:     "LAN",
			GeoCountry:  "Mạng nội bộ",
		}
	}

	// 1. Detect or register known device
	isNewDevice := false
	if devInfo.Fingerprint != "" {
		var count int64
		_ = database.DB.WithContext(ctx).Model(&models.KnownDevice{}).
			Where("user_id = ? AND device_fingerprint = ?", userID, devInfo.Fingerprint).
			Count(&count).Error
		if count == 0 {
			isNewDevice = true
			kd := models.KnownDevice{
				UserID:            userID,
				DeviceFingerprint: devInfo.Fingerprint,
				DeviceLabel:       devInfo.DeviceLabel,
				ClientType:        devInfo.ClientType,
				IsTrusted:         true,
			}
			_ = database.DB.WithContext(ctx).Create(&kd).Error
			// Security alert for new device login
			_ = mq.PublishEvent("notification.new", map[string]any{
				"id":         nanoid.New(),
				"title":      "Thiết bị đăng nhập mới",
				"message":    fmt.Sprintf("Phát hiện đăng nhập từ thiết bị mới: %s (%s, %s)", devInfo.DeviceLabel, devInfo.IPAddress, devInfo.GeoCity),
				"type":       "security",
				"user_id":    userID,
				"created_at": time.Now(),
			})
		} else {
			now := time.Now()
			_ = database.DB.WithContext(ctx).Model(&models.KnownDevice{}).
				Where("user_id = ? AND device_fingerprint = ?", userID, devInfo.Fingerprint).
				Updates(map[string]any{
					"last_seen_at": now,
					"device_label": devInfo.DeviceLabel,
				}).Error
		}
	}

	// 2. Concurrent Session Limits by role (Section 5.2)
	var u models.User
	if err := database.DB.WithContext(ctx).First(&u, "id = ?", userID).Error; err == nil {
		var maxConcurrent int
		switch u.Role {
		case models.RoleViewer:
			maxConcurrent = 3
		case models.RoleOperator:
			maxConcurrent = 5
		case models.RoleAdmin:
			maxConcurrent = 0 // unlimited
		default:
			maxConcurrent = 5
		}

		if maxConcurrent > 0 {
			var activeSessions []models.Session
			now := time.Now()
			if err := database.DB.WithContext(ctx).
				Where("user_id = ? AND revoked_at IS NULL AND expires_at > ?", userID, now).
				Order("created_at ASC").
				Find(&activeSessions).Error; err == nil {
				excess := len(activeSessions) - maxConcurrent + 1
				if excess > 0 && excess <= len(activeSessions) {
					for i := 0; i < excess; i++ {
						_ = RevokeSession(ctx, activeSessions[i].ID, "concurrent_limit")
					}
				}
			}
		}
	}

	// 3. Create active session
	token := GenerateToken()
	expiresAt := time.Now().Add(24 * 7 * time.Hour) // 1 week

	sess := models.Session{
		UserID:            userID,
		TokenHash:         hashToken(token),
		ExpiresAt:         expiresAt,
		IsPwa:             isPWA,
		IPAddress:         devInfo.IPAddress,
		UserAgent:         devInfo.UserAgent,
		DeviceFingerprint: devInfo.Fingerprint,
		DeviceLabel:       devInfo.DeviceLabel,
		ClientType:        devInfo.ClientType,
		GeoCity:           devInfo.GeoCity,
		GeoCountry:        devInfo.GeoCountry,
		IsNewDevice:       isNewDevice,
	}
	if len(clientID) > 0 && clientID[0] != "" {
		sess.ClientID = clientID[0]
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

	if err := database.DB.WithContext(ctx).Preload("RoleInfo.Permissions").First(&u, "id = ?", userID).Error; err == nil {
		LoadUserPermissions(ctx, &u)
		sess.User = &u
	}

	return &sess, token, refreshToken, nil
}

func Login(ctx context.Context, username, password string, isPWA bool, clientID ...string) (*models.Session, string, string, error) {
	return LoginWithDevice(ctx, username, password, isPWA, nil, clientID...)
}

func LoginWithDevice(ctx context.Context, username, password string, isPWA bool, devInfo *fingerprint.DeviceInfo, clientID ...string) (*models.Session, string, string, error) {
	if devInfo != nil && devInfo.IPAddress != "" {
		// Anti brute-force protection (max 5 consecutive failures)
		if redis.GetFailedLoginCount(ctx, devInfo.IPAddress) >= 5 {
			return nil, "", "", errors.New("Quá nhiều lần thử đăng nhập thất bại. Vui lòng thử lại sau 5 phút.")
		}
	}

	var u models.User
	if err := database.DB.WithContext(ctx).Where("username = ?", username).First(&u).Error; err != nil {
		if devInfo != nil && devInfo.IPAddress != "" {
			_, _ = redis.RecordFailedLogin(ctx, devInfo.IPAddress, 5*time.Minute)
			_, _ = redis.RecordFailedLogin(ctx, username, 5*time.Minute)
		}
		return nil, "", "", errors.New("invalid credentials")
	}

	if !u.IsActive {
		return nil, "", "", errors.New("user is inactive")
	}

	match, err := verifyPassword(password, u.PasswordHash)
	if err != nil || !match {
		if devInfo != nil && devInfo.IPAddress != "" {
			_, _ = redis.RecordFailedLogin(ctx, devInfo.IPAddress, 5*time.Minute)
			_, _ = redis.RecordFailedLogin(ctx, username, 5*time.Minute)
		}
		return nil, "", "", errors.New("invalid credentials")
	}

	// Login successful: reset failed attempt counter
	if devInfo != nil && devInfo.IPAddress != "" {
		_ = redis.ClearFailedLogin(ctx, devInfo.IPAddress)
		_ = redis.ClearFailedLogin(ctx, username)
	}

	// Impossible travel detection (Section 6)
	if devInfo != nil && devInfo.GeoCountry != "" && devInfo.GeoCountry != "LAN" {
		var lastSess models.Session
		if err := database.DB.WithContext(ctx).
			Where("user_id = ? AND geo_country != 'LAN' AND geo_country != ''", u.ID).
			Order("created_at DESC").
			First(&lastSess).Error; err == nil {
			if lastSess.GeoCountry != devInfo.GeoCountry && time.Since(lastSess.CreatedAt) < 2*time.Hour {
				_ = mq.PublishEvent("notification.new", map[string]any{
					"id":         nanoid.New(),
					"title":      "Cảnh báo bảo mật: Vị trí đăng nhập bất thường",
					"message":    fmt.Sprintf("Phát hiện đăng nhập tài khoản %s từ %s (%s) trong vòng 2 giờ so với lần đăng nhập trước từ %s", u.Username, devInfo.GeoCountry, devInfo.GeoCity, lastSess.GeoCountry),
					"type":       "security_alert",
					"user_id":    u.ID,
					"created_at": time.Now(),
				})
			}
		}
	}

	// If 2FA is enabled, issue a temporary pre-auth challenge token
	if u.TwoFactorEnabled {
		preAuthToken := GenerateToken()
		globalPreAuthStore.Save(preAuthToken, u.ID, isPWA, 5*time.Minute)
		return nil, preAuthToken, "", ErrTwoFactorRequired
	}

	return createSessionForUser(ctx, u.ID, isPWA, devInfo, clientID...)
}

func RefreshPWASession(ctx context.Context, refreshToken string) (*models.Session, string, string, error) {
	if refreshToken == "" {
		return nil, "", "", errors.New("invalid refresh token")
	}

	rHash := hashToken(refreshToken)
	var sess models.Session
	err := database.DB.WithContext(ctx).
		Preload("User").
		Where("is_pwa = ? AND refresh_token_hash = ? AND revoked_at IS NULL AND expires_at > ?", true, rHash, time.Now()).
		First(&sess).Error

	if err != nil {
		// Detect Reuse: check if this refresh_token_hash was ever used in a revoked/superseded session
		var revokedSess models.Session
		if rErr := database.DB.WithContext(ctx).Where("refresh_token_hash = ?", rHash).First(&revokedSess).Error; rErr == nil {
			// Token reuse detected! Revoke all sessions for this user immediately
			_ = RevokeAllUserSessions(ctx, revokedSess.UserID, "anomaly_detected")
			_ = mq.PublishEvent("notification.new", map[string]any{
				"id":         nanoid.New(),
				"title":      "Cảnh báo bảo mật: Phát hiện Token tái sử dụng",
				"message":    "Phát hiện Refresh Token cũ đã bị sử dụng lại (dấu hiệu lộ token). Toàn bộ các phiên đăng nhập đã bị thu hồi.",
				"type":       "security_breach",
				"user_id":    revokedSess.UserID,
				"created_at": time.Now(),
			})
			return nil, "", "", errors.New("refresh token reuse detected; all sessions revoked")
		}
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

// GetSessionAndUser retrieves an active session and user by token, validating against DB and Redis blacklist.
func GetSessionAndUser(ctx context.Context, token string) (*models.Session, *models.User, error) {
	if token == "" {
		return nil, nil, errors.New("missing token")
	}

	tokenHash := hashToken(token)
	tokenHashHex := hex.EncodeToString(tokenHash)

	// Fast Redis blacklist check: reject immediately without querying PostgreSQL
	if redis.IsTokenHashRevoked(ctx, tokenHashHex) {
		return nil, nil, errors.New("session revoked")
	}

	var sess models.Session
	if err := database.DB.WithContext(ctx).
		Preload("User").
		Where("token_hash = ? AND revoked_at IS NULL AND expires_at > ?", tokenHash, time.Now()).
		First(&sess).Error; err != nil {
		return nil, nil, errors.New("unauthorized")
	}

	// Fast Redis blacklist check by session ID
	if redis.IsSessionRevoked(ctx, sess.ID) {
		return nil, nil, errors.New("session revoked")
	}

	u := sess.User
	if u == nil || !u.IsActive {
		return nil, nil, errors.New("unauthorized")
	}

	// Update last_seen_at
	now := time.Now()
	_ = database.DB.WithContext(ctx).Model(&models.Session{ID: sess.ID}).Update("last_seen_at", &now).Error
	sess.LastSeenAt = &now

	LoadUserPermissions(ctx, u)
	return &sess, u, nil
}

func GetUserBySession(ctx context.Context, token string) (*models.User, error) {
	_, u, err := GetSessionAndUser(ctx, token)
	return u, err
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

// RevokeSession marks a session as revoked in DB, sets fast cache in Redis, and broadcasts real-time kickout event.
func RevokeSession(ctx context.Context, sessionID string, reason string) error {
	if sessionID == "" {
		return nil
	}
	if reason == "" {
		reason = "user_logout"
	}

	// Retrieve session metadata before revocation to blacklist token hash and determine TTL
	var sess models.Session
	_ = database.DB.WithContext(ctx).
		Select("id", "token_hash", "expires_at").
		Where("id = ?", sessionID).
		First(&sess).Error

	now := time.Now()
	if err := database.DB.WithContext(ctx).Model(&models.Session{}).
		Where("id = ? AND revoked_at IS NULL", sessionID).
		Updates(map[string]any{
			"revoked_at":    &now,
			"revoke_reason": reason,
		}).Error; err != nil {
		return err
	}

	ttl := 24 * time.Hour
	if !sess.ExpiresAt.IsZero() {
		rem := time.Until(sess.ExpiresAt)
		if rem > 0 && rem < 30*24*time.Hour {
			ttl = rem
		}
	}

	// 1. Blacklist in Redis (zero-latency check for both session ID and token hash)
	_ = redis.RevokeSession(ctx, sessionID, ttl)
	if len(sess.TokenHash) > 0 {
		_ = redis.RevokeTokenHash(ctx, hex.EncodeToString(sess.TokenHash), ttl)
	}

	// 2. Broadcast realtime event via RabbitMQ to relay-service
	_ = mq.PublishEvent("relay.emit", map[string]any{
		"room":  "session_" + sessionID,
		"event": "session:revoked",
		"data": map[string]any{
			"session_id": sessionID,
			"reason":     reason,
			"message":    "Phiên đăng nhập đã bị thu hồi.",
		},
	})

	return nil
}

// RevokeAllOtherSessions revokes all active sessions for a user except the specified currentSessionID.
func RevokeAllOtherSessions(ctx context.Context, userID string, currentSessionID string) error {
	var activeSessions []models.Session
	err := database.DB.WithContext(ctx).
		Where("user_id = ? AND id != ? AND revoked_at IS NULL AND expires_at > ?", userID, currentSessionID, time.Now()).
		Find(&activeSessions).Error
	if err != nil {
		return err
	}

	for _, s := range activeSessions {
		_ = RevokeSession(ctx, s.ID, "user_logout")
	}
	return nil
}

// RevokeAllUserSessions revokes every active session of a user (e.g. on account block, password reset, anomaly).
func RevokeAllUserSessions(ctx context.Context, userID string, reason string) error {
	var activeSessions []models.Session
	err := database.DB.WithContext(ctx).
		Where("user_id = ? AND revoked_at IS NULL AND expires_at > ?", userID, time.Now()).
		Find(&activeSessions).Error
	if err != nil {
		return err
	}

	for _, s := range activeSessions {
		_ = RevokeSession(ctx, s.ID, reason)
	}
	return nil
}

// ListSessions returns recent login sessions for a user (active and past history).
func ListSessions(ctx context.Context, userID string) ([]models.Session, error) {
	var sessions []models.Session
	err := database.DB.WithContext(ctx).
		Where("user_id = ?", userID).
		Order("created_at DESC").
		Limit(50).
		Find(&sessions).Error
	return sessions, err
}

func Logout(ctx context.Context, token string) error {
	if token == "" {
		return nil
	}
	tokenHash := hashToken(token)
	var sess models.Session
	if err := database.DB.WithContext(ctx).Where("token_hash = ? AND revoked_at IS NULL", tokenHash).First(&sess).Error; err != nil {
		return nil
	}
	return RevokeSession(ctx, sess.ID, "user_logout")
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
	// PasswordHash is stripped (json:"-") when user arrives from HTTP validate-token path.
	// Fetch it directly from DB when missing.
	if u.PasswordHash == "" {
		var dbUser models.User
		if err := database.DB.WithContext(ctx).
			Select("password_hash").
			Where("id = ?", u.ID).
			First(&dbUser).Error; err == nil {
			u.PasswordHash = dbUser.PasswordHash
		}
	}

	match, err := verifyPassword(oldPassword, u.PasswordHash)
	if err != nil || !match {
		return errors.New("incorrect old password")
	}

	hash, err := hashPassword(newPassword)
	if err != nil {
		return err
	}

	updates := map[string]any{
		"password_hash":        hash,
		"must_change_password": false,
	}
	if err := database.DB.WithContext(ctx).Model(&models.User{ID: u.ID}).Updates(updates).Error; err != nil {
		return err
	}
	u.PasswordHash = hash
	u.MustChangePassword = false
	return nil
}
