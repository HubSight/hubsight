package fingerprint

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

// DeviceInfo holds parsed client and device metadata recorded into sessions and audit logs.
type DeviceInfo struct {
	Fingerprint  string   `json:"fingerprint"`
	DeviceLabel  string   `json:"device_label"`
	ClientType   string   `json:"client_type"`
	IPAddress    string   `json:"ip_address"`
	UserAgent    string   `json:"user_agent"`
	GeoCity      string   `json:"geo_city"`
	GeoCountry   string   `json:"geo_country"`
	GeoRegion    string   `json:"geo_region"`
	GeoLatitude  *float64 `json:"geo_latitude"`
	GeoLongitude *float64 `json:"geo_longitude"`
	GeoAccuracy  *float64 `json:"geo_accuracy"`
}

// ClientDeviceInfo represents detailed client and device information explicitly provided by Web or Native Apps during login.
type ClientDeviceInfo struct {
	Fingerprint      string   `json:"fingerprint,omitempty"`
	DeviceLabel      string   `json:"device_label,omitempty"`
	ClientType       string   `json:"client_type,omitempty"`       // web, desktop_windows, desktop_mac, desktop_linux, desktop_app, mobile_ios, mobile_android, third_party
	Platform         string   `json:"platform,omitempty"`          // e.g. "Windows", "macOS", "iOS", "Android", "Linux"
	OSVersion        string   `json:"os_version,omitempty"`        // e.g. "11", "14.4", "17.5.1"
	BrowserName      string   `json:"browser_name,omitempty"`      // e.g. "Chrome", "Firefox", "Safari", "Edge"
	BrowserVersion   string   `json:"browser_version,omitempty"`   // e.g. "128.0"
	AppVersion       string   `json:"app_version,omitempty"`       // e.g. "1.0.0"
	Model            string   `json:"model,omitempty"`             // e.g. "iPhone 15 Pro", "SM-S928B", "Dell XPS 15"
	Manufacturer     string   `json:"manufacturer,omitempty"`      // e.g. "Apple", "Samsung", "Dell"
	ScreenResolution string   `json:"screen_resolution,omitempty"` // e.g. "1920x1080"
	Language         string   `json:"language,omitempty"`          // e.g. "vi-VN", "en-US"
	Timezone         string   `json:"timezone,omitempty"`          // e.g. "Asia/Ho_Chi_Minh"
	Latitude         *float64 `json:"latitude,omitempty"`
	Longitude        *float64 `json:"longitude,omitempty"`
	Accuracy         *float64 `json:"accuracy,omitempty"`
	GeoCity          string   `json:"geo_city,omitempty"`
	GeoCountry       string   `json:"geo_country,omitempty"`
	GeoRegion        string   `json:"geo_region,omitempty"`
}

// Detect extracts device metadata from HTTP headers and client connection (legacy helper).
func Detect(r *http.Request) DeviceInfo {
	return DetectWithClientInfo(r, nil)
}

