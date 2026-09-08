package google

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"golang.org/x/oauth2/google"
)

// AndroidAppItem represents a registered Android app in Firebase.
type AndroidAppItem struct {
	Name        string `json:"name"`
	AppID       string `json:"appId"`
	DisplayName string `json:"displayName"`
	PackageName string `json:"packageName"`
}

// IosAppItem represents a registered iOS app in Firebase.
type IosAppItem struct {
	Name        string `json:"name"`
	AppID       string `json:"appId"`
	DisplayName string `json:"displayName"`
	BundleID    string `json:"bundleId"`
}

// WebAppItem represents a registered Web app in Firebase.
type WebAppItem struct {
	Name        string `json:"name"`
	AppID       string `json:"appId"`
	DisplayName string `json:"displayName"`
}

// WebAppConfig represents the client-side configuration artifact for Web.
type WebAppConfig struct {
	ProjectID         string `json:"projectId"`
	AppID             string `json:"appId"`
	APIKey            string `json:"apiKey"`
	AuthDomain        string `json:"authDomain"`
	MessagingSenderID string `json:"messagingSenderId"`
	StorageBucket     string `json:"storageBucket"`
	ProjectNumber     string `json:"projectNumber"`
}

// FirebaseProjectPreflight holds discovery information about the Firebase project.
type FirebaseProjectPreflight struct {
	ProjectID   string           `json:"project_id"`
	AndroidApps []AndroidAppItem `json:"android_apps"`
	IosApps     []IosAppItem     `json:"ios_apps"`
	WebApps     []WebAppItem     `json:"web_apps"`
	Error       string           `json:"error,omitempty"`
}

// getFirebaseClient returns an authenticated HTTP client for Firebase Management API.
// Works seamlessly with Firebase Admin SDK private key JSON downloaded from Firebase Console.
func getFirebaseClient(ctx context.Context, rawJSON string) (*http.Client, string, error) {
	creds, err := google.CredentialsFromJSON(
		ctx,
		[]byte(rawJSON),
		"https://www.googleapis.com/auth/firebase",
		"https://www.googleapis.com/auth/firebase.readonly",
		"https://www.googleapis.com/auth/cloud-platform",
		"https://www.googleapis.com/auth/cloud-platform.read-only",
	)
	if err != nil {
		return nil, "", fmt.Errorf("không thể đọc thông tin xác thực Google Service Account: %w", err)
	}

	token, err := creds.TokenSource.Token()
	if err != nil {
		return nil, "", fmt.Errorf("lỗi trao đổi token Google OAuth2: %w", err)
	}
	if token == nil || token.AccessToken == "" {
		return nil, "", errors.New("không nhận được access token từ Google")
	}

	client := oauth2HTTPClient(token.AccessToken)
	return client, creds.ProjectID, nil
}

func oauth2HTTPClient(accessToken string) *http.Client {
	return &http.Client{
		Timeout: 12 * time.Second,
		Transport: &roundTripperWithAuth{
			token: accessToken,
			base:  http.DefaultTransport,
		},
	}
}

type roundTripperWithAuth struct {
	token string
	base  http.RoundTripper
}

func (r *roundTripperWithAuth) RoundTrip(req *http.Request) (*http.Response, error) {
	req2 := req.Clone(req.Context())
	req2.Header.Set("Authorization", "Bearer "+r.token)
	return r.base.RoundTrip(req2)
}

