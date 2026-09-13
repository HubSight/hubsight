package onvif

import (
	"context"
	"fmt"
)

// ProbeCamera performs an end-to-end ONVIF handshake:
// 1. Syncs clock offset with GetSystemDateAndTime.
// 2. Queries hardware metadata via GetDeviceInformation.
// 3. Inspects services (Media, PTZ) via GetCapabilities.
// 4. Extracts media profiles and auto-resolves RTSP stream URIs via GetStreamUri.
func ProbeCamera(ctx context.Context, host string, port int, username, password string) (*ProbeResult, error) {
	client := NewClient(host, port, username, password)

	// Step 1: Clock synchronization
	_ = client.SyncClockOffset(ctx)

	// Step 2: Query device metadata
	info, err := client.GetDeviceInformation(ctx)
	if err != nil {
		return &ProbeResult{
			Success:      false,
			Host:         client.DeviceHost,
			Port:         client.DevicePort,
			ErrorMessage: fmt.Sprintf("failed to get device information: %v", err),
		}, err
	}

	// Step 3: Query capabilities (PTZ, Media)
	caps, err := client.GetCapabilities(ctx)
	if err != nil {
		return &ProbeResult{
			Success:      false,
			Host:         client.DeviceHost,
			Port:         client.DevicePort,
			DeviceInfo:   *info,
			ErrorMessage: fmt.Sprintf("failed to get capabilities: %v", err),
		}, err
	}

	// Step 4: Query Media Profiles and extract RTSP URIs
	profiles, err := client.GetProfiles(ctx)
	if err != nil {
		return &ProbeResult{
			Success:      false,
			Host:         client.DeviceHost,
			Port:         client.DevicePort,
			DeviceInfo:   *info,
			HasPTZ:       caps.PTZURL != "",
			ErrorMessage: fmt.Sprintf("failed to get media profiles: %v", err),
		}, err
	}

	var mainURI, subURI string
	for i := range profiles {
		uri, err := client.GetStreamUri(ctx, profiles[i].Token)
		if err == nil {
			profiles[i].StreamURI = uri
			if i == 0 {
				mainURI = uri
			} else if i == 1 {
				subURI = uri
			}
		}
	}

	// If only 1 profile exists, subURI can match mainURI or be empty
	if subURI == "" && len(profiles) > 0 {
		subURI = mainURI
	}

	return &ProbeResult{
		Success:       true,
		Host:          client.DeviceHost,
		Port:          client.DevicePort,
		DeviceInfo:    *info,
		HasPTZ:        caps.PTZURL != "",
		Profiles:      profiles,
		MainStreamURI: mainURI,
		SubStreamURI:  subURI,
	}, nil
}
