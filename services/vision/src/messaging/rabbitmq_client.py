import pika
import os
import json
import logging
import time
import threading

logger = logging.getLogger(__name__)

class RabbitMQClient:
    def __init__(self, url):
        self.url = url
        self.connection = None
        self.channel = None
        self.queue = 'relay_queue'
        self.consumer_thread = None
        
    def connect(self):
        while True:
            try:
                parameters = pika.URLParameters(self.url)
                self.connection = pika.BlockingConnection(parameters)
                self.channel = self.connection.channel()
                # Ensure the queue exists
                self.channel.queue_declare(queue=self.queue, durable=True)
                logger.info(f"Connected to RabbitMQ at {self.url}")
                break
            except pika.exceptions.AMQPConnectionError as e:
                logger.error(f"Failed to connect to RabbitMQ: {e}. Retrying in 5 seconds...")
                time.sleep(5)

    def publish_event(self, pattern, payload):
        if not self.connection or self.connection.is_closed:
            self.connect()
            
        try:
            # NestJS expects { "pattern": "...", "data": ... }
            message = {
                "pattern": pattern,
                "data": payload
            }
            self.channel.basic_publish(
                exchange='',
                routing_key=self.queue,
                body=json.dumps(message),
                properties=pika.BasicProperties(
                    delivery_mode=2,  # make message persistent
                )
            )
        except Exception as e:
            logger.error(f"Failed to publish event: {e}")
            # Try to reconnect for next time
            if self.connection and not self.connection.is_closed:
                self.connection.close()

    def start_consumer(self, queue_name, on_message_callback):
        """Starts a background thread listening for event messages from RabbitMQ."""
        def _consume_loop():
            while True:
                try:
                    parameters = pika.URLParameters(self.url)
                    conn = pika.BlockingConnection(parameters)
                    ch = conn.channel()
                    ch.queue_declare(queue=queue_name, durable=True)
                    
                    logger.info(f"[MQ Consumer] Subscribed to queue: {queue_name}")
                    
                    for method_frame, properties, body in ch.consume(queue=queue_name, auto_ack=True):
                        try:
                            msg = json.loads(body.decode('utf-8'))
                            pattern = msg.get('pattern', '')
                            data = msg.get('data', {})
                            on_message_callback(pattern, data)
                        except Exception as err:
                            logger.error(f"[MQ Consumer] Error processing message: {err}")
                except Exception as e:
                    logger.warning(f"[MQ Consumer] Connection lost ({e}), reconnecting in 5s...")
                    time.sleep(5)

        t = threading.Thread(target=_consume_loop, daemon=True)
        t.start()
        self.consumer_thread = t

    def close(self):
        if self.connection and not self.connection.is_closed:
            self.connection.close()
            logger.info("Closed RabbitMQ connection")