// InspectFirebaseProject queries available Android, iOS, and Web apps in the project.
func InspectFirebaseProject(ctx context.Context, rawJSON string) (*FirebaseProjectPreflight, error) {
	client, projectID, err := getFirebaseClient(ctx, rawJSON)
	if err != nil {
		return nil, err
	}

	res := &FirebaseProjectPreflight{
		ProjectID:   projectID,
		AndroidApps: make([]AndroidAppItem, 0),
		IosApps:     make([]IosAppItem, 0),
		WebApps:     make([]WebAppItem, 0),
	}

	// 1. Android Apps
	androidURL := fmt.Sprintf("https://firebase.googleapis.com/v1beta1/projects/%s/androidApps", projectID)
	if req, err := http.NewRequestWithContext(ctx, http.MethodGet, androidURL, nil); err == nil {
		if resp, err := client.Do(req); err == nil {
			defer resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				var data struct {
					Apps []AndroidAppItem `json:"apps"`
				}
				if err := json.NewDecoder(resp.Body).Decode(&data); err == nil {
					res.AndroidApps = data.Apps
				}
			} else {
				b, _ := io.ReadAll(resp.Body)
				errMsg := string(b)
				if strings.Contains(errMsg, "Firebase Management API has not been used") || strings.Contains(errMsg, "disabled") {
					res.Error = fmt.Sprintf("Dự án '%s' chưa bật Firebase Management API trên Google Cloud Console.", projectID)
				} else if resp.StatusCode == http.StatusForbidden {
					res.Error = fmt.Sprintf("Service account thiếu quyền đọc cấu hình Firebase (HTTP 403): %s", errMsg)
				}
			}
		}
	}

	// 2. iOS Apps
	iosURL := fmt.Sprintf("https://firebase.googleapis.com/v1beta1/projects/%s/iosApps", projectID)
	if req, err := http.NewRequestWithContext(ctx, http.MethodGet, iosURL, nil); err == nil {
		if resp, err := client.Do(req); err == nil {
			defer resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				var data struct {
					Apps []IosAppItem `json:"apps"`
				}
				if err := json.NewDecoder(resp.Body).Decode(&data); err == nil {
					res.IosApps = data.Apps
				}
			}
		}
	}

	// 3. Web Apps
	webURL := fmt.Sprintf("https://firebase.googleapis.com/v1beta1/projects/%s/webApps", projectID)
	if req, err := http.NewRequestWithContext(ctx, http.MethodGet, webURL, nil); err == nil {
		if resp, err := client.Do(req); err == nil {
			defer resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				var data struct {
					Apps []WebAppItem `json:"apps"`
				}
				if err := json.NewDecoder(resp.Body).Decode(&data); err == nil {
					res.WebApps = data.Apps
				}
			}
		}
	}

	return res, nil
}

