package worker

import (
	"context"
	"encoding/json"
	"log"

	"github.com/hibiken/asynq"
	"cctv/internal/storage"
)

// Task names
const (
	TypeArchiveCleanup = "archive:cleanup"
)

// Task payload types
type ArchiveCleanupPayload struct {
	// Add payload fields if needed in the future
}

// NewArchiveCleanupTask creates a new archive cleanup task.
func NewArchiveCleanupTask() (*asynq.Task, error) {
	payload, err := json.Marshal(ArchiveCleanupPayload{})
	if err != nil {
		return nil, err
	}
	return asynq.NewTask(TypeArchiveCleanup, payload), nil
}

// HandleArchiveCleanupTask handles the archive cleanup task.
func HandleArchiveCleanupTask(ctx context.Context, t *asynq.Task) error {
	log.Printf("[Asynq Worker] Executing task: %s", t.Type())
	
	deletedCount, freedBytes, err := storage.CleanupOldArchives(ctx)
	if err != nil {
		log.Printf("[Asynq Worker] Failed to execute %s: %v", t.Type(), err)
		return err
	}
	
	log.Printf("[Asynq Worker] Task %s completed. Deleted %d segments, freed %d bytes.", t.Type(), deletedCount, freedBytes)
	return nil
}
