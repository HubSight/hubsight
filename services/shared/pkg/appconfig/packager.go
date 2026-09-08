package appconfig

import (
	"archive/zip"
	"bytes"
	"crypto/ed25519"
	"fmt"
	"io"
	"time"

	"gopkg.in/yaml.v3"
)

// PackOptions contains all input parameters needed to create a .hscfg file.
type PackOptions struct {
	ConfigID            string
	ConfigName          string
	CreatedByID         string
	CreatedByUsername   string
	CreatedAt           time.Time
	PIN                 string // 6-digit PIN

	// URLs
	// Unified gateway & services behind Nginx reverse proxy
	GatewayURL          string // e.g. https://cctv.example.com
	APIBaseURL          string // e.g. https://cctv.example.com/api (unified via Gateway)
	RelayWSURL          string // e.g. wss://cctv.example.com/relay (unified via Gateway)
	WebRTCBaseURL       string // e.g. http://cctv.example.com:8555 (direct media streaming port 8555)
	WebRTCSignalingURL  string // e.g. https://cctv.example.com/webrtc (unified via Gateway /webrtc)
	WebRTCMediaPort     int    // defaults to 8555

	// Client info
	ClientID            string
	ClientName          string
	APIKey              string
	Platform            string // e.g. "client", "mobile", "desktop"

	// FCM configs
	AndroidConfigBytes  []byte // google-services.json content
	IosConfigBytes      []byte // GoogleService-Info.plist content

	// Optional custom CA certificate
	CACertBytes         []byte

	// Server signing private key
	SigningPrivateKey   ed25519.PrivateKey
}

// UnpackedConfig represents the extracted content of a decrypted .hscfg file.
type UnpackedConfig struct {
	MetadataYML         string
	UrlsYML             string
	KeyYML              string
	GoogleServicesJSON  []byte
	GoogleServiceInfoPlist []byte
	CACertPEM           []byte
}

