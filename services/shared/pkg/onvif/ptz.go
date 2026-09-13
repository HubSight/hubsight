package onvif

import (
	"context"
	"encoding/xml"
	"fmt"
	"strings"
)

// EnsurePTZEndpoint verifies or discovers the PTZ service endpoint.
func (c *Client) EnsurePTZEndpoint(ctx context.Context) error {
	if c.Capabilities.PTZURL != "" {
		return nil
	}
	caps, err := c.GetCapabilities(ctx)
	if err != nil {
		return err
	}
	if caps.PTZURL == "" {
		return fmt.Errorf("camera at %s does not support ONVIF PTZ service", c.DeviceHost)
	}
	return nil
}

// ContinuousMove starts continuous camera motion in the specified direction/speed.
func (c *Client) ContinuousMove(ctx context.Context, profileToken string, v PTZVector) error {
	if err := c.EnsurePTZEndpoint(ctx); err != nil {
		return err
	}

	soapBody := fmt.Sprintf(`<tptz:ContinuousMove>
  <tptz:ProfileToken>%s</tptz:ProfileToken>
  <tptz:Velocity>
    <tt:PanTilt x="%.2f" y="%.2f" space="http://www.onvif.org/ver10/tptz/PanTiltSpaces/VelocityGenericSpace"/>
    <tt:Zoom x="%.2f" space="http://www.onvif.org/ver10/tptz/ZoomSpaces/VelocityGenericSpace"/>
  </tptz:Velocity>
</tptz:ContinuousMove>`, profileToken, v.Pan, v.Tilt, v.Zoom)

	_, err := c.SendSOAP(ctx, c.Capabilities.PTZURL, "http://www.onvif.org/ver20/ptz/wsdl/ContinuousMove", soapBody)
	if err != nil {
		return fmt.Errorf("ContinuousMove failed: %w", err)
	}
	return nil
}

// RelativeMove moves the camera by a relative distance offset.
func (c *Client) RelativeMove(ctx context.Context, profileToken string, v PTZVector) error {
	if err := c.EnsurePTZEndpoint(ctx); err != nil {
		return err
	}

	soapBody := fmt.Sprintf(`<tptz:RelativeMove>
  <tptz:ProfileToken>%s</tptz:ProfileToken>
  <tptz:Translation>
    <tt:PanTilt x="%.2f" y="%.2f"/>
    <tt:Zoom x="%.2f"/>
  </tptz:Translation>
</tptz:RelativeMove>`, profileToken, v.Pan, v.Tilt, v.Zoom)

	_, err := c.SendSOAP(ctx, c.Capabilities.PTZURL, "http://www.onvif.org/ver20/ptz/wsdl/RelativeMove", soapBody)
	if err != nil {
		return fmt.Errorf("RelativeMove failed: %w", err)
	}
	return nil
}

// Stop halts all active Pan/Tilt and Zoom movements immediately.
func (c *Client) Stop(ctx context.Context, profileToken string) error {
	if err := c.EnsurePTZEndpoint(ctx); err != nil {
		return err
	}

	soapBody := fmt.Sprintf(`<tptz:Stop>
  <tptz:ProfileToken>%s</tptz:ProfileToken>
  <tptz:PanTilt>true</tptz:PanTilt>
  <tptz:Zoom>true</tptz:Zoom>
</tptz:Stop>`, profileToken)

	_, err := c.SendSOAP(ctx, c.Capabilities.PTZURL, "http://www.onvif.org/ver20/ptz/wsdl/Stop", soapBody)
	if err != nil {
		return fmt.Errorf("Stop failed: %w", err)
	}
	return nil
}

type getPresetsResponse struct {
	XMLName xml.Name `xml:"Envelope"`
	Body    struct {
		GetPresetsResponse struct {
			Preset []struct {
				Token string `xml:"token,attr"`
				Name  string `xml:"Name"`
			} `xml:"Preset"`
		} `xml:"GetPresetsResponse"`
	} `xml:"Body"`
}

