package pool

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"cctv/pool-service/pkg/webrtc"
)

type Manager struct {
	go2rtc       *webrtc.Go2RTCClient
	pools        map[string]*CameraPool
	poolsMu      sync.RWMutex
	IsNVREnabled bool
}

func NewManager(go2rtcClient *webrtc.Go2RTCClient) *Manager {
	return &Manager{
		go2rtc:       go2rtcClient,
		pools:        make(map[string]*CameraPool),
		IsNVREnabled: true, // Default to true until event syncs it
	}
}

// UpsertCamera registers or updates a camera in the connection pool
func (m *Manager) UpsertCamera(ctx context.Context, camID, name, host string, isActive, enableAI bool) error {
	m.poolsMu.Lock()
	p, exists := m.pools[camID]
	if !exists {
		p = &CameraPool{
			CameraID:      camID,
			CameraName:    name,
			Host:          host,
			IsActive:      isActive,
			EnableAI:      enableAI,
			LivePool:      make(map[string]*StreamConnection),
			NextLiveIndex: 1, // Live index starts at 2
		}
		m.pools[camID] = p
	} else {
		p.mu.Lock()
		p.CameraName = name
		p.Host = host
		p.IsActive = isActive
		p.EnableAI = enableAI
		p.mu.Unlock()
	}
	m.poolsMu.Unlock()

	p.mu.Lock()
	defer p.mu.Unlock()

	if !isActive || !enableAI {
		// If camera is deactivated OR AI is disabled, terminate CV stream
		if p.CVConnection != nil {
			_ = m.go2rtc.UnregisterStream(ctx, p.CVConnection.StreamName)
			p.CVConnection = nil
			log.Printf("[Pool] Camera %s AI deactivated or inactive. CV Connection #0 terminated.", camID)
		}
	}

	if !isActive {
		// If camera is completely deactivated, terminate all live streams
		for name := range p.LivePool {
			_ = m.go2rtc.UnregisterStream(ctx, name)
		}
		p.LivePool = make(map[string]*StreamConnection)
		// Terminate NVR stream if exists
		if p.NVRConnection != nil {
			_ = m.go2rtc.UnregisterStream(ctx, p.NVRConnection.StreamName)
			p.NVRConnection = nil
		}
		log.Printf("[Pool] Camera %s deactivated. All pool connections terminated.", camID)
		return nil
	}

	if enableAI {
		// Ensure Connection #0 (CV Dedicated) is registered and active
		cvStreamName := fmt.Sprintf("cam_%s_cv", camID)
		if err := m.go2rtc.RegisterStream(ctx, cvStreamName, host, string(PurposeCV)); err != nil {
			log.Printf("[Pool] Warning: Failed to register Connection #0 (CV) for cam %s: %v", camID, err)
		} else {
			p.CVConnection = &StreamConnection{
				ID:          fmt.Sprintf("conn_%s_cv", camID),
				CameraID:    camID,
				Index:       0,
				Purpose:     PurposeCV,
				StreamName:  cvStreamName,
				SourceURL:   host,
				ActiveUsers: 1, // Always held by CV Engine
				MaxUsers:    1,
				CreatedAt:   time.Now(),
				LastUsedAt:  time.Now(),
				Status:      "active",
			}
			log.Printf("[Pool] Camera %s (%s): Connection #0 (CV Dedicated) READY -> %s", camID, name, cvStreamName)
		}
	}

	// Manage Connection #1 (NVR)
	if m.IsNVREnabled {
		nvrStreamName := fmt.Sprintf("cam_%s_nvr", camID)
		if err := m.go2rtc.RegisterStream(ctx, nvrStreamName, host, string(PurposeNVR)); err != nil {
			log.Printf("[Pool] Warning: Failed to register Connection #1 (NVR) for cam %s: %v", camID, err)
		} else {
			p.NVRConnection = &StreamConnection{
				ID:          fmt.Sprintf("conn_%s_nvr", camID),
				CameraID:    camID,
				Index:       1,
				Purpose:     PurposeNVR,
				StreamName:  nvrStreamName,
				SourceURL:   host,
				ActiveUsers: 1, // Always held by NVR logic context
				MaxUsers:    1,
				CreatedAt:   time.Now(),
				LastUsedAt:  time.Now(),
				Status:      "active",
			}
			log.Printf("[Pool] Camera %s (%s): Connection #1 (NVR) READY -> %s", camID, name, nvrStreamName)
		}
	} else {
		// NVR disabled globally, remove if exists
		if p.NVRConnection != nil {
			_ = m.go2rtc.UnregisterStream(ctx, p.NVRConnection.StreamName)
			p.NVRConnection = nil
			log.Printf("[Pool] Camera %s NVR Connection #1 terminated due to global setting.", camID)
		}
	}

	// If host changed, refresh all active live streams
	for streamName, conn := range p.LivePool {
		conn.SourceURL = host
		_ = m.go2rtc.RegisterStream(ctx, streamName, host, string(PurposeLive))
	}

	return nil
}

