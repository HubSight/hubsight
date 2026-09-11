package appapi

import (
	"fmt"
	"net/http"
	"sync"

	"cctv/shared/pkg/database"
	"cctv/shared/pkg/device"
	"cctv/shared/pkg/live"
	"cctv/shared/pkg/models"
	"cctv/shared/pkg/pb"
	"cctv/shared/pkg/pool"

	"github.com/gin-gonic/gin"
)

type CameraDTO struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Host         string `json:"host"`
	IsActive     bool   `json:"is_active"`
	IsStopped    bool   `json:"is_stopped"`
	EnableAI     bool   `json:"enable_ai"`
	ThumbnailURL string `json:"thumbnail_url"`
	StreamName   string `json:"stream_name"`
}

func toCameraDTO(cam models.Camera) CameraDTO {
	thumbURL := ""
	streamName := ""
	if cam.IsActive && !cam.IsStopped {
		thumbURL = fmt.Sprintf("/api/app/v1/cameras/%s/thumbnail", cam.ID)
		streamName = fmt.Sprintf("cam_%s_thumb", cam.ID)
	}
	return CameraDTO{
		ID:           cam.ID,
		Name:         cam.Name,
		Host:         cam.Host,
		IsActive:     cam.IsActive,
		IsStopped:    cam.IsStopped,
		EnableAI:     cam.EnableAi,
		ThumbnailURL: thumbURL,
		StreamName:   streamName,
	}
}

type BatchWebRTCItem struct {
	CameraID string `json:"camera_id" binding:"required"`
	SdpOffer string `json:"sdp_offer" binding:"required"`
}

type BatchWebRTCRequest struct {
	Streams []BatchWebRTCItem `json:"streams" binding:"required"`
}

type BatchWebRTCResultItem struct {
	CameraID       string `json:"camera_id"`
	SdpAnswer      string `json:"sdp_answer,omitempty"`
	PoolStreamName string `json:"pool_stream_name,omitempty"`
	PoolConnIndex  string `json:"pool_conn_index,omitempty"`
	Error          string `json:"error,omitempty"`
}

type BatchHeartbeatItem struct {
	CameraID   string `json:"camera_id" binding:"required"`
	StreamName string `json:"stream_name" binding:"required"`
}

type BatchHeartbeatRequest struct {
	Leases []BatchHeartbeatItem `json:"leases" binding:"required"`
}

// ListCamerasHandler lists all active surveillance cameras for the app.
func ListCamerasHandler(c *gin.Context) {
	var cameras []models.Camera
	err := database.DB.WithContext(c.Request.Context()).
		Order("created_at ASC").
		Find(&cameras).Error

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"status":  "error",
			"message": "Không thể lấy danh sách camera: " + err.Error(),
		})
		return
	}

	dtos := make([]CameraDTO, 0, len(cameras))
	for _, cam := range cameras {
		dtos = append(dtos, toCameraDTO(cam))
	}

	c.JSON(http.StatusOK, gin.H{
		"status":  "ok",
		"cameras": dtos,
	})
}

// GetCameraHandler retrieves detailed configuration for a specific camera.
func GetCameraHandler(c *gin.Context) {
	id := c.Param("id")
	var cam models.Camera
	if err := database.DB.WithContext(c.Request.Context()).Where("id = ?", id).First(&cam).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"status":  "error",
			"message": "Camera không tồn tại.",
		})
		return
	}

	c.JSON(http.StatusOK, toCameraDTO(cam))
}

// LiveWebRTCHandler proxies WebRTC SDP negotiation for 1 camera.
func LiveWebRTCHandler(c *gin.Context) {
	live.WebRTCHandler(c)
}

// LiveHeartbeatHandler keeps a single camera stream lease active.
func LiveHeartbeatHandler(c *gin.Context) {
	live.PoolHeartbeatHandler(c)
}

// LiveReleaseHandler releases a single camera stream lease when viewer exits.
func LiveReleaseHandler(c *gin.Context) {
	live.PoolReleaseHandler(c)
}

