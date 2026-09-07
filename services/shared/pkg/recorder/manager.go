package recorder

import (
	"context"
	"encoding/json"
	"log"
	"strings"
	"time"

	"cctv/shared/pkg/database"
	"cctv/shared/pkg/models"
	"cctv/shared/pkg/mq"
)

// RecorderManager coordinates dynamic recording processes across multiple cameras
type RecorderManager struct {
	OutDir          string
	activeRecorders map[string]ActiveRecorder
}

// NewManager creates a new RecorderManager instance
func NewManager(outDir string) *RecorderManager {
	return &RecorderManager{
		OutDir:          outDir,
		activeRecorders: make(map[string]ActiveRecorder),
	}
}

// Start begins the reconciliation loop and the MQ event listener for event-based recording
func (m *RecorderManager) Start(ctx context.Context) {
	log.Println("Starting event-based CCTV Recorder Manager with Zero-CPU Buffering...")

	// Initial sync and periodic DB sync
	m.reconcile(ctx)
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	// Start MQ Listener for event-based recording
	go m.listenForEvents(ctx)

	for {
		select {
		case <-ctx.Done():
			log.Println("Stopping Recorder Manager...")
			m.stopAll()
			return
		case <-ticker.C:
			m.reconcile(ctx)
		}
	}
}

func (m *RecorderManager) reconcile(parentCtx context.Context) {
	var cameras []models.Camera
	if err := database.DB.WithContext(parentCtx).Find(&cameras).Error; err != nil {
		log.Printf("Failed to fetch cameras: %v", err)
		return
	}

	var globalSettings models.Setting
	hasSettings := database.DB.WithContext(parentCtx).First(&globalSettings).Error == nil

	isNvrEnabled := true
	if hasSettings {
		isNvrEnabled = globalSettings.NvrStatus
	}

	currentCameraIDs := make(map[string]bool)

	for _, cam := range cameras {
		// Event-based NVR buffering and capture is STRICTLY enabled ONLY if AI is enabled for this camera
		if !isNvrEnabled || !cam.IsActive || cam.IsStopped || !cam.EnableAi {
			continue
		}
		currentCameraIDs[cam.ID] = true

		camConfig := CameraConfig{
			CameraID:        cam.ID,
			Name:            cam.Name,
			Host:            cam.Host,
			RTSPTransport:   cam.RtspTransport,
			SegmentDuration: cam.SegmentDuration,
			VideoCodec:      cam.VideoCodec,
			AudioMode:       cam.AudioMode,
			ExtraArgs:       cam.ExtraArgs,
			OutDir:          m.OutDir,
		}

		activeCam, exists := m.activeRecorders[cam.ID]
		if exists && activeCam.Config != camConfig {
			log.Printf("Camera %s (ID: %s) configuration updated.", cam.Name, cam.ID)
			activeCam.Config = camConfig
			m.activeRecorders[cam.ID] = activeCam
		}

		if !exists {
			log.Printf("Registered active camera for Zero-CPU NVR Buffering: %s (ID: %s)", cam.Name, cam.ID)

			// Start Continuous Buffer
			camCtx, cancel := context.WithCancel(parentCtx)
			go func(cID string) {
				if err := StartContinuousBuffer(camCtx, cID); err != nil {
					log.Printf("Continuous buffer exited for cam %s: %v", cID, err)
				}
			}(cam.ID)

			m.activeRecorders[cam.ID] = ActiveRecorder{
				Config: camConfig,
				Cancel: cancel,
			}
		}
	}

	for id, active := range m.activeRecorders {
		if !currentCameraIDs[id] {
			log.Printf("Camera %s is no longer active / AI disabled. Stopping continuous buffer...", id)
			if active.Cancel != nil {
				active.Cancel()
			}
			delete(m.activeRecorders, id)
		}
	}
}

func (m *RecorderManager) stopAll() {
	for _, active := range m.activeRecorders {
		if active.Cancel != nil {
			active.Cancel()
		}
	}
}

func (m *RecorderManager) listenForEvents(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		log.Println("[NVR] Connecting to MQ for event-based recording...")
		msgs, err := mq.Consume("nvr_recorder_queue")
		if err != nil {
			log.Printf("[NVR] Failed to consume MQ: %v (retrying in 5s)...", err)
			select {
			case <-ctx.Done():
				return
			case <-time.After(5 * time.Second):
				continue
			}
		}

		log.Println("[NVR] Successfully connected to MQ for event-based recording")
		keepListening := true
		for keepListening {
			select {
			case <-ctx.Done():
				return
			case d, ok := <-msgs:
				if !ok {
					log.Println("[NVR] MQ consumer channel closed, reconnecting in 5s...")
					select {
					case <-ctx.Done():
						return
					case <-time.After(5 * time.Second):
					}
					keepListening = false
					break
				}
				var msg struct {
					Pattern string `json:"pattern"`
					Data    struct {
						CameraID string `json:"camera_id"`
					} `json:"data"`
				}
				if err := json.Unmarshal(d.Body, &msg); err != nil {
					continue
				}

				if strings.HasPrefix(msg.Pattern, "camera.") {
					log.Printf("[NVR] Camera settings changed (%s), reconciling active recorders immediately...", msg.Pattern)
					m.reconcile(ctx)
				} else if msg.Pattern == "notification.new" && msg.Data.CameraID != "" {
					m.handleEventTrigger(ctx, msg.Data.CameraID)
				}
			}
		}
	}
}

func (m *RecorderManager) handleEventTrigger(ctx context.Context, camID string) {
	// Look up config
	cam, exists := m.activeRecorders[camID]
	if !exists {
		return
	}

	// Basic deduplication: avoid spawning multiple ffmpegs for the same camera concurrently
	// In a real system, you'd use a mutex and a state tracker per camera
	// For simplicity, we just fire and forget a goroutine if it's an event
	go func(cfg CameraConfig) {
		log.Printf("[NVR] Event detected for cam %s, starting 30s capture...", cfg.CameraID)
		if err := RunEventFFmpegProcess(ctx, cfg); err != nil {
			log.Printf("[NVR] Event capture failed for cam %s: %v", cfg.CameraID, err)
		} else {
			log.Printf("[NVR] Event capture completed for cam %s", cfg.CameraID)
		}
	}(cam.Config)
}
