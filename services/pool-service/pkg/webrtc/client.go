package webrtc

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

type Go2RTCClient struct {
	BaseURL    string
	httpClient *http.Client
}

func NewGo2RTCClient() *Go2RTCClient {
	baseURL := os.Getenv("WEBRTC_SERVICE_URL")
	if baseURL == "" {
		baseURL = os.Getenv("GO2RTC_URL")
		if baseURL == "" {
			baseURL = "http://webrtc-service:1984"
		}
	}
	return &Go2RTCClient{
		BaseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// RegisterStream registers or updates dual-source profiles (direct RTSP + FFmpeg Opus) in go2rtc
func (c *Go2RTCClient) RegisterStream(ctx context.Context, streamName, rtspURL string, purpose string) error {
	srcDirect := rtspURL
	if !strings.Contains(srcDirect, "#") {
		srcDirect = fmt.Sprintf("%s#backchannel=0#transport=tcp", srcDirect)
	} else if !strings.Contains(srcDirect, "transport=") {
		srcDirect = fmt.Sprintf("%s#transport=tcp", srcDirect)
	}

	var srcFfmpeg string
	if purpose == "cv" {
		// Transcode once from the already-pulled RTSP producer (no second camera socket).
		// Keep source resolution (only drop to 10 FPS). 640p shrinks faces too much for ArcFace.
		// Pull the camera URL, not the stream name — self-ffmpeg on a not-yet-open producer fails with "unknown error".
		srcFfmpeg = fmt.Sprintf("ffmpeg:%s#video=h264#framerate=10#audio=none", rtspURL)
	} else {
		// Audio-only producer. go2rtc mixes this Opus with H264 from the RTSP source.
		// Do NOT set #video=copy here — that would send video through ffmpeg's muxer (~1s+ delay).
		srcFfmpeg = fmt.Sprintf("ffmpeg:%s#audio=opus", streamName)
	}

	putURL := fmt.Sprintf("%s/api/streams?name=%s&src=%s&src=%s",
		c.BaseURL,
		url.QueryEscape(streamName),
		url.QueryEscape(srcDirect),
		url.QueryEscape(srcFfmpeg),
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodPut, putURL, nil)
	if err != nil {
		return fmt.Errorf("failed to create PUT stream request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to register stream in go2rtc (%s): %w", streamName, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("go2rtc returned HTTP %d for %s: %s", resp.StatusCode, streamName, string(body))
	}

	log.Printf("[Go2RTC] Stream successfully registered in media router: %s", streamName)
	return nil
}

// UnregisterStream removes a stream from go2rtc, terminating its underlying RTSP socket
func (c *Go2RTCClient) UnregisterStream(ctx context.Context, streamName string) error {
	delURL := fmt.Sprintf("%s/api/streams?name=%s", c.BaseURL, url.QueryEscape(streamName))
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, delURL, nil)
	if err != nil {
		return fmt.Errorf("failed to create DELETE stream request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to unregister stream from go2rtc (%s): %w", streamName, err)
	}
	defer resp.Body.Close()

	log.Printf("[Go2RTC] Stream unregistered & socket terminated: %s", streamName)
	return nil
}

// ForwardWebRTCOffer forwards a client SDP offer to go2rtc and returns the SDP answer
func (c *Go2RTCClient) ForwardWebRTCOffer(ctx context.Context, streamName string, offerSDP []byte, contentType string) ([]byte, int, error) {
	signalingURL := fmt.Sprintf("%s/api/webrtc?src=%s", c.BaseURL, url.QueryEscape(streamName))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, signalingURL, bytes.NewReader(offerSDP))
	if err != nil {
		return nil, http.StatusInternalServerError, fmt.Errorf("failed to create signaling request: %w", err)
	}

	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	} else {
		req.Header.Set("Content-Type", "application/sdp")
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, http.StatusBadGateway, fmt.Errorf("failed to reach go2rtc signaling server: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, http.StatusInternalServerError, fmt.Errorf("failed to read go2rtc answer SDP: %w", err)
	}

	return respBody, resp.StatusCode, nil
}
