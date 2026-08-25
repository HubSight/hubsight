# syntax=docker/dockerfile:1.7

# Stage 1: Build Frontend (React/Vite on Node 24)
FROM node:24-alpine AS frontend-builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Cache pnpm install layer
COPY webapp/package.json webapp/pnpm-lock.yaml* webapp/pnpm-workspace.yaml* webapp/.npmrc* ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Copy frontend source and build with vite cache
COPY webapp/ .
COPY .git/ ./.git/
RUN --mount=type=cache,target=/app/node_modules/.vite \
    pnpm run build

# Stage 2: Build Backend API Gateway (Go)
FROM golang:1.25-alpine AS backend-builder
WORKDIR /app

ENV CGO_ENABLED=0 GOOS=linux
RUN apk add --no-cache ca-certificates tzdata

# 1. Layer cache for dependencies
COPY go.work go.work.sum* ./
COPY services/shared/go.mod services/shared/go.sum* ./services/shared/
COPY services/gateway/go.mod services/gateway/go.sum* ./services/gateway/
COPY services/core/go.mod services/core/go.sum* ./services/core/
COPY services/auth/go.mod services/auth/go.sum* ./services/auth/
COPY services/pool-service/go.mod services/pool-service/go.sum* ./services/pool-service/
COPY services/recorder/go.mod services/recorder/go.sum* ./services/recorder/
COPY services/bgrd/go.mod services/bgrd/go.sum* ./services/bgrd/
COPY services/seed/go.mod services/seed/go.sum* ./services/seed/

RUN --mount=type=cache,target=/go/pkg/mod \
    cd services/gateway && go mod download

# 2. Copy source and build with compiler cache mount
COPY services/shared ./services/shared
COPY services/gateway ./services/gateway

WORKDIR /app/services/gateway
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go build -ldflags="-s -w" -trimpath -o /app/dist/gateway main.go

# Stage 3: Final Production Image
FROM scratch
COPY --from=backend-builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=backend-builder /usr/share/zoneinfo /usr/share/zoneinfo
COPY --from=backend-builder /app/dist/gateway /app/gateway
COPY --from=frontend-builder /app/dist /app/public

EXPOSE 8080
ENV PORT=8080
CMD ["/app/gateway"]
