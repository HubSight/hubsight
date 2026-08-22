FROM golang:1.25-alpine AS builder
WORKDIR /app
COPY go.work ./
COPY services/ ./services/
RUN cd services/recorder && go mod download || true
WORKDIR /app/services/recorder
RUN go build -o /app/dist/recorder main.go

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/dist/recorder /app/recorder
CMD ["/app/recorder"]
