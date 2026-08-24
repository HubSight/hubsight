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

// Init connects to RabbitMQ and opens a channel.
func Init() error {
	mutex.Lock()
	defer mutex.Unlock()

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

// PublishEvent publishes a JSON message to a specified queue/pattern.
// This is used to communicate with the NestJS microservice which listens on the queue name corresponding to the event pattern.
func PublishEvent(pattern string, data interface{}) error {
	if ch == nil {
		if err := Init(); err != nil {
			return err
		}
	}

	body, err := json.Marshal(map[string]interface{}{
		"pattern": pattern,
		"data":    data,
	})
	if err != nil {
		return err
	}

	// For NestJS RabbitMQ microservices, we typically publish to a queue.
	// Since relay-service consumes from a specific queue, we declare it or just publish to default exchange with routing key = queue name.
	q, err := ch.QueueDeclare(
		"relay_queue", // name
		true,          // durable
		false,         // delete when unused
		false,         // exclusive
		false,         // no-wait
		nil,           // arguments
	)
	if err != nil {
		return err
	}

	err = ch.PublishWithContext(
		context.Background(),
		"",     // exchange
		q.Name, // routing key
		false,  // mandatory
		false,  // immediate
		amqp.Publishing{
			ContentType: "application/json",
			Body:        body,
		})
	if err != nil {
		log.Printf("Failed to publish event %s: %v", pattern, err)
		return err
	}

	log.Printf("Published MQ event: %s", pattern)
	return nil
}

// PublishToQueue publishes a JSON message to a specific queue name.
func PublishToQueue(queueName, pattern string, data interface{}) error {
	if ch == nil {
		if err := Init(); err != nil {
			return err
		}
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
		true,  // durable
		false, // delete when unused
		false, // exclusive
		false, // no-wait
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

// PublishCameraEvent publishes camera lifecycle events to both relay_queue and pool_queue
func PublishCameraEvent(pattern string, data interface{}) {
	_ = PublishToQueue("relay_queue", pattern, data)
	_ = PublishToQueue("pool_queue", pattern, data)
	log.Printf("[MQ] Broadcasted camera event to relay and pool: %s", pattern)
}

// Close closes the RabbitMQ connection and channel.
func Close() {
	if ch != nil {
		ch.Close()
	}
	if conn != nil {
		conn.Close()
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
