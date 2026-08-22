# Stage 1: Build Frontend (React/Vite)
FROM node:20-alpine AS frontend-builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY webapp/package.json webapp/pnpm-lock.yaml* webapp/pnpm-workspace.yaml* webapp/.npmrc* ./
RUN pnpm install --no-frozen-lockfile
COPY webapp/ .
COPY .git/ ./.git/
RUN pnpm run build

# Stage 2: Build Backend API Gateway (Go)
FROM golang:1.25-alpine AS backend-builder
WORKDIR /app
COPY go.work ./
COPY services/ ./services/
WORKDIR /app/services/gateway
RUN go build -o /app/dist/gateway main.go

# Stage 3: Final Production Image
FROM alpine:latest
WORKDIR /app

# Copy the compiled Go binary
COPY --from=backend-builder /app/dist/gateway /app/gateway

# Copy the compiled Frontend static files into /app/public
COPY --from=frontend-builder /app/dist /app/public

EXPOSE 8080
ENV PORT=8080
CMD ["/app/gateway"]
