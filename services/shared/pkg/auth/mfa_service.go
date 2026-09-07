package auth

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"cctv/shared/pkg/database"
	"cctv/shared/pkg/models"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
)

var (
	ErrTwoFactorRequired = errors.New("two_factor_required")
	ErrInvalidPreAuth    = errors.New("invalid or expired two-factor challenge")
	ErrInvalidCode       = errors.New("invalid authentication code")
	ErrInvalidPassword   = errors.New("incorrect password")
	ErrPasskeyNotFound   = errors.New("passkey credential not found")
)

// ── In-Memory Pre-Auth Challenge Store for 2FA ───────────────────────────────

type preAuthEntry struct {
	UserID    string
	IsPWA     bool
	ExpiresAt time.Time
}

type preAuthStore struct {
	mu    sync.RWMutex
	items map[string]preAuthEntry
}

var globalPreAuthStore = &preAuthStore{
	items: make(map[string]preAuthEntry),
}

func (s *preAuthStore) Save(token, userID string, isPWA bool, ttl time.Duration) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.items[token] = preAuthEntry{
		UserID:    userID,
		IsPWA:     isPWA,
		ExpiresAt: time.Now().Add(ttl),
	}
}

func (s *preAuthStore) Pop(token string) (string, bool, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	entry, exists := s.items[token]
	if !exists {
		return "", false, false
	}
	delete(s.items, token)
	if time.Now().After(entry.ExpiresAt) {
		return "", false, false
	}
	return entry.UserID, entry.IsPWA, true
}

// ── In-Memory Pending 2FA Setup Store ────────────────────────────────────────

type pending2FASetup struct {
	Secret        string
	RecoveryCodes []string // hashed
	ExpiresAt     time.Time
}

type pending2FAStore struct {
	mu    sync.RWMutex
	items map[string]pending2FASetup
}

var globalPending2FAStore = &pending2FAStore{
	items: make(map[string]pending2FASetup),
}

func (s *pending2FAStore) Save(userID, secret string, hashedCodes []string, ttl time.Duration) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.items[userID] = pending2FASetup{
		Secret:        secret,
		RecoveryCodes: hashedCodes,
		ExpiresAt:     time.Now().Add(ttl),
	}
}

func (s *pending2FAStore) Get(userID string) (pending2FASetup, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	entry, exists := s.items[userID]
	if !exists || time.Now().After(entry.ExpiresAt) {
		return pending2FASetup{}, false
	}
	return entry, true
}

func (s *pending2FAStore) Delete(userID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.items, userID)
}

// ── 2FA Business Logic ───────────────────────────────────────────────────────

// Setup2FA initiates the 2FA enrollment ceremony.
func Setup2FA(ctx context.Context, u *models.User) (*TOTPSetupResult, error) {
	res, hashedCodes, err := GenerateTOTP(u.Username)
	if err != nil {
		return nil, err
	}

	// Cache pending secret for 15 minutes awaiting user confirmation
	globalPending2FAStore.Save(u.ID, res.Secret, hashedCodes, 15*time.Minute)

	return res, nil
}

// Enable2FA confirms the pending 2FA secret with a user-supplied 6-digit TOTP code.
func Enable2FA(ctx context.Context, u *models.User, code string) error {
	pending, exists := globalPending2FAStore.Get(u.ID)
	if !exists {
		return errors.New("2FA setup expired or not initiated. Please start over.")
	}

	if !ValidateTOTP(pending.Secret, code) {
		return ErrInvalidCode
	}

	// Persist 2FA activation to PostgreSQL
	updates := map[string]any{
		"two_factor_enabled":        true,
		"two_factor_secret":         pending.Secret,
		"two_factor_recovery_codes": pending.RecoveryCodes,
	}

	if err := database.DB.WithContext(ctx).Model(&models.User{ID: u.ID}).Updates(updates).Error; err != nil {
		return fmt.Errorf("failed saving 2FA configuration: %w", err)
	}

	u.TwoFactorEnabled = true
	u.TwoFactorSecret = pending.Secret
	u.TwoFactorRecoveryCodes = pending.RecoveryCodes

	globalPending2FAStore.Delete(u.ID)
	return nil
}

