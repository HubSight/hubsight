package camera

import (
	"cctv/internal/device"
)

var (
	ListCamerasHandler  = device.ListDevicesHandler
	AddCameraHandler    = device.AddDeviceHandler
	DeleteCameraHandler = device.DeleteDeviceHandler
	UpdateCameraHandler = device.UpdateDeviceHandler
)