// GetCVStream returns the dedicated stream name for Computer Vision processing (Connection #0)
func (m *Manager) GetCVStream(camID string) (string, error) {
	m.poolsMu.RLock()
	p, exists := m.pools[camID]
	m.poolsMu.RUnlock()

	if !exists {
		return "", fmt.Errorf("camera %s not found in pool", camID)
	}

	p.mu.RLock()
	defer p.mu.RUnlock()

	if !p.IsActive || p.CVConnection == nil {
		return "", fmt.Errorf("camera %s is inactive or Connection #0 not available", camID)
	}

	return p.CVConnection.StreamName, nil
}

// AcquireLiveStream applies the allocation algorithm:
// 1. Re-use existing live connection if clients < 5
// 2. Otherwise create new connection (#2, #3...)
func (m *Manager) AcquireLiveStream(ctx context.Context, camID string) (*AcquireResult, error) {
	m.poolsMu.RLock()
	p, exists := m.pools[camID]
	m.poolsMu.RUnlock()

	if !exists {
		return nil, fmt.Errorf("camera %s not found in pool", camID)
	}

	p.mu.Lock()
	defer p.mu.Unlock()

	if !p.IsActive {
		return nil, fmt.Errorf("camera %s is inactive", camID)
	}

	// 1. Find an existing Live connection with < 5 clients
	var candidate *StreamConnection
	for _, conn := range p.LivePool {
		if conn.ActiveUsers < 5 {
			candidate = conn
			break
		}
	}

	if candidate != nil {
		candidate.ActiveUsers++
		candidate.LastUsedAt = time.Now()
		candidate.Status = "active"
		log.Printf("[Pool] RE-USING live stream %s for cam %s (Clients: %d/5)",
			candidate.StreamName, camID, candidate.ActiveUsers)

		return &AcquireResult{
			StreamName:  candidate.StreamName,
			IsNewStream: false,
			ActiveUsers: candidate.ActiveUsers,
			ConnIndex:   candidate.Index,
		}, nil
	}

	// 2. All existing live streams are full (5 clients). Spawn New Connection.
	p.NextLiveIndex++
	newIndex := p.NextLiveIndex // This will be 2, 3, 4... since initialized to 1
	newStreamName := fmt.Sprintf("cam_%s_live_%d", camID, newIndex)

	if err := m.go2rtc.RegisterStream(ctx, newStreamName, p.Host, string(PurposeLive)); err != nil {
		p.NextLiveIndex-- // Rollback
		return nil, fmt.Errorf("failed to register new live stream in media router: %w", err)
	}

	newConn := &StreamConnection{
		ID:          fmt.Sprintf("conn_%s_live_%d", camID, newIndex),
		CameraID:    camID,
		Index:       newIndex,
		Purpose:     PurposeLive,
		StreamName:  newStreamName,
		SourceURL:   p.Host,
		ActiveUsers: 1,
		MaxUsers:    5,
		CreatedAt:   time.Now(),
		LastUsedAt:  time.Now(),
		Status:      "active",
	}
	p.LivePool[newStreamName] = newConn

	log.Printf("[Pool] CREATED new live stream connection #%d (%s) for cam %s (Clients: 1/5)",
		newIndex, newStreamName, camID)

	return &AcquireResult{
		StreamName:  newStreamName,
		IsNewStream: true,
		ActiveUsers: 1,
		ConnIndex:   newIndex,
	}, nil
}

// ReleaseLiveStream decrements the viewer count on a live stream
func (m *Manager) ReleaseLiveStream(camID, streamName string) {
	m.poolsMu.RLock()
	p, exists := m.pools[camID]
	m.poolsMu.RUnlock()

	if !exists {
		return
	}

	p.mu.Lock()
	defer p.mu.Unlock()

	if conn, ok := p.LivePool[streamName]; ok {
		if conn.ActiveUsers > 0 {
			conn.ActiveUsers--
		}
		conn.LastUsedAt = time.Now()
		if conn.ActiveUsers == 0 {
			conn.Status = "idle"
			// Nếu connection không có client nào (idle) -> đóng connection
			_ = m.go2rtc.UnregisterStream(context.Background(), streamName)
			delete(p.LivePool, streamName)
			log.Printf("[Pool] IDLE Stream closed and removed: %s", streamName)
		} else {
			log.Printf("[Pool] RELEASED viewer from %s (Remaining clients: %d/5)", streamName, conn.ActiveUsers)
		}
	}
}

