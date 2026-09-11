package camera

import (
	"cctv/shared/pkg/device"
)

var (
	ListCamerasHandler       = device.ListDevicesHandler
	AddCameraHandler         = device.AddDeviceHandler
	DeleteCameraHandler      = device.DeleteDeviceHandler
	UpdateCameraHandler      = UpdateCameraHandlerAlias
	GetCameraSnapshotHandler = device.GetCameraSnapshotHandler
)

var UpdateCameraHandlerAlias = device.UpdateDeviceHandler
