# syntax=docker/dockerfile:1.7
FROM golang:1.25-alpine AS builder
WORKDIR /app

ENV CGO_ENABLED=0 GOOS=linux

# 1. Install Protoc and Go plugins
RUN apk add --no-cache protoc protobuf-dev
RUN go install google.golang.org/protobuf/cmd/protoc-gen-go@v1.31.0 && \
    go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@v1.3.0

# 2. Layer cache for dependencies
COPY go.work go.work.sum* ./
COPY services/shared/go.mod services/shared/go.sum* ./services/shared/
COPY services/core/go.mod services/core/go.sum* ./services/core/
COPY services/auth/go.mod services/auth/go.sum* ./services/auth/
COPY services/recorder/go.mod services/recorder/go.sum* ./services/recorder/
COPY services/bgrd/go.mod services/bgrd/go.sum* ./services/bgrd/
COPY services/gateway/go.mod services/gateway/go.sum* ./services/gateway/
COPY services/pool-service/go.mod services/pool-service/go.sum* ./services/pool-service/
COPY services/seed/go.mod services/seed/go.sum* ./services/seed/

RUN --mount=type=cache,target=/go/pkg/mod \
    cd services/core && go mod download

# 3. Copy source and build with compiler cache mount
COPY services/shared ./services/shared

# Compile Protobuf
RUN mkdir -p services/shared/pkg/pb && \
    protoc --go_out=services/shared/pkg/pb --go_opt=paths=source_relative \
           --go-grpc_out=services/shared/pkg/pb --go-grpc_opt=paths=source_relative \
           -I=services/shared/proto services/shared/proto/*.proto

COPY services/core ./services/core

WORKDIR /app/services/core
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go build -ldflags="-s -w" -trimpath -o /app/dist/core main.go

FROM alpine:3.21
WORKDIR /app
RUN apk add --no-cache ca-certificates
COPY --from=builder /app/dist/core /app/core
EXPOSE 8080
ENV PORT=8080
CMD ["/app/core"]