// FetchAndroidConfigFile downloads and decodes google-services.json for a given Android app.
func FetchAndroidConfigFile(ctx context.Context, rawJSON string, appID string) (filename string, content []byte, err error) {
	client, projectID, err := getFirebaseClient(ctx, rawJSON)
	if err != nil {
		return "", nil, err
	}

	if appID == "" {
		// Auto-discover the first active android app
		preflight, pErr := InspectFirebaseProject(ctx, rawJSON)
		if pErr != nil {
			return "", nil, pErr
		}
		if preflight.Error != "" {
			return "", nil, errors.New(preflight.Error)
		}
		if len(preflight.AndroidApps) == 0 {
			return "", nil, fmt.Errorf("dự án Firebase ('%s') chưa có ứng dụng Android nào trên Firebase Console. Vui lòng vào console.firebase.google.com để thêm ứng dụng Android", projectID)
		}
		appID = preflight.AndroidApps[0].AppID
	}

	url := fmt.Sprintf("https://firebase.googleapis.com/v1beta1/projects/%s/androidApps/%s/config", projectID, appID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", nil, err
	}

	resp, err := client.Do(req)
	if err != nil {
		return "", nil, fmt.Errorf("lỗi kết nối tải config Android: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return "", nil, fmt.Errorf("Google trả về mã lỗi %d: %s", resp.StatusCode, string(b))
	}

	var artifact struct {
		ConfigFilename     string `json:"configFilename"`
		ConfigFileContents string `json:"configFileContents"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&artifact); err != nil {
		return "", nil, fmt.Errorf("lỗi đọc dữ liệu config Android: %w", err)
	}

	decoded, err := base64.StdEncoding.DecodeString(artifact.ConfigFileContents)
	if err != nil {
		return "", nil, fmt.Errorf("lỗi giải mã base64 config Android: %w", err)
	}

	fn := artifact.ConfigFilename
	if fn == "" {
		fn = "google-services.json"
	}
	return fn, decoded, nil
}

// FetchIosConfigFile downloads and decodes GoogleService-Info.plist for a given iOS app.
func FetchIosConfigFile(ctx context.Context, rawJSON string, appID string) (filename string, content []byte, err error) {
	client, projectID, err := getFirebaseClient(ctx, rawJSON)
	if err != nil {
		return "", nil, err
	}

	if appID == "" {
		// Auto-discover the first active ios app
		preflight, pErr := InspectFirebaseProject(ctx, rawJSON)
		if pErr != nil {
			return "", nil, pErr
		}
		if preflight.Error != "" {
			return "", nil, errors.New(preflight.Error)
		}
		if len(preflight.IosApps) == 0 {
			return "", nil, fmt.Errorf("dự án Firebase ('%s') chưa có ứng dụng iOS nào trên Firebase Console. Vui lòng vào console.firebase.google.com để thêm ứng dụng iOS", projectID)
		}
		appID = preflight.IosApps[0].AppID
	}

	url := fmt.Sprintf("https://firebase.googleapis.com/v1beta1/projects/%s/iosApps/%s/config", projectID, appID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", nil, err
	}

	resp, err := client.Do(req)
	if err != nil {
		return "", nil, fmt.Errorf("lỗi kết nối tải config iOS: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return "", nil, fmt.Errorf("Google trả về mã lỗi %d: %s", resp.StatusCode, string(b))
	}

	var artifact struct {
		ConfigFilename     string `json:"configFilename"`
		ConfigFileContents string `json:"configFileContents"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&artifact); err != nil {
		return "", nil, fmt.Errorf("lỗi đọc dữ liệu config iOS: %w", err)
	}

	decoded, err := base64.StdEncoding.DecodeString(artifact.ConfigFileContents)
	if err != nil {
		return "", nil, fmt.Errorf("lỗi giải mã base64 config iOS: %w", err)
	}

	fn := artifact.ConfigFilename
	if fn == "" {
		fn = "GoogleService-Info.plist"
	}
	return fn, decoded, nil
}

// FetchWebAppConfig downloads client-side Firebase Web SDK configuration.
func FetchWebAppConfig(ctx context.Context, rawJSON string, appID string) (*WebAppConfig, error) {
	client, projectID, err := getFirebaseClient(ctx, rawJSON)
	if err != nil {
		return nil, err
	}

	if appID == "" {
		preflight, pErr := InspectFirebaseProject(ctx, rawJSON)
		if pErr != nil {
			return nil, pErr
		}
		if len(preflight.WebApps) == 0 {
			return nil, errors.New("dự án Firebase chưa tạo Web App nào")
		}
		appID = preflight.WebApps[0].AppID
	}

	url := fmt.Sprintf("https://firebase.googleapis.com/v1beta1/projects/%s/webApps/%s/config", projectID, appID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("lỗi kết nối tải config Web: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("Google trả về mã lỗi %d: %s", resp.StatusCode, string(b))
	}

	var cfg WebAppConfig
	if err := json.NewDecoder(resp.Body).Decode(&cfg); err != nil {
		return nil, fmt.Errorf("lỗi đọc WebAppConfig: %w", err)
	}
	if cfg.ProjectID == "" {
		cfg.ProjectID = projectID
	}
	if cfg.AuthDomain == "" && cfg.ProjectID != "" {
		cfg.AuthDomain = strings.TrimSpace(cfg.ProjectID) + ".firebaseapp.com"
	}
	return &cfg, nil
}
