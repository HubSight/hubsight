package redis

import (
	"context"
	"fmt"
	"log"
	"os"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

var (
	rdb   *redis.Client
	mutex sync.RWMutex
)

// Init connects to the Valkey / Redis server.
func Init(redisURL string) error {
	mutex.Lock()
	defer mutex.Unlock()

	if redisURL == "" {
		redisURL = os.Getenv("REDIS_URL")
	}
	if redisURL == "" {
		redisURL = "redis://localhost:6379"
	}

	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		return fmt.Errorf("invalid redis url %s: %w", redisURL, err)
	}

	// Sane defaults
	opt.PoolSize = 20
	opt.MinIdleConns = 5
	opt.DialTimeout = 3 * time.Second
	opt.ReadTimeout = 2 * time.Second
	opt.WriteTimeout = 2 * time.Second

	client := redis.NewClient(opt)

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		log.Printf("Warning: Valkey/Redis ping failed (%s): %v", redisURL, err)
		// We still keep client instance so reconnections can succeed if Redis starts later
	} else {
		log.Printf("Connected to Valkey/Redis at %s", redisURL)
	}

	rdb = client
	return nil
}

// Client returns the active Redis client handle.
func Client() *redis.Client {
	mutex.RLock()
	defer mutex.RUnlock()
	return rdb
}

// RevokeSession blacklists a session ID in Redis for fast (<0.5ms) zero-latency checking.
func RevokeSession(ctx context.Context, sessionID string, ttl time.Duration) error {
	if sessionID == "" {
		return nil
	}
	client := Client()
	if client == nil {
		return nil
	}
	if ttl <= 0 {
		ttl = 24 * time.Hour
	}
	key := fmt.Sprintf("session_revoked:%s", sessionID)
	return client.Set(ctx, key, "1", ttl).Err()
}

// IsSessionRevoked checks if a session ID is marked as revoked in Redis.
func IsSessionRevoked(ctx context.Context, sessionID string) bool {
	if sessionID == "" {
		return false
	}
	client := Client()
	if client == nil {
		return false
	}
	key := fmt.Sprintf("session_revoked:%s", sessionID)
	exists, err := client.Exists(ctx, key).Result()
	if err != nil {
		return false
	}
	return exists > 0
}

// RevokeTokenHash blacklists a SHA-256 token hash in Redis for fast pre-DB rejection.
func RevokeTokenHash(ctx context.Context, tokenHashHex string, ttl time.Duration) error {
	if tokenHashHex == "" {
		return nil
	}
	client := Client()
	if client == nil {
		return nil
	}
	if ttl <= 0 {
		ttl = 24 * time.Hour
	}
	key := fmt.Sprintf("token_revoked:%s", tokenHashHex)
	return client.Set(ctx, key, "1", ttl).Err()
}

// IsTokenHashRevoked checks if a token hash is blacklisted in Redis.
func IsTokenHashRevoked(ctx context.Context, tokenHashHex string) bool {
	if tokenHashHex == "" {
		return false
	}
	client := Client()
	if client == nil {
		return false
	}
	key := fmt.Sprintf("token_revoked:%s", tokenHashHex)
	exists, err := client.Exists(ctx, key).Result()
	if err != nil {
		return false
	}
	return exists > 0
}

// RecordFailedLogin increments the failed login counter for an IP or username key.
func RecordFailedLogin(ctx context.Context, key string, window time.Duration) (int64, error) {
	client := Client()
	if client == nil {
		return 0, nil
	}
	redisKey := fmt.Sprintf("failed_login:%s", key)
	pipe := client.Pipeline()
	incr := pipe.Incr(ctx, redisKey)
	pipe.Expire(ctx, redisKey, window)
	_, err := pipe.Exec(ctx)
	if err != nil {
		return 0, err
	}
	return incr.Val(), nil
}

// ClearFailedLogin resets the failed login counter upon successful authentication.
func ClearFailedLogin(ctx context.Context, key string) error {
	client := Client()
	if client == nil {
		return nil
	}
	redisKey := fmt.Sprintf("failed_login:%s", key)
	return client.Del(ctx, redisKey).Err()
}

// GetFailedLoginCount returns the current number of failed login attempts for a key.
func GetFailedLoginCount(ctx context.Context, key string) int64 {
	client := Client()
	if client == nil {
		return 0
	}
	redisKey := fmt.Sprintf("failed_login:%s", key)
	val, err := client.Get(ctx, redisKey).Int64()
	if err != nil {
		return 0
	}
	return val
}
