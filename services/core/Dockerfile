FROM golang:1.25-alpine AS builder
WORKDIR /app
COPY go.work ./
COPY services/ ./services/
RUN cd services/core && go mod download || true
WORKDIR /app/services/core
RUN go build -o /app/dist/core main.go

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/dist/core /app/core
EXPOSE 8080
ENV PORT=8080
CMD ["/app/core"]