// Disable2FA deactivates 2FA after checking the user's password or active 2FA code.
func Disable2FA(ctx context.Context, u *models.User, password, code string) error {
	var verified bool
	if password != "" {
		match, err := verifyPassword(password, u.PasswordHash)
		if err == nil && match {
			verified = true
		}
	}
	if !verified && code != "" && u.TwoFactorSecret != "" {
		if ValidateTOTP(u.TwoFactorSecret, code) {
			verified = true
		}
	}

	if !verified {
		return errors.New("re-authentication failed. Please provide your current password or 2FA code.")
	}

	updates := map[string]any{
		"two_factor_enabled":        false,
		"two_factor_secret":         "",
		"two_factor_recovery_codes": []string{},
	}

	if err := database.DB.WithContext(ctx).Model(&models.User{ID: u.ID}).Updates(updates).Error; err != nil {
		return fmt.Errorf("failed disabling 2FA: %w", err)
	}

	u.TwoFactorEnabled = false
	u.TwoFactorSecret = ""
	u.TwoFactorRecoveryCodes = nil
	return nil
}

// RegenerateRecoveryCodes creates a fresh batch of recovery codes after verifying password.
func RegenerateRecoveryCodes(ctx context.Context, u *models.User, password string) ([]string, error) {
	if !u.TwoFactorEnabled {
		return nil, errors.New("2FA is not enabled on this account")
	}

	match, err := verifyPassword(password, u.PasswordHash)
	if err != nil || !match {
		return nil, ErrInvalidPassword
	}

	plain, hashed, err := GenerateRecoveryCodes(8)
	if err != nil {
		return nil, err
	}

	if err := database.DB.WithContext(ctx).Model(&models.User{ID: u.ID}).
		Update("two_factor_recovery_codes", hashed).Error; err != nil {
		return nil, fmt.Errorf("failed saving recovery codes: %w", err)
	}

	u.TwoFactorRecoveryCodes = hashed
	return plain, nil
}

// Verify2FALogin completes step 2 of login with either TOTP code or a one-time recovery code.
func Verify2FALogin(ctx context.Context, preAuthToken, code, recoveryCode string, isPWA bool) (*models.Session, string, string, error) {
	userID, pwaFlag, ok := globalPreAuthStore.Pop(preAuthToken)
	if !ok {
		return nil, "", "", ErrInvalidPreAuth
	}

	var u models.User
	if err := database.DB.WithContext(ctx).Where("id = ?", userID).First(&u).Error; err != nil {
		return nil, "", "", errors.New("user not found")
	}
	if !u.IsActive {
		return nil, "", "", errors.New("user is inactive")
	}

	var authenticated bool

	// 1. Try recovery code
	if recoveryCode != "" {
		valid, remaining := VerifyAndConsumeRecoveryCode(u.TwoFactorRecoveryCodes, recoveryCode)
		if valid {
			authenticated = true
			_ = database.DB.WithContext(ctx).Model(&models.User{ID: u.ID}).
				Update("two_factor_recovery_codes", remaining).Error
			u.TwoFactorRecoveryCodes = remaining
		}
	}

	// 2. Try TOTP code
	if !authenticated && code != "" && u.TwoFactorSecret != "" {
		if ValidateTOTP(u.TwoFactorSecret, code) {
			authenticated = true
		}
	}

	if !authenticated {
		// Re-save pre-auth token so user can retry without re-typing password
		globalPreAuthStore.Save(preAuthToken, userID, isPWA, 3*time.Minute)
		return nil, "", "", ErrInvalidCode
	}

	// Create authenticated session
	usePWA := isPWA || pwaFlag
	return createSessionForUser(ctx, u.ID, usePWA)
}

// ── Passkey / WebAuthn Business Logic ─────────────────────────────────────────

