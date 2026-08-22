FROM golang:1.25-alpine AS builder
WORKDIR /app
COPY go.work ./
COPY services/ ./services/
RUN cd services/bgrd && go mod download || true
WORKDIR /app/services/bgrd
RUN go build -o /app/dist/bgrd main.go

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/dist/bgrd /app/bgrd
CMD ["/app/bgrd"]
