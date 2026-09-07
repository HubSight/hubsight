package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"github.com/pquerna/otp"
	"github.com/pquerna/otp/totp"
	qrcode "github.com/skip2/go-qrcode"
)

// TOTPSetupResult contains the generated key and QR code data for client setup.
type TOTPSetupResult struct {
	Secret        string   `json:"secret"`
	URL           string   `json:"url"`
	QRCodeDataURL string   `json:"qr_code"`
	RecoveryCodes []string `json:"recovery_codes"`
}

// GenerateTOTP creates a new TOTP secret, enrollment URL, base64 QR code image, and recovery codes.
func GenerateTOTP(username string) (*TOTPSetupResult, []string, error) {
	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      "HubSight CCTV",
		AccountName: username,
		Period:      30,
		Digits:      otp.DigitsSix,
		Algorithm:   otp.AlgorithmSHA1,
	})
	if err != nil {
		return nil, nil, fmt.Errorf("failed generating TOTP key: %w", err)
	}

	otpURL := key.URL()

	// Generate QR code PNG bytes (256x256)
	pngBytes, err := qrcode.Encode(otpURL, qrcode.Medium, 256)
	if err != nil {
		return nil, nil, fmt.Errorf("failed encoding QR code: %w", err)
	}
	qrDataURL := "data:image/png;base64," + base64.StdEncoding.EncodeToString(pngBytes)

	// Generate 8 plaintext recovery codes and their hashed storage versions
	plainCodes, hashedCodes, err := GenerateRecoveryCodes(8)
	if err != nil {
		return nil, nil, fmt.Errorf("failed generating recovery codes: %w", err)
	}

	res := &TOTPSetupResult{
		Secret:        key.Secret(),
		URL:           otpURL,
		QRCodeDataURL: qrDataURL,
		RecoveryCodes: plainCodes,
	}

	return res, hashedCodes, nil
}

// ValidateTOTP verifies a 6-digit TOTP code against the base32 secret with +/- 1 period clock drift.
func ValidateTOTP(secret, code string) bool {
	code = strings.TrimSpace(code)
	if len(code) != 6 {
		return false
	}

	valid, err := totp.ValidateCustom(code, secret, time.Now().UTC(), totp.ValidateOpts{
		Period:    30,
		Skew:      1, // Allow 1 step (30s) before and after
		Digits:    otp.DigitsSix,
		Algorithm: otp.AlgorithmSHA1,
	})
	if err != nil {
		return false
	}
	return valid
}

// GenerateRecoveryCodes generates count random recovery codes (formatted as xxxx-xxxx)
// and returns both plaintext and hashed copies.
func GenerateRecoveryCodes(count int) ([]string, []string, error) {
	plain := make([]string, count)
	hashed := make([]string, count)

	for i := 0; i < count; i++ {
		bytes := make([]byte, 5) // 10 hex characters
		if _, err := rand.Read(bytes); err != nil {
			return nil, nil, err
		}
		rawHex := hex.EncodeToString(bytes)
		code := fmt.Sprintf("%s-%s", rawHex[:5], rawHex[5:])
		plain[i] = code

		// Hash with SHA-256 for persistent database storage
		h := sha256.Sum256([]byte(strings.ToUpper(strings.ReplaceAll(code, "-", ""))))
		hashed[i] = hex.EncodeToString(h[:])
	}

	return plain, hashed, nil
}

// HashRecoveryCode hashes an input recovery code for comparison against stored hashes.
func HashRecoveryCode(code string) string {
	cleaned := strings.ToUpper(strings.TrimSpace(strings.ReplaceAll(code, "-", "")))
	h := sha256.Sum256([]byte(cleaned))
	return hex.EncodeToString(h[:])
}

// VerifyAndConsumeRecoveryCode checks if the provided code matches any unused recovery code.
// If valid, the code is burned and the remaining hashed list is returned.
func VerifyAndConsumeRecoveryCode(storedHashes []string, inputCode string) (bool, []string) {
	if len(storedHashes) == 0 {
		return false, storedHashes
	}

	inputHash := HashRecoveryCode(inputCode)
	for i, h := range storedHashes {
		if h == inputHash {
			// Burn this recovery code: remove from slice
			updated := append(storedHashes[:i], storedHashes[i+1:]...)
			return true, updated
		}
	}

	return false, storedHashes
}
