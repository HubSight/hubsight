# syntax=docker/dockerfile:1.7
FROM golang:1.25-alpine AS builder
WORKDIR /app

ENV CGO_ENABLED=0 GOOS=linux
RUN apk add --no-cache ca-certificates tzdata

# 1. Layer cache for dependencies
COPY go.work go.work.sum* ./
COPY services/shared/go.mod services/shared/go.sum* ./services/shared/
COPY services/auth/go.mod services/auth/go.sum* ./services/auth/
COPY services/core/go.mod services/core/go.sum* ./services/core/
COPY services/recorder/go.mod services/recorder/go.sum* ./services/recorder/
COPY services/bgrd/go.mod services/bgrd/go.sum* ./services/bgrd/
COPY services/gateway/go.mod services/gateway/go.sum* ./services/gateway/
COPY services/pool/go.mod services/pool/go.sum* ./services/pool/
COPY services/seed/go.mod services/seed/go.sum* ./services/seed/
COPY services/hawkeyes/go.mod services/hawkeyes/go.sum* ./services/hawkeyes/
COPY services/push/go.mod services/push/go.sum* ./services/push/

RUN --mount=type=cache,target=/go/pkg/mod \
    cd services/auth && go mod download

# 2. Copy source and build with compiler cache mount
COPY services/shared ./services/shared
COPY services/auth ./services/auth

WORKDIR /app/services/auth
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go build -ldflags="-s -w" -trimpath -o /app/dist/auth .

FROM scratch
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo
COPY --from=builder /app/dist/auth /app/auth
EXPOSE 8081
ENV PORT=8081
CMD ["/app/auth"]