// DetectWithClientInfo extracts rich device metadata prioritizing explicit client-reported info,
// falling back to custom HTTP headers, and finally to User-Agent & connection heuristics.
func DetectWithClientInfo(r *http.Request, clientInfo *ClientDeviceInfo) DeviceInfo {
	ip := GetClientIP(r)
	ua := ""
	acceptLang := ""
	if r != nil {
		ua = r.UserAgent()
		acceptLang = r.Header.Get("Accept-Language")
	}

	// 1. Device Fingerprint:
	// Priority: clientInfo.Fingerprint -> Header X-Device-Fingerprint -> Fallback deterministic hash
	var fingerprint string
	if clientInfo != nil && strings.TrimSpace(clientInfo.Fingerprint) != "" {
		fingerprint = strings.TrimSpace(clientInfo.Fingerprint)
	} else if r != nil && strings.TrimSpace(r.Header.Get("X-Device-Fingerprint")) != "" {
		fingerprint = strings.TrimSpace(r.Header.Get("X-Device-Fingerprint"))
	} else {
		fingerprint = GenerateFingerprint(ip, ua, acceptLang)
	}

	// 2. Parse User-Agent as baseline
	detectedClientType, detectedLabel := ParseUserAgent(ua)

	// 3. ClientType resolution:
	// Priority: clientInfo.ClientType -> Header X-Client-Type -> detectedClientType
	clientType := detectedClientType
	if clientInfo != nil && strings.TrimSpace(clientInfo.ClientType) != "" {
		clientType = sanitizeClientType(clientInfo.ClientType)
	} else if r != nil && strings.TrimSpace(r.Header.Get("X-Client-Type")) != "" {
		clientType = sanitizeClientType(r.Header.Get("X-Client-Type"))
	}

	// 4. DeviceLabel resolution:
	// Priority: clientInfo.DeviceLabel -> Header X-Device-Label -> built label -> detectedLabel
	deviceLabel := detectedLabel
	if clientInfo != nil {
		if customLabel := strings.TrimSpace(clientInfo.DeviceLabel); customLabel != "" {
			deviceLabel = customLabel
		} else {
			built := buildDeviceLabel(clientInfo, detectedLabel)
			if built != "" {
				deviceLabel = built
			}
		}
	} else if r != nil && strings.TrimSpace(r.Header.Get("X-Device-Label")) != "" {
		rawLabel := strings.TrimSpace(r.Header.Get("X-Device-Label"))
		if unescaped, err := url.QueryUnescape(rawLabel); err == nil {
			rawLabel = unescaped
		}
		deviceLabel = rawLabel
	}

	// If screen resolution or model passed via headers and not already in label
	if r != nil {
		if headerModel := strings.TrimSpace(r.Header.Get("X-Device-Model")); headerModel != "" {
			if unescaped, err := url.QueryUnescape(headerModel); err == nil {
				headerModel = unescaped
			}
			if !strings.Contains(deviceLabel, headerModel) {
				deviceLabel = headerModel + " (" + deviceLabel + ")"
			}
		}
		if screenRes := strings.TrimSpace(r.Header.Get("X-Screen-Resolution")); screenRes != "" && !strings.Contains(deviceLabel, screenRes) {
			deviceLabel = deviceLabel + " (" + screenRes + ")"
		}
	}

	// Ensure label doesn't exceed 128 characters
	if len(deviceLabel) > 128 {
		deviceLabel = deviceLabel[:128]
	}

	// 5. Resolve Geolocation
	var lat, lng, accuracy *float64
	var city, country, region string

	// 5.1. Priority 1: Explicit coordinates from client (GPS / Native OS / Web Geolocation API)
	if clientInfo != nil && clientInfo.Latitude != nil && clientInfo.Longitude != nil {
		lat = clientInfo.Latitude
		lng = clientInfo.Longitude
		accuracy = clientInfo.Accuracy
		city = strings.TrimSpace(clientInfo.GeoCity)
		country = strings.TrimSpace(clientInfo.GeoCountry)
		region = strings.TrimSpace(clientInfo.GeoRegion)
	}

	// 5.2. Priority 2: Edge / CDN Geo Headers (e.g. Cloudflare CF-IPCountry, CF-IPCity, CF-IPLatitude, CF-IPLongitude)
	if r != nil {
		if lat == nil || lng == nil {
			if cfLat := strings.TrimSpace(r.Header.Get("CF-IPLatitude")); cfLat != "" {
				if parsed, err := strconv.ParseFloat(cfLat, 64); err == nil {
					lat = &parsed
				}
			}
			if cfLon := strings.TrimSpace(r.Header.Get("CF-IPLongitude")); cfLon != "" {
				if parsed, err := strconv.ParseFloat(cfLon, 64); err == nil {
					lng = &parsed
				}
			}
		}
		if country == "" {
			if cfCountry := strings.TrimSpace(r.Header.Get("CF-IPCountry")); cfCountry != "" {
				country = cfCountry
			}
		}
		if city == "" {
			if cfCity := strings.TrimSpace(r.Header.Get("CF-IPCity")); cfCity != "" {
				if unescaped, err := url.QueryUnescape(cfCity); err == nil {
					city = unescaped
				} else {
					city = cfCity
				}
			}
		}
	}

	// 5.3. Priority 3: Fallback based on IP
	if city == "" || country == "" || lat == nil {
		fallbackCity, fallbackCountry, fallbackRegion, fallbackLat, fallbackLng := ResolveDetailedGeo(ip)
		if city == "" {
			city = fallbackCity
		}
		if country == "" {
			country = fallbackCountry
		}
		if region == "" {
			region = fallbackRegion
		}
		if lat == nil {
			lat = fallbackLat
			lng = fallbackLng
		}
	}

	return DeviceInfo{
		Fingerprint:  fingerprint,
		DeviceLabel:  deviceLabel,
		ClientType:   clientType,
		IPAddress:    ip,
		UserAgent:    ua,
		GeoCity:      city,
		GeoCountry:   country,
		GeoRegion:    region,
		GeoLatitude:  lat,
		GeoLongitude: lng,
		GeoAccuracy:  accuracy,
	}
}

