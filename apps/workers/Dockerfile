# ============================================
# Stage 1: Install + Build (validation)
# ============================================
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy root workspace files first for dependency caching
COPY package.json bun.lock turbo.json ./

# Copy all package.json files for workspace resolution
COPY apps/api/package.json ./apps/api/
COPY apps/workers/package.json ./apps/workers/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/
COPY packages/queue/package.json ./packages/queue/

# Install all dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build (validates workspace resolution)
RUN bunx turbo build --filter=@loomii/workers...

# ============================================
# Stage 2: Production runtime
# ============================================
FROM oven/bun:1-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 loomii && \
    adduser --system --uid 1001 loomii

# Copy workspace config
COPY --from=builder /app/package.json ./
COPY --from=builder /app/bun.lock ./
COPY --from=builder /app/turbo.json ./

# Copy source code (without node_modules - they'll be reinstalled)
COPY --from=builder /app/apps/workers/package.json ./apps/workers/package.json
COPY --from=builder /app/apps/workers/tsconfig.json ./apps/workers/tsconfig.json
COPY --from=builder /app/apps/workers/src ./apps/workers/src
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/packages/db/package.json ./packages/db/package.json
COPY --from=builder /app/packages/db/src ./packages/db/src
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/packages/shared/src ./packages/shared/src
COPY --from=builder /app/packages/queue/package.json ./packages/queue/package.json
COPY --from=builder /app/packages/queue/src ./packages/queue/src
COPY --from=builder /app/tooling ./tooling

# Install dependencies fresh (creates correct symlinks for this container)
RUN bun install --frozen-lockfile

USER loomii

# Workers are background processes - no port exposed
# Graceful shutdown via SIGTERM
STOPSIGNAL SIGTERM

CMD ["bun", "run", "apps/workers/src/index.ts"]
