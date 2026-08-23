package events

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"time"

	"cctv/pool-service/pkg/pool"
	amqp "github.com/rabbitmq/amqp091-go"
)

type CameraEventPayload struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Host     string `json:"host"`
	IsActive bool   `json:"is_active"`
	EnableAI bool   `json:"enable_ai"`
}

type EventMessage struct {
	Pattern string             `json:"pattern"`
	Data    CameraEventPayload `json:"data"`
}

type Subscriber struct {
	manager *pool.Manager
	rmqURL  string
}

func NewSubscriber(mgr *pool.Manager) *Subscriber {
	url := os.Getenv("RABBITMQ_URL")
	if url == "" {
		url = "amqp://guest:guest@localhost:5672/"
	}
	return &Subscriber{
		manager: mgr,
		rmqURL:  url,
	}
}

// StartListening connects to RabbitMQ and listens for camera lifecycle events on pool_queue
func (s *Subscriber) StartListening(ctx context.Context) {
	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			default:
				err := s.listenLoop(ctx)
				if err != nil {
					log.Printf("[Pool Events] RabbitMQ disconnected (%v). Reconnecting in 5s...", err)
					time.Sleep(5 * time.Second)
				}
			}
		}
	}()
}

func (s *Subscriber) listenLoop(ctx context.Context) error {
	conn, err := amqp.Dial(s.rmqURL)
	if err != nil {
		return err
	}
	defer conn.Close()

	ch, err := conn.Channel()
	if err != nil {
		return err
	}
	defer ch.Close()

	q, err := ch.QueueDeclare(
		"pool_queue", // Queue name dedicated for pool-service
		true,         // Durable
		false,        // Auto-delete
		false,        // Exclusive
		false,        // No-wait
		nil,
	)
	if err != nil {
		return err
	}

	msgs, err := ch.Consume(
		q.Name,
		"pool_service_consumer",
		true,  // Auto-ack
		false, // Exclusive
		false, // No-local
		false, // No-wait
		nil,
	)
	if err != nil {
		return err
	}

	log.Printf("[Pool Events] Connected to RabbitMQ on queue '%s'", q.Name)

	for {
		select {
		case <-ctx.Done():
			return nil
		case d, ok := <-msgs:
			if !ok {
				return amqp.ErrClosed
			}

			var msg EventMessage
			if err := json.Unmarshal(d.Body, &msg); err != nil {
				log.Printf("[Pool Events] Failed to parse message body: %v", err)
				continue
			}

			s.handleEvent(ctx, msg.Pattern, msg.Data)
		}
	}
}

func (s *Subscriber) handleEvent(ctx context.Context, pattern string, data CameraEventPayload) {
	log.Printf("[Pool Events] Received event '%s' for camera ID %s (%s)", pattern, data.ID, data.Name)

	switch pattern {
	case "camera.created", "camera.updated", "camera.toggled", "camera.sync":
		if data.ID != "" {
			_ = s.manager.UpsertCamera(ctx, data.ID, data.Name, data.Host, data.IsActive, data.EnableAI)
		}

	case "camera.deleted":
		if data.ID != "" {
			s.manager.DeleteCamera(ctx, data.ID)
		}

	default:
		log.Printf("[Pool Events] Unhandled pattern: %s", pattern)
	}
}
