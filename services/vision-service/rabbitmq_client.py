import pika
import os
import json
import logging
import time

logger = logging.getLogger(__name__)

class RabbitMQClient:
    def __init__(self, url):
        self.url = url
        self.connection = None
        self.channel = None
        self.queue = 'relay_queue'
        
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
            logger.info(f"Published event: {pattern}")
        except Exception as e:
            logger.error(f"Failed to publish event: {e}")
            # Try to reconnect for next time
            if self.connection and not self.connection.is_closed:
                self.connection.close()

    def close(self):
        if self.connection and not self.connection.is_closed:
            self.connection.close()
            logger.info("Closed RabbitMQ connection")
