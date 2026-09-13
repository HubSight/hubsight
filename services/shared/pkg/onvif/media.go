package onvif

import (
	"context"
	"encoding/xml"
	"fmt"
	"net/url"
	"strings"
)

type getProfilesResponse struct {
	XMLName xml.Name `xml:"Envelope"`
	Body    struct {
		GetProfilesResponse struct {
			Profiles []struct {
				Token                    string `xml:"token,attr"`
				Name                     string `xml:"Name"`
				VideoEncoderConfiguration struct {
					Encoding   string `xml:"Encoding"`
					Resolution struct {
						Width  int `xml:"Width"`
						Height int `xml:"Height"`
					} `xml:"Resolution"`
					RateControl struct {
						FrameRateLimit int `xml:"FrameRateLimit"`
					} `xml:"RateControl"`
				} `xml:"VideoEncoderConfiguration"`
			} `xml:"Profiles"`
		} `xml:"GetProfilesResponse"`
	} `xml:"Body"`
}

// GetProfiles fetches all configured video/media profiles from the camera.
func (c *Client) GetProfiles(ctx context.Context) ([]MediaProfile, error) {
	if c.Capabilities.MediaURL == "" {
		if _, err := c.GetCapabilities(ctx); err != nil {
			return nil, err
		}
	}

	soapBody := `<trt:GetProfiles/>`
	respBytes, err := c.SendSOAP(ctx, c.Capabilities.MediaURL, "http://www.onvif.org/ver10/media/wsdl/GetProfiles", soapBody)
	if err != nil {
		return nil, fmt.Errorf("GetProfiles failed: %w", err)
	}

	var resp getProfilesResponse
	if err := xml.Unmarshal(respBytes, &resp); err != nil {
		return nil, fmt.Errorf("failed unmarshaling GetProfiles response: %w", err)
	}

	rawProfiles := resp.Body.GetProfilesResponse.Profiles
	profiles := make([]MediaProfile, 0, len(rawProfiles))
	for _, p := range rawProfiles {
		profiles = append(profiles, MediaProfile{
			Token:      p.Token,
			Name:       p.Name,
			VideoCodec: p.VideoEncoderConfiguration.Encoding,
			Width:      p.VideoEncoderConfiguration.Resolution.Width,
			Height:     p.VideoEncoderConfiguration.Resolution.Height,
			FPS:        p.VideoEncoderConfiguration.RateControl.FrameRateLimit,
		})
	}

	return profiles, nil
}

type getStreamUriResponse struct {
	XMLName xml.Name `xml:"Envelope"`
	Body    struct {
		GetStreamUriResponse struct {
			MediaUri struct {
				Uri                 string `xml:"Uri"`
				InvalidAfterConnect bool   `xml:"InvalidAfterConnect"`
				InvalidAfterReboot  bool   `xml:"InvalidAfterReboot"`
				Timeout             string `xml:"Timeout"`
			} `xml:"MediaUri"`
		} `xml:"GetStreamUriResponse"`
	} `xml:"Body"`
}

// GetStreamUri resolves the real RTSP streaming URI for a given media profile token.
func (c *Client) GetStreamUri(ctx context.Context, profileToken string) (string, error) {
	if c.Capabilities.MediaURL == "" {
		if _, err := c.GetCapabilities(ctx); err != nil {
			return "", err
		}
	}

	soapBody := fmt.Sprintf(`<trt:GetStreamUri>
  <trt:StreamSetup>
    <tt:Stream>RTP-Unicast</tt:Stream>
    <tt:Transport>
      <tt:Protocol>RTSP</tt:Protocol>
    </tt:Transport>
  </trt:StreamSetup>
  <trt:ProfileToken>%s</trt:ProfileToken>
</trt:GetStreamUri>`, profileToken)

	respBytes, err := c.SendSOAP(ctx, c.Capabilities.MediaURL, "http://www.onvif.org/ver10/media/wsdl/GetStreamUri", soapBody)
	if err != nil {
		return "", fmt.Errorf("GetStreamUri failed for profile %s: %w", profileToken, err)
	}

	var resp getStreamUriResponse
	if err := xml.Unmarshal(respBytes, &resp); err != nil {
		return "", fmt.Errorf("failed unmarshaling GetStreamUri response: %w", err)
	}

	rawURI := strings.TrimSpace(resp.Body.GetStreamUriResponse.MediaUri.Uri)
	if rawURI == "" {
		return "", fmt.Errorf("camera returned empty RTSP stream URI for profile %s", profileToken)
	}

	return c.normalizeRTSPURI(rawURI), nil
}

// normalizeRTSPURI fixes common camera RTSP quirks (loopback IPs, missing credentials).
func (c *Client) normalizeRTSPURI(rawURI string) string {
	u, err := url.Parse(rawURI)
	if err != nil {
		return rawURI
	}

	// 1. Correct hostname if camera returned localhost or 127.0.0.1
	if u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1" || (u.Hostname() != c.DeviceHost && !strings.Contains(u.Hostname(), ".")) {
		port := u.Port()
		if port != "" {
			u.Host = fmt.Sprintf("%s:%s", c.DeviceHost, port)
		} else {
			u.Host = fmt.Sprintf("%s:554", c.DeviceHost)
		}
	}

	// 2. Inject credentials if camera didn't embed them and we have credentials
	if u.User == nil && c.Username != "" {
		if c.Password != "" {
			u.User = url.UserPassword(c.Username, c.Password)
		} else {
			u.User = url.User(c.Username)
		}
	}

	return u.String()
}
