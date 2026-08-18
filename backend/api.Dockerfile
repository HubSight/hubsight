FROM golang:alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN go build -o dist/api cmd/api/main.go

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/dist/api /app/api

EXPOSE 8080
CMD ["/app/api"]
