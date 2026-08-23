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
	for _, p := range poolsCopy {
		p.mu.Lock()
		for streamName, conn := range p.LivePool {
			// Only reap Live connections with 0 active users that exceeded idle timeout
			if conn.ActiveUsers == 0 && now.Sub(conn.LastUsedAt) > idleTimeout {
				log.Printf("[Pool GC] Reaping idle live stream %s for cam %s (Idle duration: %v)",
					streamName, p.CameraID, now.Sub(conn.LastUsedAt).Round(time.Second))

				// Unregister from go2rtc media router to close RTSP connection to physical camera
				_ = m.go2rtc.UnregisterStream(ctx, streamName)
				delete(p.LivePool, streamName)
			}
		}
		p.mu.Unlock()
	}
}
