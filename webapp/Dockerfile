FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* .npmrc* ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
# Nginx config is mounted at runtime via docker-compose, or copied here.
# Since nginx conf is in deploy/nginx/cctv.conf (at monorepo root), we will rely on docker-compose volume or copy it from context.
# The Docker Compose context can be webapp only, so it cannot access deploy/nginx.
# Copy the config into webapp if this image needs to own the Nginx configuration.
# Let's just remove the COPY deploy/nginx line here, and use a docker-compose volume mount for it.

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
