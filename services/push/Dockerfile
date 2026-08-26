# syntax=docker/dockerfile:1.7
FROM golang:1.25-alpine AS builder
WORKDIR /app

ENV CGO_ENABLED=0 GOOS=linux
RUN apk add --no-cache ca-certificates tzdata

COPY go.work go.work.sum* ./
COPY services/shared/go.mod services/shared/go.sum* ./services/shared/
COPY services/push/go.mod services/push/go.sum* ./services/push/
COPY services/core/go.mod services/core/go.sum* ./services/core/
COPY services/auth/go.mod services/auth/go.sum* ./services/auth/
COPY services/recorder/go.mod services/recorder/go.sum* ./services/recorder/
COPY services/bgrd/go.mod services/bgrd/go.sum* ./services/bgrd/
COPY services/gateway/go.mod services/gateway/go.sum* ./services/gateway/
COPY services/pool/go.mod services/pool/go.sum* ./services/pool/
COPY services/seed/go.mod services/seed/go.sum* ./services/seed/
COPY services/hawkeyes/go.mod services/hawkeyes/go.sum* ./services/hawkeyes/

RUN --mount=type=cache,target=/go/pkg/mod \
    cd services/push && go mod download

COPY services/shared ./services/shared
COPY services/push ./services/push

WORKDIR /app/services/push
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go build -ldflags="-s -w" -trimpath -o /app/dist/push main.go

FROM scratch
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo
COPY --from=builder /app/dist/push /app/push
CMD ["/app/push"]
