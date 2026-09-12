package pool

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"cctv/pool/pkg/webrtc"
)

type Manager struct {
	zlm          *webrtc.ZLMClient
	pools        map[string]*CameraPool
	poolsMu      sync.RWMutex
	IsNVREnabled bool

	onChange      func(*PoolStatusSummary)
	notifyMu      sync.Mutex
	notifyPending bool
}

func NewManager(zlmClient *webrtc.ZLMClient) *Manager {
	return &Manager{
		zlm:          zlmClient,
		pools:        make(map[string]*CameraPool),
		IsNVREnabled: true, // Default to true until event syncs it
	}
}

// SetOnChange registers a callback invoked (debounced) after pool mutations.
func (m *Manager) SetOnChange(fn func(*PoolStatusSummary)) {
	m.onChange = fn
}

// scheduleNotify publishes a snapshot as soon as pool mutexes are released.
// A short coalescing window batches a burst of upserts (sync) into one event.
func (m *Manager) scheduleNotify() {
	if m.onChange == nil {
		return
	}
	m.notifyMu.Lock()
	defer m.notifyMu.Unlock()
	if m.notifyPending {
		return
	}
	m.notifyPending = true
	go func() {
		time.Sleep(15 * time.Millisecond)
		m.notifyMu.Lock()
		m.notifyPending = false
		m.notifyMu.Unlock()
		if m.onChange != nil {
			m.onChange(m.GetStatusSummary())
		}
	}()
}

// unregister is a small helper so every call site doesn't have to repeat the
// (streamName, proxyKey) pair plumbing.
func (m *Manager) unregister(ctx context.Context, conn *StreamConnection) {
	if conn == nil {
		return
	}
	_ = m.zlm.UnregisterStream(ctx, conn.StreamName, conn.ProxyKey)
}

