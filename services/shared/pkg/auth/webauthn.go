package auth

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"cctv/shared/pkg/models"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
)

var (
	webAuthnInstance *webauthn.WebAuthn
	webAuthnOnce     sync.Once
	challengeStore   = newWebAuthnChallengeStore()
)

// GetWebAuthn returns or initializes the singleton WebAuthn instance.
func GetWebAuthn() (*webauthn.WebAuthn, error) {
	var initErr error
	webAuthnOnce.Do(func() {
		rpID := os.Getenv("WEBAUTHN_RP_ID")
		if rpID == "" {
			rpID = "localhost"
		}

		rpOrigins := []string{}
		originsEnv := os.Getenv("WEBAUTHN_ORIGINS")
		if originsEnv != "" {
			for _, o := range strings.Split(originsEnv, ",") {
				if trimmed := strings.TrimSpace(o); trimmed != "" {
					rpOrigins = append(rpOrigins, trimmed)
				}
			}
		}

		if len(rpOrigins) == 0 {
			rpOrigins = []string{
				"http://localhost:8088",
				"http://localhost:3000",
				"http://localhost:5173",
				"http://127.0.0.1:8088",
			}
		}

		w, err := webauthn.New(&webauthn.Config{
			RPDisplayName: "HubSight CCTV",
			RPID:          rpID,
			RPOrigins:     rpOrigins,
		})
		if err != nil {
			initErr = fmt.Errorf("failed initializing WebAuthn: %w", err)
			return
		}
		webAuthnInstance = w
	})

	return webAuthnInstance, initErr
}

// EnsureDynamicOrigin allows incoming client origin to be dynamically validated against RPID.
func EnsureDynamicOrigin(origin string) error {
	w, err := GetWebAuthn()
	if err != nil {
		return err
	}

	if origin == "" {
		return nil
	}

	u, err := url.Parse(origin)
	if err != nil {
		return nil
	}

	// Check if already registered
	for _, o := range w.Config.RPOrigins {
		if o == origin {
			return nil
		}
	}

	// If the origin host or domain matches RPID, allow dynamically
	if u.Hostname() == w.Config.RPID || strings.HasSuffix(u.Hostname(), "."+w.Config.RPID) || w.Config.RPID == "localhost" {
		w.Config.RPOrigins = append(w.Config.RPOrigins, origin)
	}

	return nil
}

// WebAuthnUserAdapter wraps models.User to satisfy the webauthn.User interface.
type WebAuthnUserAdapter struct {
	User        *models.User
	Credentials []models.PasskeyCredential
}

func (w *WebAuthnUserAdapter) WebAuthnID() []byte {
	return []byte(w.User.ID)
}

func (w *WebAuthnUserAdapter) WebAuthnName() string {
	return w.User.Username
}

func (w *WebAuthnUserAdapter) WebAuthnDisplayName() string {
	if w.User.FullName != "" {
		return w.User.FullName
	}
	return w.User.Username
}

func (w *WebAuthnUserAdapter) WebAuthnIcon() string {
	return ""
}

func (w *WebAuthnUserAdapter) WebAuthnCredentials() []webauthn.Credential {
	creds := make([]webauthn.Credential, len(w.Credentials))
	for i, c := range w.Credentials {
		creds[i] = webauthn.Credential{
			ID:              c.CredentialID,
			PublicKey:       c.PublicKey,
			AttestationType: c.AttestationType,
			Transport:       parseTransports(c.Transports),
			Flags: webauthn.CredentialFlags{
				UserPresent:    true,
				UserVerified:   true,
				BackupEligible: c.BackupEligible,
				BackupState:    c.BackupState,
			},
			Authenticator: webauthn.Authenticator{
				AAGUID:    c.AAGUID,
				SignCount: c.SignCount,
			},
		}
	}
	return creds
}

func parseTransports(raw []string) []protocol.AuthenticatorTransport {
	var out []protocol.AuthenticatorTransport
	for _, t := range raw {
		out = append(out, protocol.AuthenticatorTransport(t))
	}
	return out
}

func formatTransports(in []protocol.AuthenticatorTransport) []string {
	var out []string
	for _, t := range in {
		out = append(out, string(t))
	}
	return out
}

// ── Thread-Safe WebAuthn Challenge Store with TTL ─────────────────────────────

type challengeItem struct {
	sessionData *webauthn.SessionData
	userID      string
	expiresAt   time.Time
}

type webAuthnChallengeStore struct {
	mu    sync.RWMutex
	items map[string]challengeItem
}

func newWebAuthnChallengeStore() *webAuthnChallengeStore {
	store := &webAuthnChallengeStore{
		items: make(map[string]challengeItem),
	}

	// Periodically prune expired items every 2 minutes
	go func() {
		ticker := time.NewTicker(2 * time.Minute)
		for range ticker.C {
			store.mu.Lock()
			now := time.Now()
			for k, v := range store.items {
				if now.After(v.expiresAt) {
					delete(store.items, k)
				}
			}
			store.mu.Unlock()
		}
	}()

	return store
}

func (s *webAuthnChallengeStore) Save(sessionData *webauthn.SessionData, userID string, ttl time.Duration) string {
	s.mu.Lock()
	defer s.mu.Unlock()

	b := make([]byte, 24)
	rand.Read(b)
	key := base64.RawURLEncoding.EncodeToString(b)

	s.items[key] = challengeItem{
		sessionData: sessionData,
		userID:      userID,
		expiresAt:   time.Now().Add(ttl),
	}
	return key
}

func (s *webAuthnChallengeStore) Pop(key string) (*webauthn.SessionData, string, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	item, exists := s.items[key]
	if !exists {
		return nil, "", false
	}
	delete(s.items, key)

	if time.Now().After(item.expiresAt) {
		return nil, "", false
	}
	return item.sessionData, item.userID, true
}
