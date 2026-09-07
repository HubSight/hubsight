package auth

import (
	"testing"
	"time"

	"github.com/pquerna/otp/totp"
)

func TestTOTPGenerationAndValidation(t *testing.T) {
	setup, hashedCodes, err := GenerateTOTP("testuser")
	if err != nil {
		t.Fatalf("GenerateTOTP failed: %v", err)
	}

	if setup.Secret == "" {
		t.Errorf("expected non-empty secret")
	}
	if len(setup.RecoveryCodes) != 8 {
		t.Errorf("expected 8 recovery codes, got %d", len(setup.RecoveryCodes))
	}
	if len(hashedCodes) != 8 {
		t.Errorf("expected 8 hashed codes, got %d", len(hashedCodes))
	}

	// Generate valid code using the secret
	code, err := totp.GenerateCode(setup.Secret, time.Now().UTC())
	if err != nil {
		t.Fatalf("GenerateCode failed: %v", err)
	}

	if !ValidateTOTP(setup.Secret, code) {
		t.Errorf("expected valid code %s to be accepted", code)
	}

	// Invalidate code
	if ValidateTOTP(setup.Secret, "000000") && code != "000000" {
		t.Errorf("expected invalid code to be rejected")
	}

	// Short code
	if ValidateTOTP(setup.Secret, "123") {
		t.Errorf("expected short code to be rejected")
	}
}

func TestRecoveryCodes(t *testing.T) {
	plainCodes, hashedCodes, err := GenerateRecoveryCodes(8)
	if err != nil {
		t.Fatalf("GenerateRecoveryCodes failed: %v", err)
	}

	if len(plainCodes) != 8 || len(hashedCodes) != 8 {
		t.Fatalf("expected 8 plain and 8 hashed codes")
	}

	testCode := plainCodes[0]

	// Verify valid code
	valid, remaining := VerifyAndConsumeRecoveryCode(hashedCodes, testCode)
	if !valid {
		t.Fatalf("expected code %s to be valid", testCode)
	}
	if len(remaining) != 7 {
		t.Fatalf("expected 7 remaining codes, got %d", len(remaining))
	}

	// Verify that reused code is now burned and rejected
	valid2, _ := VerifyAndConsumeRecoveryCode(remaining, testCode)
	if valid2 {
		t.Errorf("expected already consumed code %s to be rejected", testCode)
	}

	// Verify invalid code
	valid3, _ := VerifyAndConsumeRecoveryCode(remaining, "invalid-code")
	if valid3 {
		t.Errorf("expected random code to be rejected")
	}
}
