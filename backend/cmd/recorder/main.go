package main

import (
	"context"
	"log"
	"time"
	"os"

	"cctv/internal/config"
	"cctv/internal/database"
	"cctv/internal/recorder"
	"cctv/internal/storage"
)

func main() {
	cfg := config.Load()

	if err := database.Connect(cfg.DatabaseURL); err != nil {
		log.Fatalf("Database connection failed: %v", err)
	}
	defer database.Close()

	if err := storage.ConnectS3(cfg.S3Endpoint, cfg.S3AccessKey, cfg.S3SecretKey, cfg.S3Bucket, cfg.S3UseSSL); err != nil {
		log.Fatalf("S3 connection failed: %v", err)
	}

	outDir := "/data/camera"
	if envOut := os.Getenv("OUT_DIR"); envOut != "" {
		outDir = envOut
	}

	log.Println("Starting dynamic Recorder service...")

	type ActiveCamera struct {
		Config recorder.CameraConfig
		Cancel context.CancelFunc
	}
	activeRecorders := make(map[int]ActiveCamera)

	for {
		cameras, err := database.Client.Camera.Query().All(context.Background())
		if err != nil {
			log.Printf("Failed to fetch cameras: %v", err)
			time.Sleep(10 * time.Second)
			continue
		}

		currentCameraIDs := make(map[int]bool)
		for _, cam := range cameras {
			if !cam.IsActive {
				continue
			}
			currentCameraIDs[cam.ID] = true

			camConfig := recorder.CameraConfig{
				CameraID:        cam.ID,
				Host:            cam.Host,
				RTSPTransport:   cam.RtspTransport,
				SegmentDuration: cam.SegmentDuration,
				VideoCodec:      cam.VideoCodec,
				AudioMode:       cam.AudioMode,
				ExtraArgs:       cam.ExtraArgs,
				OutDir:          outDir,
			}
			
			activeCam, exists := activeRecorders[cam.ID]
			needsRestart := false

			if exists && (activeCam.Config != camConfig) {
				log.Printf("Camera %s (ID: %d) configuration changed. Restarting FFmpeg...", cam.Name, cam.ID)
				activeCam.Cancel()
				needsRestart = true
			}
			
			// Start recording if not already active or needs restart
			if !exists || needsRestart {
				if !exists {
					log.Printf("Found new active camera: %s (ID: %d). Starting FFmpeg...", cam.Name, cam.ID)
				}
				
				ctx, cancel := context.WithCancel(context.Background())
				activeRecorders[cam.ID] = ActiveCamera{
					Config: camConfig,
					Cancel: cancel,
				}
				
				go func(c recorder.CameraConfig) {
					// Loop to restart ffmpeg if it crashes while still active
					for {
						select {
						case <-ctx.Done():
							log.Printf("Camera %d recorder stopped.", c.CameraID)
							return
						default:
							err := recorder.StartRecording(ctx, c)
							if err != nil && ctx.Err() == nil {
								log.Printf("FFmpeg for camera %d exited with error: %v, restarting in 5s...", c.CameraID, err)
								time.Sleep(5 * time.Second)
							} else if ctx.Err() != nil {
								// Context was cancelled
								log.Printf("Camera %d recorder stopped.", c.CameraID)
								return
							} else {
								// Exited cleanly but unexpectedly?
								log.Printf("FFmpeg for camera %d exited cleanly. Restarting in 5s...", c.CameraID)
								time.Sleep(5 * time.Second)
							}
						}
					}
				}(camConfig)
			}
		}

		// Stop recordings for cameras that were deleted or disabled
		for id, activeCam := range activeRecorders {
			if !currentCameraIDs[id] {
				log.Printf("Camera %d is no longer active. Stopping recorder...", id)
				activeCam.Cancel()
				delete(activeRecorders, id)
			}
		}

		time.Sleep(10 * time.Second)
	}
}