// GetPresets returns the list of saved positions on the PTZ camera.
func (c *Client) GetPresets(ctx context.Context, profileToken string) ([]Preset, error) {
	if err := c.EnsurePTZEndpoint(ctx); err != nil {
		return nil, err
	}

	soapBody := fmt.Sprintf(`<tptz:GetPresets>
  <tptz:ProfileToken>%s</tptz:ProfileToken>
</tptz:GetPresets>`, profileToken)

	respBytes, err := c.SendSOAP(ctx, c.Capabilities.PTZURL, "http://www.onvif.org/ver20/ptz/wsdl/GetPresets", soapBody)
	if err != nil {
		return nil, fmt.Errorf("GetPresets failed: %w", err)
	}

	var resp getPresetsResponse
	if err := xml.Unmarshal(respBytes, &resp); err != nil {
		return nil, fmt.Errorf("failed unmarshaling GetPresets response: %w", err)
	}

	rawPresets := resp.Body.GetPresetsResponse.Preset
	presets := make([]Preset, 0, len(rawPresets))
	for _, p := range rawPresets {
		presets = append(presets, Preset{
			Token: p.Token,
			Name:  strings.TrimSpace(p.Name),
		})
	}
	return presets, nil
}

// GotoPreset directs the camera to a previously stored preset position.
func (c *Client) GotoPreset(ctx context.Context, profileToken, presetToken string) error {
	if err := c.EnsurePTZEndpoint(ctx); err != nil {
		return err
	}

	soapBody := fmt.Sprintf(`<tptz:GotoPreset>
  <tptz:ProfileToken>%s</tptz:ProfileToken>
  <tptz:PresetToken>%s</tptz:PresetToken>
</tptz:GotoPreset>`, profileToken, presetToken)

	_, err := c.SendSOAP(ctx, c.Capabilities.PTZURL, "http://www.onvif.org/ver20/ptz/wsdl/GotoPreset", soapBody)
	if err != nil {
		return fmt.Errorf("GotoPreset failed for token %s: %w", presetToken, err)
	}
	return nil
}

type setPresetResponse struct {
	XMLName xml.Name `xml:"Envelope"`
	Body    struct {
		SetPresetResponse struct {
			PresetToken string `xml:"PresetToken"`
		} `xml:"SetPresetResponse"`
	} `xml:"Body"`
}

// SetPreset stores the current physical camera position as a preset.
func (c *Client) SetPreset(ctx context.Context, profileToken, presetName string) (string, error) {
	if err := c.EnsurePTZEndpoint(ctx); err != nil {
		return "", err
	}

	soapBody := fmt.Sprintf(`<tptz:SetPreset>
  <tptz:ProfileToken>%s</tptz:ProfileToken>
  <tptz:PresetName>%s</tptz:PresetName>
</tptz:SetPreset>`, profileToken, presetName)

	respBytes, err := c.SendSOAP(ctx, c.Capabilities.PTZURL, "http://www.onvif.org/ver20/ptz/wsdl/SetPreset", soapBody)
	if err != nil {
		return "", fmt.Errorf("SetPreset failed: %w", err)
	}

	var resp setPresetResponse
	if err := xml.Unmarshal(respBytes, &resp); err != nil {
		return "", fmt.Errorf("failed unmarshaling SetPreset response: %w", err)
	}

	return resp.Body.SetPresetResponse.PresetToken, nil
}

// RemovePreset deletes a saved preset position from camera memory.
func (c *Client) RemovePreset(ctx context.Context, profileToken, presetToken string) error {
	if err := c.EnsurePTZEndpoint(ctx); err != nil {
		return err
	}

	soapBody := fmt.Sprintf(`<tptz:RemovePreset>
  <tptz:ProfileToken>%s</tptz:ProfileToken>
  <tptz:PresetToken>%s</tptz:PresetToken>
</tptz:RemovePreset>`, profileToken, presetToken)

	_, err := c.SendSOAP(ctx, c.Capabilities.PTZURL, "http://www.onvif.org/ver20/ptz/wsdl/RemovePreset", soapBody)
	if err != nil {
		return fmt.Errorf("RemovePreset failed for token %s: %w", presetToken, err)
	}
	return nil
}