// BatchLiveWebRTCHandler negotiates multiple WebRTC SDP streams concurrently for Multi-View.
func BatchLiveWebRTCHandler(c *gin.Context) {
	var req BatchWebRTCRequest
	if err := c.ShouldBindJSON(&req); err != nil || len(req.Streams) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"status":  "error",
			"code":    "INVALID_INPUT",
			"message": "Danh sách streams không hợp lệ.",
		})
		return
	}

	results := make([]BatchWebRTCResultItem, len(req.Streams))
	var wg sync.WaitGroup
	grpcPool := pool.GetGrpcClient()

	for i, item := range req.Streams {
		wg.Add(1)
		go func(idx int, target BatchWebRTCItem) {
			defer wg.Done()

			resItem := BatchWebRTCResultItem{CameraID: target.CameraID}

			// Validate camera existence and status
			var cam models.Camera
			if err := database.DB.WithContext(c.Request.Context()).Where("id = ?", target.CameraID).First(&cam).Error; err != nil {
				resItem.Error = "Camera not found"
				results[idx] = resItem
				return
			}
			if !cam.IsActive || cam.IsStopped {
				resItem.Error = "Camera is currently stopped"
				results[idx] = resItem
				return
			}

			// Signal through pool-service via gRPC
			resp, err := grpcPool.SignalWebRTC(c.Request.Context(), &pb.SignalWebRTCRequest{
				CameraId:    target.CameraID,
				SdpOffer:    target.SdpOffer,
				ContentType: "application/sdp",
			})

			if err != nil {
				resItem.Error = err.Error()
			} else {
				resItem.SdpAnswer = resp.SdpAnswer
				resItem.PoolStreamName = resp.PoolStreamName
				resItem.PoolConnIndex = resp.PoolConnIndex
			}

			results[idx] = resItem
		}(i, item)
	}

	wg.Wait()

	c.JSON(http.StatusOK, gin.H{
		"status":  "ok",
		"streams": results,
	})
}

// BatchLiveHeartbeatHandler refreshes leases for multiple active cameras in 1 HTTP ping.
func BatchLiveHeartbeatHandler(c *gin.Context) {
	var req BatchHeartbeatRequest
	if err := c.ShouldBindJSON(&req); err != nil || len(req.Leases) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"status":  "error",
			"code":    "INVALID_INPUT",
			"message": "Danh sách leases không hợp lệ.",
		})
		return
	}

	grpcPool := pool.GetGrpcClient()
	renewed := 0

	for _, lease := range req.Leases {
		if lease.CameraID == "" || lease.StreamName == "" {
			continue
		}
		_, err := grpcPool.HeartbeatStream(c.Request.Context(), &pb.HeartbeatStreamRequest{
			CameraId:   lease.CameraID,
			StreamName: lease.StreamName,
		})
		if err == nil {
			renewed++
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"status":  "ok",
		"renewed": renewed,
	})
}

// BatchLiveReleaseHandler terminates multiple stream leases simultaneously when exiting Multi-View.
func BatchLiveReleaseHandler(c *gin.Context) {
	var req BatchHeartbeatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"status":  "error",
			"message": "Danh sách leases không hợp lệ.",
		})
		return
	}

	grpcPool := pool.GetGrpcClient()
	released := 0

	for _, lease := range req.Leases {
		if lease.CameraID == "" || lease.StreamName == "" {
			continue
		}
		_, err := grpcPool.ReleaseStream(c.Request.Context(), &pb.ReleaseStreamRequest{
			CameraId:   lease.CameraID,
			StreamName: lease.StreamName,
		})
		if err == nil {
			released++
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"status":   "ok",
		"released": released,
	})
}

// GetCameraSnapshotHandler retrieves a real-time thumbnail snapshot for mobile/desktop apps.
var GetCameraSnapshotHandler = device.GetCameraSnapshotHandler
