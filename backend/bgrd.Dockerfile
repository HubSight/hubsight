FROM golang:alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o dist/bgrd cmd/bgrd/main.go

FROM alpine:latest
RUN apk --no-cache add ca-certificates tzdata
WORKDIR /app
COPY --from=builder /app/dist/bgrd /app/bgrd
ENTRYPOINT ["/app/bgrd"]
