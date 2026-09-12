package webrtc

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// ZLMClient talks to ZLMediaKit's REST API — the RTSP<->WebRTC media server
// backing every camera stream in this codebase. All streams live under one
// fixed app ("live") on the default vhost; the
// `stream` name is the same flat identifier the rest of this codebase already
// constructs (cam_{id}_thumb, cam_{id}_cv, cam_{id}_nvr, cam_{id}_live_{N}).
type ZLMClient struct {
	BaseURL    string
	Secret     string
	App        string
	httpClient *http.Client
}

const zlmApp = "live"
const zlmVhost = "__defaultVhost__"

func NewZLMClient() *ZLMClient {
	baseURL := os.Getenv("WEBRTC_SERVICE_URL")
	if baseURL == "" {
		baseURL = "http://webrtc-service:80"
	}
	secret := os.Getenv("ZLM_SECRET")
	if secret == "" {
		secret = "hubsight-zlm-internal-secret"
	}
	return &ZLMClient{
		BaseURL: baseURL,
		Secret:  secret,
		App:     zlmApp,
		httpClient: &http.Client{
			// addFFmpegSource (thumb/cv purposes) blocks synchronously on ZLM's
			// side for up to its own timeout_ms (15s, see RegisterStream) while
			// it waits for the spawned ffmpeg to confirm the pull — this client
			// timeout must stay comfortably above that or every slow-but-working
			// source looks identical to a genuinely dead one ("context deadline
			// exceeded" either way). Verified needed: a real camera timed out
			// here at the old 10s value during migration testing.
			Timeout: 20 * time.Second,
		},
	}
}

// cleanRTSPURL strips a legacy `#key=val` source-string suffix (an escape
// hatch some camera Host values may still carry, e.g. `#transport=udp`) —
// ZLMediaKit's `url`/`src_url` params expect a plain RTSP URL, that syntax
// has no meaning here.
func cleanRTSPURL(rtspURL string) string {
	if i := strings.Index(rtspURL, "#"); i >= 0 {
		return rtspURL[:i]
	}
	return rtspURL
}

type zlmDataKey struct {
	Code int    `json:"code"`
	Msg  string `json:"msg"`
	Data struct {
		Key string `json:"key"`
	} `json:"data"`
}

func (c *ZLMClient) doForm(ctx context.Context, path string, form url.Values) (*zlmDataKey, error) {
	form.Set("secret", c.Secret)
	reqURL := fmt.Sprintf("%s%s", c.BaseURL, path)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, reqURL, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, fmt.Errorf("failed to create request for %s: %w", path, err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to reach ZLMediaKit (%s): %w", path, err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read ZLMediaKit response (%s): %w", path, err)
	}
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("ZLMediaKit returned HTTP %d for %s: %s", resp.StatusCode, path, string(body))
	}

	var parsed zlmDataKey
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, fmt.Errorf("failed to parse ZLMediaKit response (%s): %w (%s)", path, err, string(body))
	}
	if parsed.Code != 0 {
		return nil, fmt.Errorf("ZLMediaKit rejected %s: %s", path, parsed.Msg)
	}
	return &parsed, nil
}

// RegisterStream registers (or re-registers) a stream in ZLMediaKit and
// returns the opaque proxy key callers must keep and pass back to
// UnregisterStream — ZLMediaKit's delete APIs are keyed by this value, not
// by stream name.
func (c *ZLMClient) RegisterStream(ctx context.Context, streamName, rtspURL string, purpose string) (string, error) {
	src := cleanRTSPURL(rtspURL)

	var parsed *zlmDataKey
	var err error
	switch purpose {
	case "thumb":
		// Dashboard-thumbnail profile: 640p/15fps H264, via the `cmd_thumb`
		// ffmpeg template in config.ini.
		parsed, err = c.doForm(ctx, "/index/api/addFFmpegSource", url.Values{
			"src_url":        {src},
			"dst_url":        {fmt.Sprintf("rtmp://127.0.0.1/%s/%s", c.App, streamName)},
			"ffmpeg_cmd_key": {"ffmpeg.cmd_thumb"},
			"timeout_ms":     {"15000"},
		})
	case "cv":
		// Vision-AI profile: 10fps H264, via the `cmd_cv` ffmpeg template.
		// (no raw-passthrough failover source alongside the transcode — vision's
		// own stream_manager.py already falls back to the raw camera RTSP URL
		// directly if this derived stream is unreachable, so redundancy is
		// preserved at the consumer layer instead.)
		parsed, err = c.doForm(ctx, "/index/api/addFFmpegSource", url.Values{
			"src_url":        {src},
			"dst_url":        {fmt.Sprintf("rtmp://127.0.0.1/%s/%s", c.App, streamName)},
			"ffmpeg_cmd_key": {"ffmpeg.cmd_cv"},
			"timeout_ms":     {"15000"},
		})
	default:
		// Live/NVR profile: pure RTSP passthrough (0% CPU, minimal latency).
		parsed, err = c.doForm(ctx, "/index/api/addStreamProxy", url.Values{
			"vhost":       {zlmVhost},
			"app":         {c.App},
			"stream":      {streamName},
			"url":         {src},
			"retry_count": {"-1"},
			// Best-effort TCP preference for reliability through Docker/NAT
			// (UDP RTP has historically not routed back through Docker/OrbStack
			// NAT reliably on this stack). ZLMediaKit's addStreamProxy
			// forwards unrecognized args through to the underlying RTSP
			// player's option map, where this is understood if present;
			// verified end-to-end functional without it in local testing, so
			// treat as a hardening knob, not a hard requirement — watch for
			// black-video-over-UDP symptoms in real deployment.
			"rtp_type": {"0"},
		})
	}
	if err != nil {
		return "", err
	}

	log.Printf("[ZLMediaKit] Stream registered: %s (purpose=%s, key=%s)", streamName, purpose, parsed.Data.Key)
	return parsed.Data.Key, nil
}

