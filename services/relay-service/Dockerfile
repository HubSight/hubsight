# syntax=docker/dockerfile:1.7
FROM node:24-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm install

COPY . .
RUN npm run build

FROM node:24-alpine AS runner

WORKDIR /app

COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm install --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 3001
ENV PORT=3001
ENV NODE_ENV=production

CMD ["node", "dist/main.js"]
