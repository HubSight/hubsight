package appconfig

import (
	"bytes"
	"strings"
	"testing"
	"time"
)

func TestEncryptAndDecryptContainer(t *testing.T) {
	pin := "839210"
	secretPayload := []byte("hello hubsight app config container with high security")

	// Encrypt
	enc, err := EncryptContainer(secretPayload, pin)
	if err != nil {
		t.Fatalf("EncryptContainer failed: %v", err)
	}

	// Check magic header
	if len(enc) < len(MagicBytes) || !bytes.Equal(enc[:len(MagicBytes)], MagicBytes) {
		t.Fatalf("Expected magic header %v, got %v", MagicBytes, enc[:len(MagicBytes)])
	}

	// Decrypt with correct PIN
	dec, err := DecryptContainer(enc, pin)
	if err != nil {
		t.Fatalf("DecryptContainer failed: %v", err)
	}
	if !bytes.Equal(dec, secretPayload) {
		t.Fatalf("Decrypted payload mismatch. Expected %s, got %s", string(secretPayload), string(dec))
	}

	// Decrypt with WRONG PIN
	_, err = DecryptContainer(enc, "000000")
	if err == nil {
		t.Fatal("Expected decryption to fail with wrong PIN, but succeeded")
	}

	// Tamper test: modify 1 byte in ciphertext
	tampered := make([]byte, len(enc))
	copy(tampered, enc)
	tampered[len(tampered)-5] ^= 0xFF
	_, err = DecryptContainer(tampered, pin)
	if err == nil {
		t.Fatal("Expected decryption to fail on tampered data, but succeeded")
	}
}

func TestPackAndUnpackFull(t *testing.T) {
	pub, priv, err := GenerateSigningKeyPair()
	if err != nil {
		t.Fatalf("GenerateSigningKeyPair failed: %v", err)
	}

	pin := "123456"
	opts := PackOptions{
		ConfigID:           "cfg_test_12345",
		ConfigName:         "Test App Profile",
		CreatedByID:        "usr_admin_01",
		CreatedByUsername:  "admin",
		CreatedAt:          time.Now().UTC(),
		PIN:                pin,
		GatewayURL:         "https://cctv.local:8088",
		APIBaseURL:         "https://cctv.local:8088/api",
		WebRTCBaseURL:      "https://cctv.local:8088/webrtc",
		RelayWSURL:         "wss://cctv.local:8088/relay",
		ClientID:           "app_client_test",
		ClientName:         "Test Client",
		APIKey:             "hs_app_test_secret_key_12345",
		Platform:           "all",
		AndroidConfigBytes: []byte(`{"project_info":{"project_id":"hubsight-cctv"}}`),
		IosConfigBytes:     []byte(`<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict></dict></plist>`),
		CACertBytes:        []byte("-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----"),
		SigningPrivateKey:  priv,
	}

	hscfgBytes, checksum, err := PackAndEncrypt(opts)
	if err != nil {
		t.Fatalf("PackAndEncrypt failed: %v", err)
	}
	if len(checksum) != 64 {
		t.Fatalf("Expected 64-char sha256 checksum, got %s", checksum)
	}

	// Decrypt & Unpack
	unpacked, err := DecryptAndUnpack(hscfgBytes, pin)
	if err != nil {
		t.Fatalf("DecryptAndUnpack failed: %v", err)
	}

	if !strings.Contains(unpacked.UrlsYML, "https://cctv.local:8088/api") {
		t.Errorf("UrlsYML missing api_base_url: %s", unpacked.UrlsYML)
	}
	if !strings.Contains(unpacked.KeyYML, "hs_app_test_secret_key_12345") {
		t.Errorf("KeyYML missing api_key: %s", unpacked.KeyYML)
	}
	if !strings.Contains(unpacked.MetadataYML, "Ed25519") {
		t.Errorf("MetadataYML missing Ed25519 signature: %s", unpacked.MetadataYML)
	}
	if !strings.Contains(string(unpacked.GoogleServicesJSON), "hubsight-cctv") {
		t.Errorf("Android JSON content mismatch: %s", string(unpacked.GoogleServicesJSON))
	}
	if !strings.Contains(string(unpacked.GoogleServiceInfoPlist), "plist") {
		t.Errorf("iOS plist content mismatch: %s", string(unpacked.GoogleServiceInfoPlist))
	}

	// Verify digital signature
	sigBase64 := ""
	lines := strings.Split(unpacked.MetadataYML, "\n")
	for _, line := range lines {
		if strings.HasPrefix(line, "digital_signature:") {
			sigBase64 = strings.TrimSpace(strings.TrimPrefix(line, "digital_signature:"))
			sigBase64 = strings.Trim(sigBase64, `"'`)
		}
	}
	if sigBase64 == "" {
		t.Fatal("digital_signature was not found in metadata.yml")
	}

	var signBuf bytes.Buffer
	signBuf.WriteString(unpacked.UrlsYML)
	signBuf.WriteString(unpacked.KeyYML)
	signBuf.Write(unpacked.GoogleServicesJSON)
	signBuf.Write(unpacked.GoogleServiceInfoPlist)
	signBuf.Write(unpacked.CACertPEM)

	if !VerifySignature(signBuf.Bytes(), sigBase64, pub) {
		t.Fatal("Ed25519 digital signature verification failed!")
	}
}
