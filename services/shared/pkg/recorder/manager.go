package recorder

import (
	"context"
	"log"
	"time"

	"cctv/shared/pkg/database"
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

// Start begins the continuous reconciliation loop to start, restart, and stop camera recorders
func (m *RecorderManager) Start(ctx context.Context) {
	log.Println("Starting dynamic CCTV Recorder Manager...")

	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	// Initial sync
	m.reconcile(ctx)

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
		// Assume enabled if setting is missing
		globalSettings = nil
	}

	isNvrEnabled := true
	if globalSettings != nil {
		isNvrEnabled = globalSettings.NvrStatus
	}

	currentCameraIDs := make(map[string]bool)

	for _, cam := range cameras {
		// If NVR is globally disabled, treat all cameras as inactive
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
		needsRestart := false

		// Check if any configuration parameter has changed
		if exists && (activeCam.Config != camConfig) {
			log.Printf("Camera %s (ID: %s) configuration changed. Restarting FFmpeg...", cam.Name, cam.ID)
			activeCam.Cancel()
			needsRestart = true
		}

		if !exists || needsRestart {
			if !exists {
				log.Printf("Found new active camera: %s (ID: %s). Starting FFmpeg...", cam.Name, cam.ID)
			}

			camCtx, cancel := context.WithCancel(parentCtx)
			m.activeRecorders[cam.ID] = ActiveRecorder{
				Config: camConfig,
				Cancel: cancel,
			}

			go m.runCameraLoop(camCtx, camConfig)
		}
	}

	// Terminate recorders for cameras that are deleted or deactivated
	for id, activeCam := range m.activeRecorders {
		if !currentCameraIDs[id] {
			log.Printf("Camera %s is no longer active. Stopping recorder...", id)
			activeCam.Cancel()
			delete(m.activeRecorders, id)
		}
	}
}

func (m *RecorderManager) runCameraLoop(ctx context.Context, cfg CameraConfig) {
	for {
		select {
		case <-ctx.Done():
			log.Printf("Camera %s recorder stopped.", cfg.CameraID)
			return
		default:
			err := RunFFmpegProcess(ctx, cfg)
			if err != nil && ctx.Err() == nil {
				log.Printf("Camera %s FFmpeg exited with error: %v. Restarting in 5s...", cfg.CameraID, err)
				time.Sleep(5 * time.Second)
			} else if ctx.Err() != nil {
				log.Printf("Camera %s recorder stopped.", cfg.CameraID)
				return
			} else {
				log.Printf("Camera %s FFmpeg exited cleanly. Restarting in 5s...", cfg.CameraID)
				time.Sleep(5 * time.Second)
			}
		}
	}
}

func (m *RecorderManager) stopAll() {
	for id, activeCam := range m.activeRecorders {
		activeCam.Cancel()
		delete(m.activeRecorders, id)
	}
}
