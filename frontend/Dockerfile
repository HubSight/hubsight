FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
# Nginx config is mounted at runtime via docker-compose, or copied here.
# Since nginx conf is in deploy/nginx/cctv.conf (at monorepo root), we will rely on docker-compose volume or copy it from context.
# Wait, the docker-compose context is going to be ./frontend, so it cannot access deploy/nginx.
# So I should change how nginx conf is applied, or copy the conf into frontend/.
# Let's just remove the COPY deploy/nginx line here, and use a docker-compose volume mount for it.

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
