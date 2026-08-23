module cctv/pool-service

go 1.25.0

require (
	cctv/shared v0.0.0
	github.com/gin-contrib/cors v1.7.3
	github.com/gin-gonic/gin v1.10.0
	github.com/rabbitmq/amqp091-go v1.10.0
)

replace cctv/shared => ../shared
