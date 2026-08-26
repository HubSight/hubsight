# syntax=docker/dockerfile:1.7
FROM node:24-alpine AS builder

WORKDIR /app

# Enable pnpm via corepack & install protoc for gRPC proto compilation
ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV CI=true
RUN corepack enable && corepack prepare pnpm@latest --activate && \
    apk add --no-cache protoc

COPY services/relay/package.json services/relay/pnpm-lock.yaml* services/relay/pnpm-workspace.yaml* services/relay/.npmrc* ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY services/relay .
COPY services/shared/proto ./proto

# Generate TypeScript definitions from proto files using ts-proto
RUN mkdir -p src/pb && \
    protoc --plugin=./node_modules/.bin/protoc-gen-ts_proto \
           --ts_proto_out=src/pb \
           --ts_proto_opt=nestJs=true \
           -I=./proto ./proto/*.proto

RUN pnpm run build

FROM node:24-alpine AS runner

WORKDIR /app

ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY services/relay/package.json services/relay/pnpm-lock.yaml* services/relay/pnpm-workspace.yaml* services/relay/.npmrc* ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --prod --frozen-lockfile

COPY --from=builder /app/dist ./dist
# Also copy the raw proto files just in case @grpc/proto-loader needs them at runtime
COPY --from=builder /app/proto ./proto

EXPOSE 3001
ENV PORT=3001
ENV NODE_ENV=production

CMD ["node", "dist/main.js"]