// buildDeviceLabel synthesizes a clear, informative label from structured device details.
func buildDeviceLabel(c *ClientDeviceInfo, fallback string) string {
	if c == nil {
		return fallback
	}

	// 1. Native Mobile / Desktop Device (Model is specified)
	if c.Model != "" {
		var parts []string
		if c.Manufacturer != "" && !strings.HasPrefix(strings.ToLower(c.Model), strings.ToLower(c.Manufacturer)) {
			parts = append(parts, c.Manufacturer)
		}
		parts = append(parts, c.Model)
		label := strings.Join(parts, " ")

		var osDetails string
		if c.Platform != "" {
			if c.OSVersion != "" {
				osDetails = fmt.Sprintf("%s %s", c.Platform, c.OSVersion)
			} else {
				osDetails = c.Platform
			}
		}

		if osDetails != "" {
			label = fmt.Sprintf("%s (%s)", label, osDetails)
		}

		if c.AppVersion != "" {
			label = fmt.Sprintf("%s • App v%s", label, c.AppVersion)
		}
		return label
	}

	// 2. Web Browser
	if c.BrowserName != "" {
		browserPart := c.BrowserName
		if c.BrowserVersion != "" {
			browserPart += " " + c.BrowserVersion
		}

		osPart := c.Platform
		if osPart != "" && c.OSVersion != "" {
			osPart += " " + c.OSVersion
		}

		var label string
		if osPart != "" {
			label = fmt.Sprintf("%s trên %s", browserPart, osPart)
		} else {
			label = browserPart
		}

		if c.ScreenResolution != "" {
			label = fmt.Sprintf("%s (%s)", label, c.ScreenResolution)
		}
		return label
	}

	// 3. Just platform and resolution
	if c.Platform != "" {
		label := c.Platform
		if c.OSVersion != "" {
			label += " " + c.OSVersion
		}
		if c.ScreenResolution != "" {
			label += " (" + c.ScreenResolution + ")"
		}
		return label
	}

	return fallback
}

// sanitizeClientType validates and normalizes client type strings.
func sanitizeClientType(raw string) string {
	norm := strings.ToLower(strings.TrimSpace(raw))
	switch norm {
	case "web", "browser":
		return "web"
	case "desktop_windows", "windows":
		return "desktop_windows"
	case "desktop_mac", "mac", "macos", "darwin":
		return "desktop_mac"
	case "desktop_linux", "linux":
		return "desktop_linux"
	case "desktop_app", "desktop":
		return "desktop_app"
	case "mobile_ios", "ios", "iphone", "ipad":
		return "mobile_ios"
	case "mobile_android", "android":
		return "mobile_android"
	case "third_party", "api":
		return "third_party"
	default:
		return "web"
	}
}

