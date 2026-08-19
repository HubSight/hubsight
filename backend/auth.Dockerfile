FROM golang:alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN go build -o dist/auth cmd/auth/main.go

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/dist/auth /app/auth

EXPOSE 8081
ENV PORT=8081
CMD ["/app/auth"]
