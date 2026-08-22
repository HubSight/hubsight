FROM golang:alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN go build -o dist/recorder cmd/recorder/main.go

FROM alpine:latest
RUN apk add --no-cache ffmpeg tzdata

WORKDIR /app
COPY --from=builder /app/dist/recorder /app/recorder

# Volume for recordings
VOLUME /data/camera

CMD ["/app/recorder"]