// GenerateFingerprint creates a deterministic SHA-256 hash when client doesn't provide one.
func GenerateFingerprint(ip, ua, acceptLang string) string {
	h := sha256.New()
	// Use /24 subnet prefix for IPv4 or /48 for IPv6 to avoid minor dynamic IP hops breaking hash
	prefix := ip
	if parsed := net.ParseIP(ip); parsed != nil {
		if ipv4 := parsed.To4(); ipv4 != nil {
			prefix = ipv4.Mask(net.CIDRMask(24, 32)).String()
		}
	}
	h.Write([]byte(prefix + "|" + ua + "|" + acceptLang))
	return hex.EncodeToString(h.Sum(nil))
}

// GetClientIP resolves the actual client IP considering standard reverse-proxy headers.
func GetClientIP(r *http.Request) string {
	if r == nil {
		return "127.0.0.1"
	}

	// 1. CF-Connecting-IP (Cloudflare)
	if cfIP := strings.TrimSpace(r.Header.Get("CF-Connecting-IP")); cfIP != "" {
		return cfIP
	}

	// 2. X-Real-IP
	if realIP := strings.TrimSpace(r.Header.Get("X-Real-IP")); realIP != "" {
		return realIP
	}

	// 3. X-Forwarded-For
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		if len(parts) > 0 {
			candidate := strings.TrimSpace(parts[0])
			if candidate != "" {
				return candidate
			}
		}
	}

	// 4. RemoteAddr
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil && host != "" {
		return host
	}
	return r.RemoteAddr
}

// ParseUserAgent categorizes client type and constructs a clean, user-friendly device label.
func ParseUserAgent(ua string) (clientType, label string) {
	if ua == "" {
		return "web", "Trình duyệt không xác định"
	}

	uaLower := strings.ToLower(ua)

	// Detect HubSight specialized apps
	if strings.Contains(uaLower, "hubsight") {
		if strings.Contains(uaLower, "mobile") || strings.Contains(uaLower, "android") {
			return "mobile_android", "HubSight Mobile (Android)"
		}
		if strings.Contains(uaLower, "iphone") || strings.Contains(uaLower, "ios") {
			return "mobile_ios", "HubSight Mobile (iOS)"
		}
		if strings.Contains(uaLower, "windows") {
			return "desktop_windows", "HubSight Desktop (Windows)"
		}
		if strings.Contains(uaLower, "macintosh") || strings.Contains(uaLower, "darwin") {
			return "desktop_mac", "HubSight Desktop (macOS)"
		}
		if strings.Contains(uaLower, "linux") {
			return "desktop_linux", "HubSight Desktop (Linux)"
		}
		return "desktop_app", "Ứng dụng HubSight"
	}

	// Detect Operating System
	var osName string
	var detectedClientType = "web"

	if strings.Contains(uaLower, "windows nt 10.0") {
		osName = "Windows 10/11"
		detectedClientType = "desktop_windows"
	} else if strings.Contains(uaLower, "windows") {
		osName = "Windows"
		detectedClientType = "desktop_windows"
	} else if strings.Contains(uaLower, "iphone") {
		osName = "iPhone (iOS)"
		detectedClientType = "mobile_ios"
	} else if strings.Contains(uaLower, "ipad") {
		osName = "iPad (iPadOS)"
		detectedClientType = "mobile_ios"
	} else if strings.Contains(uaLower, "android") {
		osName = "Android"
		detectedClientType = "mobile_android"
	} else if strings.Contains(uaLower, "macintosh") || strings.Contains(uaLower, "mac os x") {
		osName = "macOS"
		detectedClientType = "desktop_mac"
	} else if strings.Contains(uaLower, "linux") {
		osName = "Linux"
		detectedClientType = "desktop_linux"
	} else {
		osName = "Thiết bị khác"
	}

	// Detect Browser
	var browserName string
	if strings.Contains(uaLower, "edg/") {
		browserName = "Edge"
	} else if strings.Contains(uaLower, "chrome/") && !strings.Contains(uaLower, "edg/") {
		browserName = "Chrome"
	} else if strings.Contains(uaLower, "safari/") && !strings.Contains(uaLower, "chrome/") {
		browserName = "Safari"
	} else if strings.Contains(uaLower, "firefox/") {
		browserName = "Firefox"
	} else if strings.Contains(uaLower, "opera/") || strings.Contains(uaLower, "opr/") {
		browserName = "Opera"
	} else {
		browserName = "Trình duyệt Web"
	}

	// Extract major version if possible
	re := regexp.MustCompile(`(edg|chrome|firefox|version)/(\d+)`)
	matches := re.FindStringSubmatch(uaLower)
	if len(matches) == 3 {
		label = browserName + " " + matches[2] + " trên " + osName
	} else {
		label = browserName + " trên " + osName
	}

	return detectedClientType, label
}

