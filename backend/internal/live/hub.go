package live

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"cctv/ent"
)

// Hub manages concurrent pure Go live streaming sessions across all cameras
type Hub struct {
	mu       sync.RWMutex
	sessions map[int]*Session
}

// GlobalHub is the singleton instance of the live streaming hub
var GlobalHub *Hub

func init() {
	GlobalHub = &Hub{
		sessions: make(map[int]*Session),
	}

	go GlobalHub.startReaper()
}

// EnsureSession returns an existing live session or spawns a new pure Go RTSP-to-HLS session
func (h *Hub) EnsureSession(ctx context.Context, cam *ent.Camera) (*Session, error) {
	h.mu.Lock()
	defer h.mu.Unlock()

	session, exists := h.sessions[cam.ID]
	if exists {
		session.LastAccessed = time.Now()
		return session, nil
	}

	sessionCtx, cancel := context.WithCancel(context.Background())
	var err error
	session, err = StartSession(sessionCtx, cam.ID, cam.Host, cam.RtspTransport)
	if err != nil {
		cancel()
		return nil, fmt.Errorf("failed to start pure Go live stream session: %w", err)
	}

	h.sessions[cam.ID] = session
	log.Printf("[Live Hub] Started pure Go in-memory RTSP live session for camera %d", cam.ID)

	return session, nil
}

// TouchSession updates the last access time for an active live stream
func (h *Hub) TouchSession(cameraID int) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	if s, ok := h.sessions[cameraID]; ok {
		s.LastAccessed = time.Now()
	}
}

// WaitForReady waits up to timeout for the first video packet to be processed by the muxer
func (s *Session) WaitForReady(timeout time.Duration) error {
	if s.IsReady {
		return nil
	}
	select {
	case <-s.ReadyChan:
		return nil
	case <-time.After(timeout):
		// Even if not closed immediately, HLS muxer can handle requests gracefully
		return nil
	}
}

// startReaper periodically reaps idle live streaming sessions
func (h *Hub) startReaper() {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		h.mu.Lock()
		now := time.Now()
		for id, session := range h.sessions {
			// If no viewer has polled the stream in the last 30 seconds, shut down the RTSP connection & muxer
			if now.Sub(session.LastAccessed) > 30*time.Second {
				log.Printf("[Live Hub] Camera %d idle timeout reached (30s). Closing pure Go live stream.", id)
				session.Cancel()
				delete(h.sessions, id)
			}
		}
		h.mu.Unlock()
	}
}
