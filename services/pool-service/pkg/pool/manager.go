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
	go2rtc  *webrtc.Go2RTCClient
	pools   map[string]*CameraPool
	poolsMu sync.RWMutex
}

func NewManager(go2rtcClient *webrtc.Go2RTCClient) *Manager {
	return &Manager{
		go2rtc: go2rtcClient,
		pools:  make(map[string]*CameraPool),
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
			NextLiveIndex: 0,
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
		log.Printf("[Pool] Camera %s deactivated. All pool connections terminated.", camID)
		return nil
	}

	if enableAI {
		// Ensure Connection #0 (CV Dedicated) is registered and active
		cvStreamName := fmt.Sprintf("cam_%s_cv", camID)
		if err := m.go2rtc.RegisterStream(ctx, cvStreamName, host); err != nil {
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

	// If host changed, refresh all active live streams
	for streamName, conn := range p.LivePool {
		conn.SourceURL = host
		_ = m.go2rtc.RegisterStream(ctx, streamName, host)
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
// 2. Otherwise create new connection (#1, #2...)
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

	// Camera has a hardware limit of 5 connections total.
	// Connection #0 is reserved for CV.
	// So we allow up to 4 independent live stream connections (1 client = 1 connection).

	// 1. Find an existing IDLE Live connection (ActiveUsers == 0)
	var candidate *StreamConnection
	for _, conn := range p.LivePool {
		if conn.ActiveUsers == 0 {
			candidate = conn
			break
		}
	}

	if candidate != nil {
		candidate.ActiveUsers = 1
		candidate.LastUsedAt = time.Now()
		candidate.Status = "active"
		log.Printf("[Pool] RE-USING idle live stream %s for cam %s (Clients: 1/1)",
			candidate.StreamName, camID)

		return &AcquireResult{
			StreamName:  candidate.StreamName,
			IsNewStream: false,
			ActiveUsers: candidate.ActiveUsers,
			ConnIndex:   candidate.Index,
		}, nil
	}

	// 2. All existing live streams are busy. Check limit (max 4 live streams)
	if len(p.LivePool) >= 4 {
		return nil, fmt.Errorf("camera %s has reached its hardware limit of 5 connections (1 CV + 4 Live)", camID)
	}

	// 3. Spawn New Connection
	p.NextLiveIndex++
	newIndex := p.NextLiveIndex
	newStreamName := fmt.Sprintf("cam_%s_live_%d", camID, newIndex)



	if err := m.go2rtc.RegisterStream(ctx, newStreamName, p.Host); err != nil {
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
		MaxUsers:    1,
		CreatedAt:   time.Now(),
		LastUsedAt:  time.Now(),
		Status:      "active",
	}
	p.LivePool[newStreamName] = newConn

	log.Printf("[Pool] CREATED new live stream connection #%d (%s) for cam %s (Clients: 1/1)",
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
		}
		log.Printf("[Pool] RELEASED viewer from %s (Remaining clients: %d/1)", streamName, conn.ActiveUsers)
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
