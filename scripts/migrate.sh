#!/usr/bin/env bash
set -euo pipefail

echo "Running database migrations..."

# Run Prisma migrations from the db package
cd "$(dirname "$0")/.."
bunx --filter @loomii/db prisma migrate deploy

echo "Migrations completed successfully."
