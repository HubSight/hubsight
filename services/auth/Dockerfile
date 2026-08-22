FROM golang:1.25-alpine AS builder
WORKDIR /app
COPY go.work ./
COPY services/ ./services/
RUN cd services/auth && go mod download || true
WORKDIR /app/services/auth
RUN go build -o /app/dist/auth main.go

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/dist/auth /app/auth
EXPOSE 8081
ENV PORT=8081
CMD ["/app/auth"]
