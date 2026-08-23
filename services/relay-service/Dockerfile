# syntax=docker/dockerfile:1.7
FROM node:24-alpine AS builder

WORKDIR /app

# Install ts-proto and grpc tools
RUN apk add --no-cache protoc

COPY services/relay-service/package.json services/relay-service/package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm install

COPY services/relay-service .
COPY services/shared/proto ./proto

# We do not strictly need to generate ts files if we use @grpc/proto-loader,
# but using ts-proto provides type safety. Let's install it and generate.
RUN npm install -g ts-proto && \
    mkdir -p src/pb && \
    protoc --plugin=protoc-gen-ts_proto=$(which protoc-gen-ts_proto) \
           --ts_proto_out=src/pb \
           --ts_proto_opt=nestJs=true \
           -I=./proto ./proto/*.proto

RUN npm run build

FROM node:24-alpine AS runner

WORKDIR /app

COPY services/relay-service/package.json services/relay-service/package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm install --omit=dev

COPY --from=builder /app/dist ./dist
# Also copy the raw proto files just in case @grpc/proto-loader needs them at runtime
COPY --from=builder /app/proto ./proto

EXPOSE 3001
ENV PORT=3001
ENV NODE_ENV=production

CMD ["node", "dist/main.js"]