// UnregisterStream removes a previously registered stream by its proxy key.
// Falls back to a name-based close_stream if no key is available (e.g. state
// lost across a pool-service restart) — best-effort recovery path only.
func (c *ZLMClient) UnregisterStream(ctx context.Context, streamName, proxyKey string) error {
	if proxyKey != "" {
		form := url.Values{"key": {proxyKey}}
		if _, err := c.doForm(ctx, "/index/api/delStreamProxy", form); err != nil {
			// The key might belong to an addFFmpegSource registration instead
			// of addStreamProxy (thumb/cv) — ZLMediaKit uses a separate
			// delete endpoint for those, keyed the same way.
			if _, err2 := c.doForm(ctx, "/index/api/delFFmpegSource", form); err2 != nil {
				log.Printf("[ZLMediaKit] Failed to unregister %s by key (proxy: %v, ffmpeg: %v) — falling back to close_stream", streamName, err, err2)
			} else {
				log.Printf("[ZLMediaKit] Stream unregistered (ffmpeg source): %s", streamName)
				return nil
			}
		} else {
			log.Printf("[ZLMediaKit] Stream unregistered (proxy): %s", streamName)
			return nil
		}
	}

	form := url.Values{"schema": {"rtsp"}, "vhost": {zlmVhost}, "app": {c.App}, "stream": {streamName}, "force": {"1"}}
	if _, err := c.doForm(ctx, "/index/api/close_stream", form); err != nil {
		return fmt.Errorf("failed to unregister stream from ZLMediaKit (%s): %w", streamName, err)
	}
	log.Printf("[ZLMediaKit] Stream force-closed (no key on record): %s", streamName)
	return nil
}

type zlmWebRTCResponse struct {
	Code int    `json:"code"`
	Msg  string `json:"msg"`
	Type string `json:"type"`
	SDP  string `json:"sdp"`
}

// ForwardWebRTCOffer forwards a client SDP offer to ZLMediaKit and returns
// the raw SDP answer bytes — preserves the exact same (raw-SDP-in,
// raw-SDP-out) contract every caller downstream (live/handler.go, the
// frontend SDK) already expects: this function alone absorbs ZLMediaKit's
// JSON-wrapped response shape.
func (c *ZLMClient) ForwardWebRTCOffer(ctx context.Context, streamName string, offerSDP []byte, contentType string) ([]byte, int, error) {
	signalingURL := fmt.Sprintf("%s/index/api/webrtc?app=%s&stream=%s&type=play",
		c.BaseURL, url.QueryEscape(c.App), url.QueryEscape(streamName))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, signalingURL, bytes.NewReader(offerSDP))
	if err != nil {
		return nil, http.StatusInternalServerError, fmt.Errorf("failed to create signaling request: %w", err)
	}
	// ZLMediaKit's webrtc endpoint expects the raw SDP offer as plain text,
	// regardless of what Content-Type the browser's fetch() sent upstream.
	req.Header.Set("Content-Type", "text/plain;charset=utf-8")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, http.StatusBadGateway, fmt.Errorf("failed to reach ZLMediaKit signaling server: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, http.StatusInternalServerError, fmt.Errorf("failed to read ZLMediaKit signaling response: %w", err)
	}
	if resp.StatusCode >= 300 {
		return respBody, resp.StatusCode, nil
	}

	var parsed zlmWebRTCResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return nil, http.StatusInternalServerError, fmt.Errorf("failed to parse ZLMediaKit signaling response: %w (%s)", err, string(respBody))
	}
	if parsed.Code != 0 || parsed.SDP == "" {
		return nil, http.StatusBadGateway, fmt.Errorf("ZLMediaKit signaling failed: %s", parsed.Msg)
	}
	return []byte(parsed.SDP), http.StatusOK, nil
}
