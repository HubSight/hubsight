# syntax=docker/dockerfile:1.7
FROM golang:1.25-alpine AS builder
WORKDIR /app

ENV CGO_ENABLED=0 GOOS=linux

# 1. Layer cache for dependencies
COPY go.work go.work.sum* ./
COPY services/shared/go.mod services/shared/go.sum* ./services/shared/
COPY services/core/go.mod services/core/go.sum* ./services/core/
COPY services/auth/go.mod services/auth/go.sum* ./services/auth/
COPY services/recorder/go.mod services/recorder/go.sum* ./services/recorder/
COPY services/bgrd/go.mod services/bgrd/go.sum* ./services/bgrd/
COPY services/gateway/go.mod services/gateway/go.sum* ./services/gateway/
COPY services/seed/go.mod services/seed/go.sum* ./services/seed/

RUN --mount=type=cache,target=/go/pkg/mod \
    cd services/core && go mod download

# 2. Copy source and build with compiler cache mount
COPY services/shared ./services/shared
COPY services/core ./services/core

WORKDIR /app/services/core
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go build -ldflags="-s -w" -trimpath -o /app/dist/core main.go

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/dist/core /app/core
EXPOSE 8080
ENV PORT=8080
CMD ["/app/core"]