// PackAndEncrypt builds the internal zip structure and encrypts it into a .hscfg container.
func PackAndEncrypt(opts PackOptions) ([]byte, string, error) {
	if len(opts.PIN) < 6 {
		return nil, "", fmt.Errorf("mã PIN phải có ít nhất 6 ký tự")
	}

	// 1. Build URLs YAML with unified gateway & dedicated webrtc media port
	webrtcSignaling := opts.WebRTCSignalingURL
	if webrtcSignaling == "" && opts.GatewayURL != "" {
		webrtcSignaling = opts.GatewayURL + "/webrtc"
	}
	mediaPort := opts.WebRTCMediaPort
	if mediaPort == 0 {
		mediaPort = 8555
	}

	urlsObj := map[string]interface{}{
		"gateway_url":          opts.GatewayURL,
		"api_base_url":         opts.APIBaseURL,
		"relay_ws_url":         opts.RelayWSURL,
		"webrtc_base_url":      opts.WebRTCBaseURL,
		"webrtc_signaling_url": webrtcSignaling,
		"webrtc_media_port":    mediaPort,
	}
	urlsBytes, err := yaml.Marshal(urlsObj)
	if err != nil {
		return nil, "", fmt.Errorf("lỗi tạo urls.yml: %w", err)
	}

	// 2. Build Key YAML
	createdAtStr := opts.CreatedAt.UTC().Format(time.RFC3339)
	if opts.CreatedAt.IsZero() {
		createdAtStr = time.Now().UTC().Format(time.RFC3339)
	}
	platform := opts.Platform
	if platform == "" {
		platform = "client"
	}
	keyObj := map[string]string{
		"client_id":   opts.ClientID,
		"client_name": opts.ClientName,
		"api_key":     opts.APIKey,
		"platform":    platform,
		"created_at":  createdAtStr,
	}
	keyBytes, err := yaml.Marshal(keyObj)
	if err != nil {
		return nil, "", fmt.Errorf("lỗi tạo key.yml: %w", err)
	}

	// 3. Compute digital signature over payload items
	var signBuf bytes.Buffer
	signBuf.Write(urlsBytes)
	signBuf.Write(keyBytes)
	if len(opts.AndroidConfigBytes) > 0 {
		signBuf.Write(opts.AndroidConfigBytes)
	}
	if len(opts.IosConfigBytes) > 0 {
		signBuf.Write(opts.IosConfigBytes)
	}
	if len(opts.CACertBytes) > 0 {
		signBuf.Write(opts.CACertBytes)
	}

	contentHash := ComputeSHA256(signBuf.Bytes())
	digitalSig := ""
	sigAlg := "none"
	if opts.SigningPrivateKey != nil {
		digitalSig = SignData(signBuf.Bytes(), opts.SigningPrivateKey)
		sigAlg = "Ed25519"
	}

	// 4. Build Metadata YAML
	metaObj := map[string]interface{}{
		"version":             "1.0",
		"issuer":              "HubSight CCTV On-Premise",
		"config_id":           opts.ConfigID,
		"config_name":         opts.ConfigName,
		"created_by_id":       opts.CreatedByID,
		"created_by_username": opts.CreatedByUsername,
		"created_at":          createdAtStr,
		"content_sha256":      contentHash,
		"signature_algorithm": sigAlg,
		"digital_signature":   digitalSig,
	}
	metaBytes, err := yaml.Marshal(metaObj)
	if err != nil {
		return nil, "", fmt.Errorf("lỗi tạo metadata.yml: %w", err)
	}

	// 5. Create in-memory ZIP archive
	zipBuf := new(bytes.Buffer)
	zw := zip.NewWriter(zipBuf)

	addZipFile := func(name string, content []byte) error {
		w, err := zw.Create(name)
		if err != nil {
			return err
		}
		_, err = w.Write(content)
		return err
	}

	if err := addZipFile("metadata.yml", metaBytes); err != nil {
		return nil, "", fmt.Errorf("lỗi ghi metadata.yml vào zip: %w", err)
	}
	if err := addZipFile("urls.yml", urlsBytes); err != nil {
		return nil, "", fmt.Errorf("lỗi ghi urls.yml vào zip: %w", err)
	}
	if err := addZipFile("key.yml", keyBytes); err != nil {
		return nil, "", fmt.Errorf("lỗi ghi key.yml vào zip: %w", err)
	}
	if len(opts.AndroidConfigBytes) > 0 {
		if err := addZipFile("google-services.json", opts.AndroidConfigBytes); err != nil {
			return nil, "", fmt.Errorf("lỗi ghi google-services.json vào zip: %w", err)
		}
	}
	if len(opts.IosConfigBytes) > 0 {
		if err := addZipFile("GoogleService-Info.plist", opts.IosConfigBytes); err != nil {
			return nil, "", fmt.Errorf("lỗi ghi GoogleService-Info.plist vào zip: %w", err)
		}
	}
	if len(opts.CACertBytes) > 0 {
		if err := addZipFile("ca_cert.pem", opts.CACertBytes); err != nil {
			return nil, "", fmt.Errorf("lỗi ghi ca_cert.pem vào zip: %w", err)
		}
	}

	if err := zw.Close(); err != nil {
		return nil, "", fmt.Errorf("lỗi đóng zip archive: %w", err)
	}

	// 6. Encrypt ZIP archive into .hscfg container
	hscfgBytes, err := EncryptContainer(zipBuf.Bytes(), opts.PIN)
	if err != nil {
		return nil, "", fmt.Errorf("lỗi mã hóa container: %w", err)
	}

	checksum := ComputeSHA256(hscfgBytes)
	return hscfgBytes, checksum, nil
}

// DecryptAndUnpack decrypts and extracts all items from a .hscfg container.
func DecryptAndUnpack(hscfgData []byte, pin string) (*UnpackedConfig, error) {
	zipBytes, err := DecryptContainer(hscfgData, pin)
	if err != nil {
		return nil, err
	}

	zr, err := zip.NewReader(bytes.NewReader(zipBytes), int64(len(zipBytes)))
	if err != nil {
		return nil, fmt.Errorf("dữ liệu zip bên trong không hợp lệ: %w", err)
	}

	res := &UnpackedConfig{}
	for _, f := range zr.File {
		rc, err := f.Open()
		if err != nil {
			return nil, err
		}
		data, err := io.ReadAll(rc)
		rc.Close()
		if err != nil {
			return nil, err
		}

		switch f.Name {
		case "metadata.yml":
			res.MetadataYML = string(data)
		case "urls.yml":
			res.UrlsYML = string(data)
		case "key.yml":
			res.KeyYML = string(data)
		case "google-services.json":
			res.GoogleServicesJSON = data
		case "GoogleService-Info.plist":
			res.GoogleServiceInfoPlist = data
		case "ca_cert.pem":
			res.CACertPEM = data
		}
	}

	return res, nil
}
