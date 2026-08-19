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

	"cctv/ent"
	"cctv/ent/user"
	"cctv/ent/session"
	"cctv/internal/database"

	"github.com/google/uuid"
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

func Login(ctx context.Context, username, password string) (*ent.Session, string, error) {
	u, err := database.Client.User.Query().
		Where(user.Username(username)).
		Only(ctx)
	if err != nil {
		return nil, "", errors.New("invalid credentials")
	}
	
	if !u.IsActive {
		return nil, "", errors.New("user is inactive")
	}
	
	match, err := verifyPassword(password, u.PasswordHash)
	if err != nil || !match {
		return nil, "", errors.New("invalid credentials")
	}
	
	token := GenerateToken()
	expiresAt := time.Now().Add(24 * 7 * time.Hour) // 1 week
	
	sess, err := database.Client.Session.Create().
		SetID(uuid.New()).
		SetUser(u).
		SetTokenHash(hashToken(token)).
		SetExpiresAt(expiresAt).
		Save(ctx)
	if err != nil {
		return nil, "", err
	}
	
	database.Client.User.UpdateOne(u).
		SetLastLoginAt(time.Now()).
		Exec(ctx)
	
	return sess, token, nil
}

func GetUserBySession(ctx context.Context, token string) (*ent.User, error) {
	tokenHash := hashToken(token)
	sess, err := database.Client.Session.Query().
		Where(
			session.TokenHash(tokenHash),
			session.ExpiresAtGT(time.Now()),
		).
		WithUser().
		Only(ctx)
	if err != nil {
		return nil, errors.New("unauthorized")
	}
	
	u := sess.Edges.User
	if u == nil || !u.IsActive {
		return nil, errors.New("unauthorized")
	}
	
	// Update last_seen
	database.Client.Session.UpdateOne(sess).
		SetLastSeenAt(time.Now()).
		Exec(ctx)

	return u, nil
}

func Logout(ctx context.Context, token string) error {
	_, err := database.Client.Session.Delete().
		Where(session.TokenHash(hashToken(token))).
		Exec(ctx)
	return err
}

func CreateInitialUser(ctx context.Context, username, password string) error {
	exists, err := database.Client.User.Query().Where(user.Username(username)).Exist(ctx)
	if err != nil || exists {
		// Ensure initial user is admin
		if exists {
			_ = database.Client.User.Update().
				Where(user.Username(username)).
				SetRole(user.RoleAdmin).
				Exec(ctx)
		}
		return err
	}

	hash, err := hashPassword(password)
	if err != nil {
		return err
	}

	_, err = database.Client.User.Create().
		SetUsername(username).
		SetPasswordHash(hash).
		SetRole(user.RoleAdmin).
		Save(ctx)
	return err
}

func ChangePassword(ctx context.Context, u *ent.User, oldPassword, newPassword string) error {
	match, err := verifyPassword(oldPassword, u.PasswordHash)
	if err != nil || !match {
		return errors.New("incorrect old password")
	}

	hash, err := hashPassword(newPassword)
	if err != nil {
		return err
	}

	_, err = database.Client.User.UpdateOne(u).
		SetPasswordHash(hash).
		Save(ctx)
	return err
}