// UpsertCamera registers or updates a camera in the connection pool
func (m *Manager) UpsertCamera(ctx context.Context, camID, name, host string, isActive, enableAI bool, nvrMode ...string) error {
	mode := "event"
	if len(nvrMode) > 0 && nvrMode[0] != "" {
		mode = nvrMode[0]
	}

	m.poolsMu.Lock()
	p, exists := m.pools[camID]
	if !exists {
		p = &CameraPool{
			CameraID:      camID,
			CameraName:    name,
			Host:          host,
			IsActive:      isActive,
			EnableAI:      enableAI,
			NvrMode:       mode,
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
		p.NvrMode = mode
		p.mu.Unlock()
	}
	m.poolsMu.Unlock()

	p.mu.Lock()
	defer p.mu.Unlock()

	if !isActive || !enableAI {
		// If camera is deactivated OR AI is disabled, terminate CV stream
		if p.CVConnection != nil {
			m.unregister(ctx, p.CVConnection)
			p.CVConnection = nil
			log.Printf("[Pool] Camera %s AI deactivated or inactive. CV Connection #0 terminated.", camID)
		}
	}

	if !isActive {
		// Stop / deactivate: tear down thumb, live, NVR, and CV immediately.
		if p.ThumbConnection != nil {
			m.unregister(ctx, p.ThumbConnection)
			p.ThumbConnection = nil
		}
		for _, conn := range p.LivePool {
			m.unregister(ctx, conn)
		}
		p.LivePool = make(map[string]*StreamConnection)
		if p.NVRConnection != nil {
			m.unregister(ctx, p.NVRConnection)
			p.NVRConnection = nil
		}
		if p.CVConnection != nil {
			m.unregister(ctx, p.CVConnection)
			p.CVConnection = nil
		}
		log.Printf("[Pool] Camera %s stopped or deactivated. All pool connections terminated immediately.", camID)
		m.scheduleNotify()
		return nil
	}

	// Manage Thumb Connection (Persistent 640p 15FPS stream for thumbnail / snapshot)
	thumbStreamName := fmt.Sprintf("cam_%s_thumb", camID)
	if p.ThumbConnection == nil || p.ThumbConnection.SourceURL != host {
		if p.ThumbConnection != nil && p.ThumbConnection.SourceURL != host {
			m.unregister(ctx, p.ThumbConnection)
			p.ThumbConnection = nil
		}
		if key, err := m.zlm.RegisterStream(ctx, thumbStreamName, host, string(PurposeThumb)); err != nil {
			log.Printf("[Pool] Warning: Failed to register persistent Thumbnail stream for cam %s: %v", camID, err)
		} else {
			p.ThumbConnection = &StreamConnection{
				ID:          fmt.Sprintf("conn_%s_thumb", camID),
				CameraID:    camID,
				Index:       -1,
				Purpose:     PurposeThumb,
				StreamName:  thumbStreamName,
				ProxyKey:    key,
				SourceURL:   host,
				ActiveUsers: 1, // Continuously maintained
				MaxUsers:    1,
				CreatedAt:   time.Now(),
				LastUsedAt:  time.Now(),
				Status:      "active",
			}
			log.Printf("[Pool] Camera %s (%s): Persistent 640p 15FPS Thumbnail Stream READY -> %s", camID, name, thumbStreamName)
		}
	}

	if enableAI {
		// Ensure Connection #0 (CV Dedicated) is registered and active
		cvStreamName := fmt.Sprintf("cam_%s_cv", camID)
		if key, err := m.zlm.RegisterStream(ctx, cvStreamName, host, string(PurposeCV)); err != nil {
			log.Printf("[Pool] Warning: Failed to register Connection #0 (CV) for cam %s: %v", camID, err)
		} else {
			p.CVConnection = &StreamConnection{
				ID:          fmt.Sprintf("conn_%s_cv", camID),
				CameraID:    camID,
				Index:       0,
				Purpose:     PurposeCV,
				StreamName:  cvStreamName,
				ProxyKey:    key,
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

	// Manage Connection #1 (NVR per device)
	// Only connects if NVR is enabled for this camera (mode != "disabled")
	// If mode is "event", requires enableAI=true per Rule #5
	shouldConnectNVR := isActive && mode != "disabled"
	if mode == "event" && !enableAI {
		shouldConnectNVR = false
	}

	if shouldConnectNVR {
		nvrStreamName := fmt.Sprintf("cam_%s_nvr", camID)
		if key, err := m.zlm.RegisterStream(ctx, nvrStreamName, host, string(PurposeNVR)); err != nil {
			log.Printf("[Pool] Warning: Failed to register Connection #1 (NVR) for cam %s: %v", camID, err)
		} else {
			p.NVRConnection = &StreamConnection{
				ID:          fmt.Sprintf("conn_%s_nvr", camID),
				CameraID:    camID,
				Index:       1,
				Purpose:     PurposeNVR,
				StreamName:  nvrStreamName,
				ProxyKey:    key,
				SourceURL:   host,
				ActiveUsers: 1, // Always held by NVR logic context
				MaxUsers:    1,
				CreatedAt:   time.Now(),
				LastUsedAt:  time.Now(),
				Status:      "active",
			}
			log.Printf("[Pool] Camera %s (%s): Connection #1 (NVR) READY -> %s (mode: %s)", camID, name, nvrStreamName, mode)
		}
	} else {
		// NVR disabled for this camera or AI required for event mode
		if p.NVRConnection != nil {
			m.unregister(ctx, p.NVRConnection)
			p.NVRConnection = nil
			log.Printf("[Pool] Camera %s NVR Connection #1 terminated (mode: %s, AI: %v).", camID, mode, enableAI)
		}
	}

	// If host changed, refresh all active live streams
	for streamName, conn := range p.LivePool {
		conn.SourceURL = host
		if key, err := m.zlm.RegisterStream(ctx, streamName, host, string(PurposeLive)); err != nil {
			log.Printf("[Pool] Warning: Failed to refresh live stream %s for cam %s: %v", streamName, camID, err)
		} else {
			conn.ProxyKey = key
		}
	}

	m.scheduleNotify()
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

// GetThumbStream returns the persistent 640p 15FPS stream name for thumbnail/snapshot
func (m *Manager) GetThumbStream(camID string) (string, error) {
	m.poolsMu.RLock()
	p, exists := m.pools[camID]
	m.poolsMu.RUnlock()

	if !exists {
		return "", fmt.Errorf("camera %s not found in pool", camID)
	}

	p.mu.RLock()
	defer p.mu.RUnlock()

	if !p.IsActive || p.ThumbConnection == nil {
		return "", fmt.Errorf("camera %s is inactive or thumbnail stream not available", camID)
	}

	return p.ThumbConnection.StreamName, nil
}

func liveConnCap(conn *StreamConnection) int {
	if conn != nil && conn.MaxUsers > 0 {
		return conn.MaxUsers
	}
	return LiveMaxClientsPerConn
}

// pickReusableLiveConn returns the fullest live conn that still has a free slot.
// That keeps RTSP sockets on the camera at ceil(viewers / 5) instead of one per client.
func pickReusableLiveConn(p *CameraPool) *StreamConnection {
	var best *StreamConnection
	for _, conn := range p.LivePool {
		if conn.ActiveUsers >= liveConnCap(conn) {
			continue
		}
		if best == nil || conn.ActiveUsers > best.ActiveUsers {
			best = conn
		}
	}
	return best
}

// AcquireLiveStream assigns a viewer to a shared live RTSP pull (#2+).
// Clients reuse an existing live connection until it has LiveMaxClientsPerConn
// viewers; only then is a new ZLMediaKit/RTSP producer opened.
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
		return nil, fmt.Errorf("camera %s is stopped", camID)
	}

	if candidate := pickReusableLiveConn(p); candidate != nil {
		candidate.ActiveUsers++
		candidate.LastUsedAt = time.Now()
		candidate.Status = "active"
		log.Printf("[Pool] RE-USING live stream %s for cam %s (Clients: %d/%d) — same RTSP pull",
			candidate.StreamName, camID, candidate.ActiveUsers, liveConnCap(candidate))

		res := &AcquireResult{
			StreamName:  candidate.StreamName,
			IsNewStream: false,
			ActiveUsers: candidate.ActiveUsers,
			ConnIndex:   candidate.Index,
		}
		m.scheduleNotify()
		return res, nil
	}

	// Every live conn is full (5/5). Open a new RTSP producer (#2, #3, ...).
	p.NextLiveIndex++
	newIndex := p.NextLiveIndex // first live is 2 (0=CV, 1=NVR)
	newStreamName := fmt.Sprintf("cam_%s_live_%d", camID, newIndex)

	key, err := m.zlm.RegisterStream(ctx, newStreamName, p.Host, string(PurposeLive))
	if err != nil {
		p.NextLiveIndex-- // Rollback
		return nil, fmt.Errorf("failed to register new live stream in media router: %w", err)
	}

	newConn := &StreamConnection{
		ID:          fmt.Sprintf("conn_%s_live_%d", camID, newIndex),
		CameraID:    camID,
		Index:       newIndex,
		Purpose:     PurposeLive,
		StreamName:  newStreamName,
		ProxyKey:    key,
		SourceURL:   p.Host,
		ActiveUsers: 1,
		MaxUsers:    LiveMaxClientsPerConn,
		CreatedAt:   time.Now(),
		LastUsedAt:  time.Now(),
		Status:      "active",
	}
	p.LivePool[newStreamName] = newConn

	log.Printf("[Pool] CREATED shared live connection #%d (%s) for cam %s (Clients: 1/%d)",
		newIndex, newStreamName, camID, LiveMaxClientsPerConn)

	m.scheduleNotify()
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
			// No clients left on this connection -> close it.
			m.unregister(context.Background(), conn)
			delete(p.LivePool, streamName)
			log.Printf("[Pool] IDLE Stream closed and removed: %s", streamName)
		} else {
			log.Printf("[Pool] RELEASED viewer from %s (Remaining clients: %d/5)", streamName, conn.ActiveUsers)
		}
		m.scheduleNotify()
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

	if p.ThumbConnection != nil {
		m.unregister(ctx, p.ThumbConnection)
	}
	if p.CVConnection != nil {
		m.unregister(ctx, p.CVConnection)
	}
	if p.NVRConnection != nil {
		// Previously not unregistered here (pre-existing gap ported from the
		// earlier code) — fixed while touching this path.
		m.unregister(ctx, p.NVRConnection)
	}
	for _, conn := range p.LivePool {
		m.unregister(ctx, conn)
	}
	log.Printf("[Pool] Camera %s completely removed from connection pool.", camID)
	m.scheduleNotify()
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
				if key, err := m.zlm.RegisterStream(ctx, nvrStreamName, p.Host, string(PurposeNVR)); err != nil {
					log.Printf("[Pool] Warning: Failed to register Connection #1 (NVR) for cam %s: %v", camID, err)
				} else {
					p.NVRConnection = &StreamConnection{
						ID:          fmt.Sprintf("conn_%s_nvr", camID),
						CameraID:    camID,
						Index:       1,
						Purpose:     PurposeNVR,
						StreamName:  nvrStreamName,
						ProxyKey:    key,
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
				m.unregister(ctx, p.NVRConnection)
				p.NVRConnection = nil
				log.Printf("[Pool] Camera %s Connection #1 dynamically TERMINATED due to global setting.", camID)
			}
		}
		p.mu.Unlock()
	}
	m.scheduleNotify()
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
		if p.ThumbConnection != nil {
			summary.TotalThumbStreams++
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

		poolCopy := &CameraPool{
			CameraID:      p.CameraID,
			CameraName:    p.CameraName,
			Host:          p.Host,
			IsActive:      p.IsActive,
			EnableAI:      p.EnableAI,
			LivePool:      make(map[string]*StreamConnection, len(p.LivePool)),
			NextLiveIndex: p.NextLiveIndex,
		}
		if p.ThumbConnection != nil {
			thumb := *p.ThumbConnection
			poolCopy.ThumbConnection = &thumb
		}
		if p.CVConnection != nil {
			cv := *p.CVConnection
			poolCopy.CVConnection = &cv
		}
		if p.NVRConnection != nil {
			nvr := *p.NVRConnection
			poolCopy.NVRConnection = &nvr
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
