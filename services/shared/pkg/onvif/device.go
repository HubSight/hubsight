package onvif

import (
	"context"
	"encoding/xml"
	"fmt"
	"strings"
	"time"
)

type systemDateAndTimeResponse struct {
	XMLName xml.Name `xml:"Envelope"`
	Body    struct {
		GetSystemDateAndTimeResponse struct {
			SystemDateAndTime struct {
				UTCDateTime struct {
					Time struct {
						Hour   int `xml:"Hour"`
						Minute int `xml:"Minute"`
						Second int `xml:"Second"`
					} `xml:"Time"`
					Date struct {
						Year  int `xml:"Year"`
						Month int `xml:"Month"`
						Day   int `xml:"Day"`
					} `xml:"Date"`
				} `xml:"UTCDateTime"`
			} `xml:"SystemDateAndTime"`
		} `xml:"GetSystemDateAndTimeResponse"`
	} `xml:"Body"`
}

// SyncClockOffset calls GetSystemDateAndTime without auth to measure and record clock offset.
func (c *Client) SyncClockOffset(ctx context.Context) error {
	soapBody := `<tds:GetSystemDateAndTime/>`
	// Call with empty auth header initially
	headerXML := "<s:Header/>"
	envelope := fmt.Sprintf(`<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
            xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
  %s
  <s:Body>%s</s:Body>
</s:Envelope>`, headerXML, soapBody)

	respBytes, status, err := c.postEnvelope(ctx, c.DeviceServiceURL(), "application/soap+xml; charset=utf-8; action=\"http://www.onvif.org/ver10/device/wsdl/GetSystemDateAndTime\"", []byte(envelope))
	if err != nil || status >= 400 {
		// If fails, clock offset stays 0
		return nil
	}

	var resp systemDateAndTimeResponse
	if err := xml.Unmarshal(respBytes, &resp); err != nil {
		return nil
	}

	dt := resp.Body.GetSystemDateAndTimeResponse.SystemDateAndTime.UTCDateTime
	if dt.Date.Year > 2000 {
		camTime := time.Date(dt.Date.Year, time.Month(dt.Date.Month), dt.Date.Day,
			dt.Time.Hour, dt.Time.Minute, dt.Time.Second, 0, time.UTC)
		c.ClockOffset = camTime.Sub(time.Now().UTC())
	}
	return nil
}

type getCapabilitiesResponse struct {
	XMLName xml.Name `xml:"Envelope"`
	Body    struct {
		GetCapabilitiesResponse struct {
			Capabilities struct {
				Device struct {
					XAddr string `xml:"XAddr"`
				} `xml:"Device"`
				Media struct {
					XAddr string `xml:"XAddr"`
				} `xml:"Media"`
				PTZ struct {
					XAddr string `xml:"XAddr"`
				} `xml:"PTZ"`
				Events struct {
					XAddr string `xml:"XAddr"`
				} `xml:"Events"`
			} `xml:"Capabilities"`
		} `xml:"GetCapabilitiesResponse"`
	} `xml:"Body"`
}

// GetCapabilities retrieves service endpoints (Media, PTZ, Events) from the camera.
func (c *Client) GetCapabilities(ctx context.Context) (*Capabilities, error) {
	soapBody := `<tds:GetCapabilities><tds:Category>All</tds:Category></tds:GetCapabilities>`
	respBytes, err := c.SendSOAP(ctx, c.DeviceServiceURL(), "http://www.onvif.org/ver10/device/wsdl/GetCapabilities", soapBody)
	if err != nil {
		return nil, fmt.Errorf("GetCapabilities failed: %w", err)
	}

	var resp getCapabilitiesResponse
	if err := xml.Unmarshal(respBytes, &resp); err != nil {
		return nil, fmt.Errorf("failed unmarshaling GetCapabilities response: %w", err)
	}

	caps := resp.Body.GetCapabilitiesResponse.Capabilities
	if caps.Media.XAddr != "" {
		c.Capabilities.MediaURL = c.normalizeEndpoint(caps.Media.XAddr)
	} else {
		// Fallback standard Media service path
		c.Capabilities.MediaURL = fmt.Sprintf("http://%s:%d/onvif/Media", c.DeviceHost, c.DevicePort)
	}

	if caps.PTZ.XAddr != "" {
		c.Capabilities.PTZURL = c.normalizeEndpoint(caps.PTZ.XAddr)
	}
	if caps.Events.XAddr != "" {
		c.Capabilities.EventsURL = c.normalizeEndpoint(caps.Events.XAddr)
	}

	return &c.Capabilities, nil
}

type getDeviceInfoResponse struct {
	XMLName xml.Name `xml:"Envelope"`
	Body    struct {
		GetDeviceInformationResponse struct {
			Manufacturer    string `xml:"Manufacturer"`
			Model           string `xml:"Model"`
			FirmwareVersion string `xml:"FirmwareVersion"`
			SerialNumber    string `xml:"SerialNumber"`
			HardwareId      string `xml:"HardwareId"`
		} `xml:"GetDeviceInformationResponse"`
	} `xml:"Body"`
}

// GetDeviceInformation queries the hardware/firmware metadata of the camera.
func (c *Client) GetDeviceInformation(ctx context.Context) (*DeviceInfo, error) {
	soapBody := `<tds:GetDeviceInformation/>`
	respBytes, err := c.SendSOAP(ctx, c.DeviceServiceURL(), "http://www.onvif.org/ver10/device/wsdl/GetDeviceInformation", soapBody)
	if err != nil {
		return nil, fmt.Errorf("GetDeviceInformation failed: %w", err)
	}

	var resp getDeviceInfoResponse
	if err := xml.Unmarshal(respBytes, &resp); err != nil {
		return nil, fmt.Errorf("failed unmarshaling GetDeviceInformation response: %w", err)
	}

	info := resp.Body.GetDeviceInformationResponse
	return &DeviceInfo{
		Manufacturer:    strings.TrimSpace(info.Manufacturer),
		Model:           strings.TrimSpace(info.Model),
		FirmwareVersion: strings.TrimSpace(info.FirmwareVersion),
		SerialNumber:    strings.TrimSpace(info.SerialNumber),
		HardwareID:      strings.TrimSpace(info.HardwareId),
	}, nil
}
