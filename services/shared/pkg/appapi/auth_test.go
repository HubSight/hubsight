package appapi

import (
	"testing"

	"cctv/shared/pkg/fingerprint"
)

func TestBuildAppDeviceInfo_LegacyFieldsAndLocation(t *testing.T) {
	latitude := 10.7769
	longitude := 106.7009
	accuracy := 25.0

	info := buildAppDeviceInfo(nil, "iPhone 15 Pro", "mobile_ios", "device-123", &latitude, &longitude, &accuracy)

	if info.Fingerprint != "device-123" {
		t.Errorf("expected legacy device_id to become fingerprint, got %q", info.Fingerprint)
	}
	if info.DeviceLabel != "iPhone 15 Pro" {
		t.Errorf("expected legacy device_name to become device label, got %q", info.DeviceLabel)
	}
	if info.ClientType != "mobile_ios" {
		t.Errorf("expected mobile_ios client type, got %q", info.ClientType)
	}
	if info.Latitude == nil || *info.Latitude != latitude || info.Longitude == nil || *info.Longitude != longitude {
		t.Errorf("expected legacy location fields to be preserved, got (%v, %v)", info.Latitude, info.Longitude)
	}
}

func TestBuildAppDeviceInfo_NestedFieldsTakePrecedence(t *testing.T) {
	nestedLatitude := 21.0278
	nestedLongitude := 105.8342
	legacyLatitude := 10.7769
	legacyLongitude := 106.7009

	info := buildAppDeviceInfo(
		&fingerprint.ClientDeviceInfo{
			DeviceLabel: "Native device",
			ClientType:  "mobile_android",
			Latitude:    &nestedLatitude,
			Longitude:   &nestedLongitude,
		},
		"Legacy device",
		"mobile_ios",
		"legacy-id",
		&legacyLatitude,
		&legacyLongitude,
		nil,
	)

	if info.DeviceLabel != "Native device" || info.ClientType != "mobile_android" {
		t.Errorf("expected nested device metadata to win, got label=%q type=%q", info.DeviceLabel, info.ClientType)
	}
	if info.Latitude == nil || *info.Latitude != nestedLatitude || info.Longitude == nil || *info.Longitude != nestedLongitude {
		t.Errorf("expected nested coordinates to win, got (%v, %v)", info.Latitude, info.Longitude)
	}
}
