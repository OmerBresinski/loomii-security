#!/usr/bin/env bash
set -euo pipefail

# Navigate to monorepo root
cd "$(dirname "$0")/.."

echo "Running database migrations..."

# Run Prisma migrations from the db package
cd packages/db
bunx prisma migrate deploy

echo "Migrations completed successfully."
