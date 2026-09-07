#!/bin/sh
set -e

# Run this inside a container with golang-migrate or natively.
: "${DATABASE_URL:?DATABASE_URL must be set}"

echo "Migrating DB..."
migrate -path services/backend/migrations -database "$DATABASE_URL" up
