package auth

import (
	"errors"
	"os"
	"time"

	"cctv/shared/pkg/models"

	"github.com/golang-jwt/jwt/v5"
)

var (
	ErrInvalidJWT = errors.New("invalid or expired JWT token")
)

// JWTClaims represents standard and custom claims embedded into HubSight access tokens.
type JWTClaims struct {
	UserID    string `json:"sub"`
	Username  string `json:"username"`
	Role      string `json:"role"`
	SessionID string `json:"session_id"`
	jwt.RegisteredClaims
}

func getJWTSecret() []byte {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		secret = "hubsight_jwt_secret_key_default_development_change_in_prod"
	}
	return []byte(secret)
}

// GenerateJWT creates a signed HMAC-SHA256 JWT access token.
func GenerateJWT(u *models.User, sessionID string, ttl time.Duration) (string, error) {
	if u == nil {
		return "", errors.New("cannot generate JWT for nil user")
	}

	now := time.Now()
	expiresAt := now.Add(ttl)

	claims := JWTClaims{
		UserID:    u.ID,
		Username:  u.Username,
		Role:      string(u.Role),
		SessionID: sessionID,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    "hubsight-auth-service",
			Subject:   u.ID,
			Audience:  jwt.ClaimStrings{"hubsight-client", "hubsight-app"},
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(expiresAt),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(getJWTSecret())
}

// ParseAndValidateJWT verifies the JWT signature and extracts claims.
func ParseAndValidateJWT(tokenStr string) (*JWTClaims, error) {
	if tokenStr == "" {
		return nil, ErrInvalidJWT
	}

	token, err := jwt.ParseWithClaims(tokenStr, &JWTClaims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, ErrInvalidJWT
		}
		return getJWTSecret(), nil
	})

	if err != nil || !token.Valid {
		return nil, ErrInvalidJWT
	}

	claims, ok := token.Claims.(*JWTClaims)
	if !ok {
		return nil, ErrInvalidJWT
	}

	return claims, nil
}
