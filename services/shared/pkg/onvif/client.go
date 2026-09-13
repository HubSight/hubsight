package onvif

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Client coordinates SOAP communications with an ONVIF-compliant IP camera.
type Client struct {
	DeviceHost   string
	DevicePort   int
	Username     string
	Password     string
	ClockOffset  time.Duration
	Capabilities Capabilities
	httpClient   *http.Client
}

// NewClient initializes a new ONVIF client targeting a specific IP and port.
func NewClient(host string, port int, username, password string) *Client {
	if port <= 0 {
		port = 80
	}
	// Clean host (strip scheme or trailing slashes if passed)
	cleanHost := host
	if strings.HasPrefix(cleanHost, "http://") {
		cleanHost = strings.TrimPrefix(cleanHost, "http://")
	} else if strings.HasPrefix(cleanHost, "https://") {
		cleanHost = strings.TrimPrefix(cleanHost, "https://")
	}
	if i := strings.Index(cleanHost, "/"); i >= 0 {
		cleanHost = cleanHost[:i]
	}
	if i := strings.Index(cleanHost, ":"); i >= 0 {
		cleanHost = cleanHost[:i]
	}

	return &Client{
		DeviceHost: cleanHost,
		DevicePort: port,
		Username:   username,
		Password:   password,
		Capabilities: Capabilities{
			DeviceURL: fmt.Sprintf("http://%s:%d/onvif/device_service", cleanHost, port),
		},
		httpClient: &http.Client{
			Timeout: 8 * time.Second,
		},
	}
}

// DeviceServiceURL returns the initial device management endpoint.
func (c *Client) DeviceServiceURL() string {
	if c.Capabilities.DeviceURL != "" {
		return c.Capabilities.DeviceURL
	}
	return fmt.Sprintf("http://%s:%d/onvif/device_service", c.DeviceHost, c.DevicePort)
}

// SendSOAP sends a SOAP request with WS-Security UsernameToken authentication.
func (c *Client) SendSOAP(ctx context.Context, endpoint, action, bodyContent string) ([]byte, error) {
	if endpoint == "" {
		endpoint = c.DeviceServiceURL()
	}

	// Normalise endpoint host to actual device host if camera returned an internal or loopback IP
	endpoint = c.normalizeEndpoint(endpoint)

	headerXML := GenerateSecurityHeader(c.Username, c.Password, c.ClockOffset)

	envelope := fmt.Sprintf(`<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
            xmlns:tds="http://www.onvif.org/ver10/device/wsdl"
            xmlns:trt="http://www.onvif.org/ver10/media/wsdl"
            xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl"
            xmlns:tt="http://www.onvif.org/ver10/schema">
  %s
  <s:Body>
    %s
  </s:Body>
</s:Envelope>`, headerXML, bodyContent)

	// Try SOAP 1.2 first
	respBody, status, err := c.postEnvelope(ctx, endpoint, "application/soap+xml; charset=utf-8; action=\""+action+"\"", []byte(envelope))
	if err != nil {
		return nil, err
	}

	// If camera returned 415 Unsupported Media Type, fall back to SOAP 1.1 format
	if status == http.StatusUnsupportedMediaType || (status == http.StatusBadRequest && strings.Contains(string(respBody), "SOAP")) {
		envelope11 := fmt.Sprintf(`<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"
            xmlns:tds="http://www.onvif.org/ver10/device/wsdl"
            xmlns:trt="http://www.onvif.org/ver10/media/wsdl"
            xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl"
            xmlns:tt="http://www.onvif.org/ver10/schema">
  %s
  <s:Body>
    %s
  </s:Body>
</s:Envelope>`, headerXML, bodyContent)

		respBody11, status11, err11 := c.postEnvelope(ctx, endpoint, "text/xml; charset=utf-8", []byte(envelope11), action)
		if err11 == nil && status11 < 400 {
			return respBody11, nil
		}
	}

	if status >= 400 {
		return nil, fmt.Errorf("ONVIF HTTP %d error from %s: %s", status, endpoint, string(respBody))
	}

	return respBody, nil
}

func (c *Client) postEnvelope(ctx context.Context, endpoint, contentType string, body []byte, soapAction ...string) ([]byte, int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, 0, fmt.Errorf("failed creating ONVIF request: %w", err)
	}

	req.Header.Set("Content-Type", contentType)
	if len(soapAction) > 0 && soapAction[0] != "" {
		req.Header.Set("SOAPAction", soapAction[0])
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("failed executing ONVIF request to %s: %w", endpoint, err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, fmt.Errorf("failed reading ONVIF response body: %w", err)
	}

	return respBytes, resp.StatusCode, nil
}

// normalizeEndpoint ensures URLs returned by the camera target the actual reachable IP/port.
func (c *Client) normalizeEndpoint(rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil {
		return rawURL
	}
	// If returned URL has a localhost/loopback or different hostname, rewrite to targeted DeviceHost
	if u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1" || (u.Hostname() != c.DeviceHost && !strings.Contains(u.Hostname(), ".")) {
		u.Host = fmt.Sprintf("%s:%d", c.DeviceHost, c.DevicePort)
	} else if u.Port() == "" && c.DevicePort != 80 {
		u.Host = fmt.Sprintf("%s:%d", u.Hostname(), c.DevicePort)
	}
	return u.String()
}
