package api

import (
	"testing"
)

func TestParseAndValidateServiceAccountJSON(t *testing.T) {
	// 1. Valid service account JSON
	validJSON := `{
		"type": "service_account",
		"project_id": "hubsight-cctv-prod",
		"private_key_id": "key123456",
		"private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n",
		"client_email": "firebase-adminsdk@hubsight-cctv-prod.iam.gserviceaccount.com",
		"client_id": "100200300400",
		"auth_uri": "https://accounts.google.com/o/oauth2/auth",
		"token_uri": "https://oauth2.googleapis.com/token"
	}`

	sa, err := ParseAndValidateServiceAccountJSON(validJSON)
	if err != nil {
		t.Fatalf("Expected valid JSON, got error: %v", err)
	}
	if sa.ProjectID != "hubsight-cctv-prod" {
		t.Errorf("Expected project_id 'hubsight-cctv-prod', got '%s'", sa.ProjectID)
	}
	if sa.ClientEmail != "firebase-adminsdk@hubsight-cctv-prod.iam.gserviceaccount.com" {
		t.Errorf("Expected client_email, got '%s'", sa.ClientEmail)
	}
	if sa.PrivateKeyID != "key123456" {
		t.Errorf("Expected private_key_id, got '%s'", sa.PrivateKeyID)
	}

	// 2. Non-service_account type
	invalidTypeJSON := `{
		"type": "authorized_user",
		"project_id": "test",
		"client_email": "test@example.com",
		"private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
	}`
	_, err = ParseAndValidateServiceAccountJSON(invalidTypeJSON)
	if err == nil {
		t.Errorf("Expected error for non-service_account type, got nil")
	}

	// 3. Missing project_id
	missingProjectJSON := `{
		"type": "service_account",
		"client_email": "test@example.com",
		"private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
	}`
	_, err = ParseAndValidateServiceAccountJSON(missingProjectJSON)
	if err == nil {
		t.Errorf("Expected error for missing project_id, got nil")
	}

	// 4. Missing private_key
	missingKeyJSON := `{
		"type": "service_account",
		"project_id": "test",
		"client_email": "test@example.com"
	}`
	_, err = ParseAndValidateServiceAccountJSON(missingKeyJSON)
	if err == nil {
		t.Errorf("Expected error for missing private_key, got nil")
	}

	// 5. Invalid RSA PEM format
	invalidKeyFormat := `{
		"type": "service_account",
		"project_id": "test",
		"client_email": "test@example.com",
		"private_key": "not-a-valid-pem-key"
	}`
	_, err = ParseAndValidateServiceAccountJSON(invalidKeyFormat)
	if err == nil {
		t.Errorf("Expected error for invalid RSA PEM format, got nil")
	}
}
