#!/usr/bin/env bash
set -e

OUTPUT="${1:-dist}"
SERVICES=(
  "./services/auth"
  "./services/core"
  "./services/gateway"
  "./services/pool"
  "./services/push"
  "./services/recorder"
  "./services/bgrd"
  "./services/hawkeyes"
)

echo "Building Go services into '$OUTPUT/'..."
mkdir -p "$OUTPUT"
go build -o "$OUTPUT/" "${SERVICES[@]}"
echo "Build completed successfully. Binaries saved to '$OUTPUT/'."