// IsPrivateIP checks if the IP address belongs to RFC 1918 private, loopback, or link-local networks.
func IsPrivateIP(ipStr string) bool {
	ip := net.ParseIP(ipStr)
	if ip == nil {
		return false
	}

	if ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified() {
		return true
	}

	// Check RFC 1918 IPv4
	if ipv4 := ip.To4(); ipv4 != nil {
		switch {
		case ipv4[0] == 10:
			return true
		case ipv4[0] == 172 && ipv4[1] >= 16 && ipv4[1] <= 31:
			return true
		case ipv4[0] == 192 && ipv4[1] == 168:
			return true
		default:
			return false
		}
	}

	// Check Unique Local IPv6 (fc00::/7)
	if len(ip) == net.IPv6len && (ip[0]&0xfe) == 0xfc {
		return true
	}

	return false
}

var (
	geoCacheMu sync.RWMutex
	geoCache   = make(map[string]cachedGeo)
)

type cachedGeo struct {
	city, country, region string
	lat, lng              *float64
	cachedAt              time.Time
}

// ResolveDetailedGeo determines country, city, region and coordinates based on IP.
func ResolveDetailedGeo(ipStr string) (city, country, region string, lat, lng *float64) {
	if ipStr == "" || ipStr == "127.0.0.1" || ipStr == "::1" || IsPrivateIP(ipStr) {
		return "Mạng nội bộ", "LAN", "Local", nil, nil
	}

	geoCacheMu.RLock()
	if c, ok := geoCache[ipStr]; ok && time.Since(c.cachedAt) < 24*time.Hour {
		geoCacheMu.RUnlock()
		return c.city, c.country, c.region, c.lat, c.lng
	}
	geoCacheMu.RUnlock()

	// Fast HTTP query with short 600ms timeout
	client := &http.Client{Timeout: 600 * time.Millisecond}
	resp, err := client.Get(fmt.Sprintf("http://ip-api.com/json/%s?fields=status,country,regionName,city,lat,lon", ipStr))
	if err == nil {
		defer resp.Body.Close()
		var res struct {
			Status     string  `json:"status"`
			Country    string  `json:"country"`
			RegionName string  `json:"regionName"`
			City       string  `json:"city"`
			Lat        float64 `json:"lat"`
			Lon        float64 `json:"lon"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&res); err == nil && res.Status == "success" {
			cLat := res.Lat
			cLng := res.Lon
			geoCacheMu.Lock()
			geoCache[ipStr] = cachedGeo{
				city:     res.City,
				country:  res.Country,
				region:   res.RegionName,
				lat:      &cLat,
				lng:      &cLng,
				cachedAt: time.Now(),
			}
			geoCacheMu.Unlock()
			return res.City, res.Country, res.RegionName, &cLat, &cLng
		}
	}

	// Fallback when offline or rate-limited
	return "Internet", "Việt Nam", "", nil, nil
}

// ResolveGeo determines country and city name based on IP.
func ResolveGeo(ipStr string) (city, country string) {
	c, count, _, _, _ := ResolveDetailedGeo(ipStr)
	return c, count
}