// BeginPasskeyRegistration generates WebAuthn creation options for the client.
func BeginPasskeyRegistration(ctx context.Context, u *models.User, origin string) (any, string, error) {
	_ = EnsureDynamicOrigin(origin)
	w, err := GetWebAuthn()
	if err != nil {
		return nil, "", err
	}

	var existingCreds []models.PasskeyCredential
	_ = database.DB.WithContext(ctx).Where("user_id = ?", u.ID).Find(&existingCreds).Error

	adapter := &WebAuthnUserAdapter{
		User:        u,
		Credentials: existingCreds,
	}

	options, sessionData, err := w.BeginRegistration(adapter)
	if err != nil {
		return nil, "", fmt.Errorf("failed beginning passkey registration: %w", err)
	}

	challengeID := challengeStore.Save(sessionData, u.ID, 5*time.Minute)
	return options, challengeID, nil
}

// FinishPasskeyRegistration verifies client attestation and persists the new Passkey.
func FinishPasskeyRegistration(ctx context.Context, u *models.User, challengeID, name, credentialJSON, origin string) (*models.PasskeyCredential, error) {
	_ = EnsureDynamicOrigin(origin)
	w, err := GetWebAuthn()
	if err != nil {
		return nil, err
	}

	sessionData, storedUserID, ok := challengeStore.Pop(challengeID)
	if !ok || storedUserID != u.ID {
		return nil, errors.New("passkey registration challenge expired or invalid")
	}

	parsedResponse, err := protocol.ParseCredentialCreationResponseBody(strings.NewReader(credentialJSON))
	if err != nil {
		return nil, fmt.Errorf("failed parsing credential creation response: %w", err)
	}

	var existingCreds []models.PasskeyCredential
	_ = database.DB.WithContext(ctx).Where("user_id = ?", u.ID).Find(&existingCreds).Error

	adapter := &WebAuthnUserAdapter{
		User:        u,
		Credentials: existingCreds,
	}

	cred, err := w.CreateCredential(adapter, *sessionData, parsedResponse)
	if err != nil {
		return nil, fmt.Errorf("failed verifying passkey credential: %w", err)
	}

	if strings.TrimSpace(name) == "" {
		name = "Passkey " + time.Now().Format("02/01/2006")
	}

	passkey := models.PasskeyCredential{
		UserID:          u.ID,
		Name:            strings.TrimSpace(name),
		CredentialID:    cred.ID,
		PublicKey:       cred.PublicKey,
		AttestationType: cred.AttestationType,
		AAGUID:          cred.Authenticator.AAGUID,
		SignCount:       cred.Authenticator.SignCount,
		Transports:      formatTransports(cred.Transport),
		BackupEligible:  cred.Flags.BackupEligible,
		BackupState:     cred.Flags.BackupState,
		CreatedAt:       time.Now(),
		UpdatedAt:       time.Now(),
	}

	if err := database.DB.WithContext(ctx).Create(&passkey).Error; err != nil {
		return nil, fmt.Errorf("failed storing passkey: %w", err)
	}

	return &passkey, nil
}

// BeginPasskeyLogin initiates authentication ceremony (supports both username & discoverable).
func BeginPasskeyLogin(ctx context.Context, username, origin string) (any, string, error) {
	_ = EnsureDynamicOrigin(origin)
	w, err := GetWebAuthn()
	if err != nil {
		return nil, "", err
	}

	if username != "" {
		var u models.User
		if err := database.DB.WithContext(ctx).Where("username = ?", username).First(&u).Error; err != nil {
			return nil, "", errors.New("user not found")
		}

		var creds []models.PasskeyCredential
		if err := database.DB.WithContext(ctx).Where("user_id = ?", u.ID).Find(&creds).Error; err != nil || len(creds) == 0 {
			return nil, "", errors.New("no passkey registered for this account")
		}

		adapter := &WebAuthnUserAdapter{
			User:        &u,
			Credentials: creds,
		}

		options, sessionData, err := w.BeginLogin(adapter)
		if err != nil {
			return nil, "", fmt.Errorf("failed creating login options: %w", err)
		}

		challengeID := challengeStore.Save(sessionData, u.ID, 5*time.Minute)
		return options, challengeID, nil
	}

	// Discoverable login (Passwordless / Resident Key)
	options, sessionData, err := w.BeginDiscoverableLogin()
	if err != nil {
		return nil, "", fmt.Errorf("failed creating discoverable login options: %w", err)
	}

	challengeID := challengeStore.Save(sessionData, "", 5*time.Minute)
	return options, challengeID, nil
}

