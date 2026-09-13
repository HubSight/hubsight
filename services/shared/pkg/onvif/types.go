package onvif

import "time"

// DeviceInfo contains hardware and firmware details returned by GetDeviceInformation.
type DeviceInfo struct {
	Manufacturer    string `json:"manufacturer"`
	Model           string `json:"model"`
	FirmwareVersion string `json:"firmware_version"`
	SerialNumber    string `json:"serial_number"`
	HardwareID      string `json:"hardware_id"`
}

// Capabilities holds service endpoint URLs supported by the ONVIF device.
type Capabilities struct {
	DeviceURL string `json:"device_url"`
	MediaURL  string `json:"media_url"`
	PTZURL    string `json:"ptz_url"`
	EventsURL string `json:"events_url"`
}

// MediaProfile represents an ONVIF media profile (video/audio configuration).
type MediaProfile struct {
	Token      string `json:"token"`
	Name       string `json:"name"`
	VideoCodec string `json:"video_codec"`
	Width      int    `json:"width"`
	Height     int    `json:"height"`
	FPS        int    `json:"fps"`
	StreamURI  string `json:"stream_uri,omitempty"`
}

// ProbeResult contains comprehensive discovery details for an ONVIF camera.
type ProbeResult struct {
	Success       bool           `json:"success"`
	Host          string         `json:"host"`
	Port          int            `json:"port"`
	DeviceInfo    DeviceInfo     `json:"device_info"`
	HasPTZ        bool           `json:"has_ptz"`
	Profiles      []MediaProfile `json:"profiles"`
	MainStreamURI string         `json:"main_stream_uri"`
	SubStreamURI  string         `json:"sub_stream_uri"`
	ErrorMessage  string         `json:"error_message,omitempty"`
}

// PTZVector specifies velocity or translation coordinates for PTZ movement.
type PTZVector struct {
	Pan  float64 `json:"pan"`  // -1.0 (Left) to +1.0 (Right)
	Tilt float64 `json:"tilt"` // -1.0 (Down) to +1.0 (Up)
	Zoom float64 `json:"zoom"` // -1.0 (Zoom Out) to +1.0 (Zoom In)
}

// Preset represents a saved physical PTZ position.
type Preset struct {
	Token string `json:"token"`
	Name  string `json:"name"`
}

// PTZStatus reflects current physical coordinates and movement state.
type PTZStatus struct {
	PanPosition  float64   `json:"pan_position"`
	TiltPosition float64   `json:"tilt_position"`
	ZoomPosition float64   `json:"zoom_position"`
	IsMoving     bool      `json:"is_moving"`
	Timestamp    time.Time `json:"timestamp"`
}
