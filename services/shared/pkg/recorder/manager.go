package recorder

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"cctv/shared/pkg/database"
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
	log.Println("Starting event-based CCTV Recorder Manager...")

	// Initial sync and periodic DB sync
	m.reconcile(ctx)
	ticker := time.NewTicker(30 * time.Second)
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
	cameras, err := database.Client.Camera.Query().All(parentCtx)
	if err != nil {
		log.Printf("Failed to fetch cameras: %v", err)
		return
	}

	globalSettings, err := database.Client.Setting.Query().Only(parentCtx)
	if err != nil {
		globalSettings = nil
	}

	isNvrEnabled := true
	if globalSettings != nil {
		isNvrEnabled = globalSettings.NvrStatus
	}

	currentCameraIDs := make(map[string]bool)

	for _, cam := range cameras {
		if !isNvrEnabled || !cam.IsActive {
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
			log.Printf("Registered active camera for event-based NVR: %s (ID: %s)", cam.Name, cam.ID)
			m.activeRecorders[cam.ID] = ActiveRecorder{
				Config: camConfig,
			}
		}
	}

	for id := range m.activeRecorders {
		if !currentCameraIDs[id] {
			log.Printf("Camera %s is no longer active. Removing from NVR pool...", id)
			delete(m.activeRecorders, id)
		}
	}
}

func (m *RecorderManager) stopAll() {
	// Not strictly needed since we don't have long running ffmpeg processes anymore,
	// but kept for interface consistency.
}

func (m *RecorderManager) listenForEvents(ctx context.Context) {
	log.Println("[NVR] Connecting to MQ for event-based recording...")
	if err := mq.Init(); err != nil {
		log.Printf("[NVR] Failed to connect to MQ: %v", err)
	}

	// Wait a moment for MQ to establish
	time.Sleep(2 * time.Second)

	msgs, err := mq.Consume("nvr_recorder_queue")
	if err != nil {
		log.Printf("[NVR] Failed to consume MQ: %v", err)
		return
	}

	for {
		select {
		case <-ctx.Done():
			return
		case d, ok := <-msgs:
			if !ok {
				return
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

			if msg.Pattern == "notification.new" && msg.Data.CameraID != "" {
				m.handleEventTrigger(ctx, msg.Data.CameraID)
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
