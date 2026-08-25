package live

import (
	"sync"
	"time"
)

// viewerTracker tracks active live-stream viewers per camera using
// a heartbeat mechanism. This is a live-viewership counter only
// (NVR monitor fallback). It MUST NOT gate vision-service, recognition
// logs, or Web Push — those run 24/7 for every enable_ai camera.
//
// Each viewer is identified by a session-local UUID generated on the
// client side. A viewer is considered active as long as it sends a
// heartbeat within the staleness window (heartbeatTTL).
//
// The tracker is intentionally in-memory: if the backend restarts,
// viewers simply re-register on the next heartbeat ping.
type viewerTracker struct {
	mu           sync.RWMutex
	cameras      map[string]map[string]time.Time // camID -> viewerID -> lastSeen
	heartbeatTTL time.Duration
}

var Tracker = &viewerTracker{
	cameras:      make(map[string]map[string]time.Time),
	heartbeatTTL: 25 * time.Second, // must exceed frontend ping interval (15s)
}

// RegisterViewer marks a viewer as active for the given camera.
// Returns true if this is the first viewer (camera was idle before).
func (t *viewerTracker) RegisterViewer(camID, viewerID string) bool {
	t.mu.Lock()
	defer t.mu.Unlock()

	if _, ok := t.cameras[camID]; !ok {
		t.cameras[camID] = make(map[string]time.Time)
	}
	wasEmpty := len(t.cameras[camID]) == 0
	t.cameras[camID][viewerID] = time.Now()
	return wasEmpty
}

// UnregisterViewer marks a viewer as gone.
// Returns true if this was the last viewer (camera is now idle).
func (t *viewerTracker) UnregisterViewer(camID, viewerID string) bool {
	t.mu.Lock()
	defer t.mu.Unlock()

	if viewers, ok := t.cameras[camID]; ok {
		delete(viewers, viewerID)
		if len(viewers) == 0 {
			delete(t.cameras, camID)
			return true
		}
	}
	return false
}

// ActiveCameraIDs returns the set of camera IDs that currently have at least
// one active (non-stale) viewer. Stale viewers are pruned in the same pass.
func (t *viewerTracker) ActiveCameraIDs() []string {
	t.mu.Lock()
	defer t.mu.Unlock()

	cutoff := time.Now().Add(-t.heartbeatTTL)
	var active []string

	for camID, viewers := range t.cameras {
		for viewerID, lastSeen := range viewers {
			if lastSeen.Before(cutoff) {
				delete(viewers, viewerID)
			}
		}
		if len(viewers) == 0 {
			delete(t.cameras, camID)
		} else {
			active = append(active, camID)
		}
	}
	return active
}

// StartCleanup launches a background goroutine that periodically prunes
// stale viewers. This ensures resources are reclaimed even if a client
// disconnects without sending an explicit stop heartbeat.
func (t *viewerTracker) StartCleanup() {
	go func() {
		ticker := time.NewTicker(20 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			_ = t.ActiveCameraIDs() // prune is a side-effect of ActiveCameraIDs
		}
	}()
}
