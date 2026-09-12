package pool

import (
	"context"
	"log"
	"time"
)

// StartGarbageCollector launches a background worker that cleans up idle live connections
// (connections with 0 clients for > 30s) while strictly protecting Connection #0 (CV).
func (m *Manager) StartGarbageCollector(ctx context.Context, checkInterval time.Duration, idleTimeout time.Duration) {
	ticker := time.NewTicker(checkInterval)
	go func() {
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				log.Println("[Pool GC] Garbage collector stopped.")
				return
			case <-ticker.C:
				m.reapIdleConnections(ctx, idleTimeout)
			}
		}
	}()
	log.Printf("[Pool GC] Idle connection garbage collector started (Interval: %v, Timeout: %v)", checkInterval, idleTimeout)
}

func (m *Manager) reapIdleConnections(ctx context.Context, idleTimeout time.Duration) {
	m.poolsMu.RLock()
	poolsCopy := make([]*CameraPool, 0, len(m.pools))
	for _, p := range m.pools {
		poolsCopy = append(poolsCopy, p)
	}
	m.poolsMu.RUnlock()

	now := time.Now()
	reaped := false
	for _, p := range poolsCopy {
		p.mu.Lock()
		for streamName, conn := range p.LivePool {
			// Reap when idle with 0 clients, or when LastUsedAt is stale (tab closed
			// without release — ActiveUsers would otherwise stay > 0 forever).
			idleFor := now.Sub(conn.LastUsedAt)
			zombie := idleFor > idleTimeout
			if !zombie {
				continue
			}
			log.Printf("[Pool GC] Reaping live stream %s for cam %s (idle %v, clients %d)",
				streamName, p.CameraID, idleFor.Round(time.Second), conn.ActiveUsers)
			m.unregister(ctx, conn)
			delete(p.LivePool, streamName)
			reaped = true
		}
		p.mu.Unlock()
	}
	if reaped {
		m.scheduleNotify()
	}
}