// FinishPasskeyLogin verifies assertion signature and creates an authenticated session.
func FinishPasskeyLogin(ctx context.Context, challengeID, credentialJSON string, isPWA bool, origin string) (*models.Session, string, string, error) {
	_ = EnsureDynamicOrigin(origin)
	w, err := GetWebAuthn()
	if err != nil {
		return nil, "", "", err
	}

	sessionData, _, ok := challengeStore.Pop(challengeID)
	if !ok {
		return nil, "", "", errors.New("passkey login challenge expired or invalid")
	}

	parsedResponse, err := protocol.ParseCredentialRequestResponseBody(strings.NewReader(credentialJSON))
	if err != nil {
		return nil, "", "", fmt.Errorf("failed parsing credential assertion: %w", err)
	}

	// Locate PasskeyCredential by raw Credential ID
	var passkey models.PasskeyCredential
	if err := database.DB.WithContext(ctx).Where("credential_id = ?", parsedResponse.RawID).First(&passkey).Error; err != nil {
		return nil, "", "", ErrPasskeyNotFound
	}

	var u models.User
	if err := database.DB.WithContext(ctx).Where("id = ?", passkey.UserID).First(&u).Error; err != nil {
		return nil, "", "", errors.New("user not found")
	}
	if !u.IsActive {
		return nil, "", "", errors.New("user is inactive")
	}

	var allCreds []models.PasskeyCredential
	_ = database.DB.WithContext(ctx).Where("user_id = ?", u.ID).Find(&allCreds).Error

	adapter := &WebAuthnUserAdapter{
		User:        &u,
		Credentials: allCreds,
	}

	var cred *webauthn.Credential
	if sessionData.UserVerification != "" && len(sessionData.AllowedCredentialIDs) == 0 {
		cred, err = w.ValidateDiscoverableLogin(func(rawID, userHandle []byte) (webauthn.User, error) {
			return adapter, nil
		}, *sessionData, parsedResponse)
	} else {
		cred, err = w.ValidateLogin(adapter, *sessionData, parsedResponse)
	}

	if err != nil {
		return nil, "", "", fmt.Errorf("passkey verification failed: %w", err)
	}

	// Update passkey sign count and last used timestamp
	now := time.Now()
	_ = database.DB.WithContext(ctx).Model(&models.PasskeyCredential{ID: passkey.ID}).Updates(map[string]any{
		"sign_count":   cred.Authenticator.SignCount,
		"last_used_at": &now,
	}).Error

	// Generate authenticated session (Passkeys satisfy MFA requirement)
	return createSessionForUser(ctx, u.ID, isPWA)
}

// ListPasskeys retrieves all registered passkeys for a user.
func ListPasskeys(ctx context.Context, userID string) ([]models.PasskeyCredential, error) {
	var passkeys []models.PasskeyCredential
	err := database.DB.WithContext(ctx).
		Where("user_id = ?", userID).
		Order("created_at desc").
		Find(&passkeys).Error
	return passkeys, err
}

// RenamePasskey renames a user's passkey.
func RenamePasskey(ctx context.Context, userID, passkeyID, name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return errors.New("passkey name cannot be empty")
	}
	res := database.DB.WithContext(ctx).
		Model(&models.PasskeyCredential{}).
		Where("id = ? AND user_id = ?", passkeyID, userID).
		Update("name", name)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrPasskeyNotFound
	}
	return nil
}

// DeletePasskey removes a user's passkey.
func DeletePasskey(ctx context.Context, userID, passkeyID string) error {
	res := database.DB.WithContext(ctx).
		Where("id = ? AND user_id = ?", passkeyID, userID).
		Delete(&models.PasskeyCredential{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrPasskeyNotFound
	}
	return nil
}