// Heartbeat updates the last active timestamp of a viewer session
func (m *Manager) Heartbeat(camID, streamName string) {
	m.poolsMu.RLock()
	p, exists := m.pools[camID]
	m.poolsMu.RUnlock()

	if !exists {
		return
	}

	p.mu.Lock()
	defer p.mu.Unlock()

	if conn, ok := p.LivePool[streamName]; ok {
		conn.LastUsedAt = time.Now()
	}
}

// DeleteCamera cleans up all media streams and removes the camera from pool
func (m *Manager) DeleteCamera(ctx context.Context, camID string) {
	m.poolsMu.Lock()
	p, exists := m.pools[camID]
	delete(m.pools, camID)
	m.poolsMu.Unlock()

	if !exists {
		return
	}

	p.mu.Lock()
	defer p.mu.Unlock()

	if p.CVConnection != nil {
		_ = m.go2rtc.UnregisterStream(ctx, p.CVConnection.StreamName)
	}
	for streamName := range p.LivePool {
		_ = m.go2rtc.UnregisterStream(ctx, streamName)
	}
	log.Printf("[Pool] Camera %s completely removed from connection pool.", camID)
}

// UpdateNVRStatus dynamically toggles Connection #1 for all active cameras
func (m *Manager) UpdateNVRStatus(ctx context.Context, enabled bool) {
	m.poolsMu.Lock()
	defer m.poolsMu.Unlock()

	if m.IsNVREnabled == enabled {
		return
	}
	m.IsNVREnabled = enabled

	for camID, p := range m.pools {
		p.mu.Lock()
		if p.IsActive {
			if enabled && p.NVRConnection == nil {
				nvrStreamName := fmt.Sprintf("cam_%s_nvr", camID)
				if err := m.go2rtc.RegisterStream(ctx, nvrStreamName, p.Host, string(PurposeNVR)); err != nil {
					log.Printf("[Pool] Warning: Failed to register Connection #1 (NVR) for cam %s: %v", camID, err)
				} else {
					p.NVRConnection = &StreamConnection{
						ID:          fmt.Sprintf("conn_%s_nvr", camID),
						CameraID:    camID,
						Index:       1,
						Purpose:     PurposeNVR,
						StreamName:  nvrStreamName,
						SourceURL:   p.Host,
						ActiveUsers: 1,
						MaxUsers:    1,
						CreatedAt:   time.Now(),
						LastUsedAt:  time.Now(),
						Status:      "active",
					}
					log.Printf("[Pool] Camera %s Connection #1 (NVR) dynamically STARTED -> %s", camID, nvrStreamName)
				}
			} else if !enabled && p.NVRConnection != nil {
				_ = m.go2rtc.UnregisterStream(ctx, p.NVRConnection.StreamName)
				p.NVRConnection = nil
				log.Printf("[Pool] Camera %s Connection #1 dynamically TERMINATED due to global setting.", camID)
			}
		}
		p.mu.Unlock()
	}
}

// GetStatusSummary returns an aggregated health view of all camera pools
func (m *Manager) GetStatusSummary() *PoolStatusSummary {
	m.poolsMu.RLock()
	defer m.poolsMu.RUnlock()

	summary := &PoolStatusSummary{
		TotalCameras: len(m.pools),
		Cameras:      make([]*CameraPool, 0, len(m.pools)),
	}

	for _, p := range m.pools {
		p.mu.RLock()
		if p.IsActive {
			summary.ActiveCameras++
		}
		if p.CVConnection != nil {
			summary.TotalCVStreams++
		}
		if p.NVRConnection != nil {
			summary.TotalNVRStreams++
		}
		summary.TotalLiveStreams += len(p.LivePool)
		for _, conn := range p.LivePool {
			summary.TotalActiveViewers += conn.ActiveUsers
		}

		// Clone pool structure for safe threadless serialization
		poolCopy := &CameraPool{
			CameraID:      p.CameraID,
			CameraName:    p.CameraName,
			Host:          p.Host,
			IsActive:      p.IsActive,
			EnableAI:      p.EnableAI,
			CVConnection:  p.CVConnection,
			NVRConnection: p.NVRConnection,
			LivePool:      make(map[string]*StreamConnection, len(p.LivePool)),
			NextLiveIndex: p.NextLiveIndex,
		}
		for k, v := range p.LivePool {
			connCopy := *v
			poolCopy.LivePool[k] = &connCopy
		}
		summary.Cameras = append(summary.Cameras, poolCopy)
		p.mu.RUnlock()
	}

	return summary
}
