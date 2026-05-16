# ============================================
# Stage 1: Install + Build (validation)
# ============================================
FROM oven/bun:1.2 AS builder

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
RUN bunx turbo build --filter=@loomii/api...

# ============================================
# Stage 2: Production runtime
# ============================================
FROM oven/bun:1.2-slim AS runner

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
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/tsconfig.json ./apps/api/tsconfig.json
COPY --from=builder /app/apps/api/src ./apps/api/src
COPY --from=builder /app/apps/workers/package.json ./apps/workers/package.json
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

EXPOSE 3000

# Health check
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD bun -e "fetch('http://localhost:3000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["bun", "run", "apps/api/src/index.ts"]
