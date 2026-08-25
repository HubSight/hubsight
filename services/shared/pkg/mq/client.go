package mq

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"sync"

	amqp "github.com/rabbitmq/amqp091-go"
)

var (
	conn  *amqp.Connection
	ch    *amqp.Channel
	mutex sync.Mutex
)

func initLocked() error {
	if ch != nil {
		return nil
	}

	url := os.Getenv("RABBITMQ_URL")
	if url == "" {
		url = "amqp://guest:guest@localhost:5672/"
	}

	var err error
	conn, err = amqp.Dial(url)
	if err != nil {
		return err
	}

	ch, err = conn.Channel()
	if err != nil {
		return err
	}

	log.Printf("Connected to RabbitMQ at %s", url)
	return nil
}

// Init connects to RabbitMQ and opens a channel.
func Init() error {
	mutex.Lock()
	defer mutex.Unlock()
	return initLocked()
}

func publishLocked(queueName, pattern string, data interface{}) error {
	if err := initLocked(); err != nil {
		return err
	}

	body, err := json.Marshal(map[string]interface{}{
		"pattern": pattern,
		"data":    data,
	})
	if err != nil {
		return err
	}

	q, err := ch.QueueDeclare(
		queueName,
		true,
		false,
		false,
		false,
		nil,
	)
	if err != nil {
		return err
	}

	return ch.PublishWithContext(
		context.Background(),
		"",
		q.Name,
		false,
		false,
		amqp.Publishing{
			ContentType: "application/json",
			Body:        body,
		},
	)
}

// PublishEvent publishes a JSON message to a specified queue/pattern.
// This is used to communicate with the NestJS microservice which listens on the queue name corresponding to the event pattern.
func PublishEvent(pattern string, data interface{}) error {
	mutex.Lock()
	defer mutex.Unlock()

	err := publishLocked("relay_queue", pattern, data)
	if err != nil {
		log.Printf("Failed to publish event %s: %v", pattern, err)
		return err
	}

	log.Printf("Published MQ event: %s", pattern)
	return nil
}

// PublishToQueue publishes a JSON message to a specific queue name.
func PublishToQueue(queueName, pattern string, data interface{}) error {
	mutex.Lock()
	defer mutex.Unlock()
	return publishLocked(queueName, pattern, data)
}

// PublishCameraEvent publishes camera lifecycle events to relay_queue, pool_queue, vision_queue, and nvr_recorder_queue
func PublishCameraEvent(pattern string, data interface{}) {
	_ = PublishToQueue("relay_queue", pattern, data)
	_ = PublishToQueue("pool_queue", pattern, data)
	_ = PublishToQueue("vision_queue", pattern, data)
	_ = PublishToQueue("nvr_recorder_queue", pattern, data)
	log.Printf("[MQ] Broadcasted camera event: %s", pattern)
}

// PublishMemberEvent publishes member/face updates to relay_queue and vision_queue
func PublishMemberEvent(pattern string, data interface{}) {
	_ = PublishToQueue("relay_queue", pattern, data)
	_ = PublishToQueue("vision_queue", pattern, data)
	log.Printf("[MQ] Broadcasted member/face event: %s", pattern)
}

// Close closes the RabbitMQ connection and channel.
func Close() {
	mutex.Lock()
	defer mutex.Unlock()
	if ch != nil {
		ch.Close()
		ch = nil
	}
	if conn != nil {
		conn.Close()
		conn = nil
	}
}

// Consume subscribes to a specific queue and returns a channel of deliveries
func Consume(queueName string) (<-chan amqp.Delivery, error) {
	if ch == nil {
		if err := Init(); err != nil {
			return nil, err
		}
	}

	q, err := ch.QueueDeclare(
		queueName,
		true,  // durable
		false, // delete when unused
		false, // exclusive
		false, // no-wait
		nil,
	)
	if err != nil {
		return nil, err
	}

	return ch.Consume(
		q.Name,
		"",    // consumer tag
		true,  // auto-ack
		false, // exclusive
		false, // no-local
		false, // no-wait
		nil,
	)
}
