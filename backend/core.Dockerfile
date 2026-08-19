FROM golang:alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN go build -o dist/core cmd/core/main.go

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/dist/core /app/core

EXPOSE 8080
ENV PORT=8080
CMD ["/app/core"]
