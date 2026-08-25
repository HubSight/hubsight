package events

import (
	"log"

	"cctv/pool-service/pkg/pool"
	"cctv/shared/pkg/mq"
)

// PublishStatusSnapshot broadcasts the current pool snapshot to relay-service.
func PublishStatusSnapshot(summary *pool.PoolStatusSummary) {
	if summary == nil {
		return
	}
	if err := mq.PublishEvent("pool.status.update", summary); err != nil {
		log.Printf("[Pool Events] Failed to publish pool.status.update: %v", err)
	}
}
