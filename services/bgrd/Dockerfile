# syntax=docker/dockerfile:1.7
FROM golang:1.25-alpine AS builder
WORKDIR /app

ENV CGO_ENABLED=0 GOOS=linux

# 1. Layer cache for dependencies
COPY go.work go.work.sum* ./
COPY services/shared/go.mod services/shared/go.sum* ./services/shared/
COPY services/bgrd/go.mod services/bgrd/go.sum* ./services/bgrd/
COPY services/auth/go.mod services/auth/go.sum* ./services/auth/
COPY services/core/go.mod services/core/go.sum* ./services/core/
COPY services/recorder/go.mod services/recorder/go.sum* ./services/recorder/
COPY services/gateway/go.mod services/gateway/go.sum* ./services/gateway/
COPY services/pool-service/go.mod services/pool-service/go.sum* ./services/pool-service/
COPY services/seed/go.mod services/seed/go.sum* ./services/seed/

RUN --mount=type=cache,target=/go/pkg/mod \
    cd services/bgrd && go mod download

# 2. Copy source and build with compiler cache mount
COPY services/shared ./services/shared
COPY services/bgrd ./services/bgrd

WORKDIR /app/services/bgrd
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go build -ldflags="-s -w" -trimpath -o /app/dist/bgrd main.go

FROM alpine:3.21
WORKDIR /app
RUN apk add --no-cache ca-certificates
COPY --from=builder /app/dist/bgrd /app/bgrd
CMD ["/app/bgrd"]
