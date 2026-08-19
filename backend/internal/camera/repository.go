package camera

import (
	"cctv/internal/device"
)

type CameraInput = device.DeviceInput

var (
	GetAll = device.GetAll
	Create = device.Create
	Update = device.Update
	Delete = device.Delete
)
