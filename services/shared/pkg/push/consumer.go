package push

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"cctv/shared/pkg/mq"
	"cctv/shared/pkg/notification"
)

type queueMessage struct {
	Pattern string                       `json:"pattern"`
	Data    notification.NotificationDTO `json:"data"`
}

// Run consumes push_queue until ctx is cancelled, reconnecting on failure.
func Run(ctx context.Context) {
	backoff := time.Second
	for {
		if ctx.Err() != nil {
			return
		}
		err := listen(ctx)
		if ctx.Err() != nil {
			return
		}
		if err != nil {
			log.Printf("[Push] listener stopped: %v (retry in %s)", err, backoff)
		} else {
			log.Printf("[Push] queue closed, retrying in %s", backoff)
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff):
		}
		if backoff < 30*time.Second {
			backoff *= 2
		}
	}
}

func listen(ctx context.Context) error {
	if err := mq.Init(); err != nil {
		return err
	}

	msgs, err := mq.Consume(QueueName)
	if err != nil {
		return err
	}
	log.Printf("[Push] Consuming %s", QueueName)

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case d, ok := <-msgs:
			if !ok {
				return nil
			}
			handleDelivery(ctx, d.Body)
		}
	}
}

func handleDelivery(parent context.Context, body []byte) {
	var msg queueMessage
	if err := json.Unmarshal(body, &msg); err != nil {
		log.Printf("[Push] invalid message: %v", err)
		return
	}
	if msg.Pattern != "notification.new" {
		return
	}

	ctx, cancel := context.WithTimeout(parent, 15*time.Second)
	defer cancel()
	DispatchToSubscribers(ctx, msg.Data)
}
