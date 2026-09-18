package auth

import (
	"testing"
	"time"

	"cctv/shared/pkg/models"
)

func TestJWTGenerationAndValidation(t *testing.T) {
	user := &models.User{
		ID:       "usr_test_1234567890",
		Username: "testadmin",
		Role:     models.RoleAdmin,
	}

	sessionID := "sess_test_123456789"
	ttl := 15 * time.Minute

	token, err := GenerateJWT(user, sessionID, ttl)
	if err != nil {
		t.Fatalf("GenerateJWT failed: %v", err)
	}
	if token == "" {
		t.Fatalf("expected non-empty token")
	}

	claims, err := ParseAndValidateJWT(token)
	if err != nil {
		t.Fatalf("ParseAndValidateJWT failed: %v", err)
	}

	if claims.UserID != user.ID {
		t.Errorf("expected UserID %s, got %s", user.ID, claims.UserID)
	}
	if claims.Username != user.Username {
		t.Errorf("expected Username %s, got %s", user.Username, claims.Username)
	}
	if claims.Role != string(user.Role) {
		t.Errorf("expected Role %s, got %s", user.Role, claims.Role)
	}
	if claims.SessionID != sessionID {
		t.Errorf("expected SessionID %s, got %s", sessionID, claims.SessionID)
	}
}

func TestJWTExpiredOrInvalid(t *testing.T) {
	user := &models.User{
		ID:       "usr_test_expired",
		Username: "expireduser",
		Role:     models.RoleViewer,
	}

	// Expired token (-1 minute)
	token, err := GenerateJWT(user, "sess_expired", -1*time.Minute)
	if err != nil {
		t.Fatalf("GenerateJWT failed: %v", err)
	}

	_, err = ParseAndValidateJWT(token)
	if err == nil {
		t.Fatalf("expected error for expired JWT token")
	}

	// Corrupted token
	_, err = ParseAndValidateJWT("invalid.jwt.token")
	if err == nil {
		t.Fatalf("expected error for corrupted JWT token")
	}
}

func TestAdminJWTUsesDedicatedAudienceAndClientBinding(t *testing.T) {
	user := &models.User{
		ID:       "usr_admin_test_123456",
		Username: "admin",
		Role:     models.RoleAdmin,
	}

	token, err := GenerateAdminJWT(user, "sess_admin_test", 15*time.Minute, "admin-client")
	if err != nil {
		t.Fatalf("GenerateAdminJWT failed: %v", err)
	}
	claims, err := ParseAndValidateJWT(token)
	if err != nil {
		t.Fatalf("ParseAndValidateJWT failed: %v", err)
	}
	if claims.ClientID != "admin-client" {
		t.Fatalf("expected admin client binding, got %q", claims.ClientID)
	}
	if len(claims.Audience) != 1 || claims.Audience[0] != models.AudienceAdminAPI {
		t.Fatalf("expected audience %q, got %v", models.AudienceAdminAPI, claims.Audience)
	}
}
