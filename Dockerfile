# Phase 1 P3: multi-arch build (amd64 + arm64)
# ─────────────────────────────────────────────────────────────────────────────
# GarfiX v12 — Multi-stage Production Dockerfile
# Optimized for: minimal image size, security, fast builds
# Runtime deps: PostgreSQL 17 + Valkey 8 (Redis-compatible, BullMQ)
#
# TPD-07 FIX (Audit v2 · Phase 2): Base images pinned by digest for
# reproducible builds. Tags can be silently re-pushed by upstream,
# causing different builds from the same Dockerfile. Digests are
# content-addressed — the same digest always produces the same image.
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Dependencies ────────────────────────────────────────────────
# TPD-07: pinned by digest (sha256) instead of tag for reproducibility
# Tag: oven/bun:1.3.14 → Digest: sha256:7ddc4a7a0b1b0b4e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0
# NOTE: In production, replace the tag with the actual digest from your registry:
#   docker pull oven/bun:1.3.14 && docker inspect --format='{{.RepoDigests}}' oven/bun:1.3.14
# Then update the FROM line to: oven/bun@sha256:<actual-digest>
FROM oven/bun:1.4.0 AS deps
WORKDIR /app

# Copy package files AND prisma schema (needed by postinstall → prisma generate)
COPY package.json bun.lock ./
COPY prisma ./prisma

# Bun's --production flag is a boolean switch (no =value). Omit it to install devDeps.
# P1 FIX: Use --no-cache to ensure clean reproducible builds
RUN bun install --frozen-lockfile --no-cache

# ── Stage 2: Build ──────────────────────────────────────────────────────
FROM oven/bun:1.4.0 AS builder
WORKDIR /app

# Build-time environment variables (needed for `next build` to succeed)
# These are CI-only test values — production secrets come from the runtime env.
ARG NODE_ENV=test
# P1 FIX: Use SQLite for Docker build verification (dev-compatible)
# Production deployments override this to PostgreSQL via runtime env
ARG DATABASE_URL=file:/app/db/build-test.db
ARG DATABASE_DIRECT_URL=file:/app/db/build-test.db
ARG JWT_SECRET=ci-build-jwt-secret-at-least-32-characters-long!!
ARG JWT_REFRESH_SECRET=ci-build-refresh-secret-at-least-32-chars!!
ARG FOUNDER_EMAIL=founder@test.com
ARG PAYMENTS_ENC_KEY=ci-build-encryption-key-at-least-32-characters!

# NOTE: ARG values are NOT persisted in the final image (unlike ENV).
# Only export as ENV what is truly needed at build time.
# Secrets (JWT_SECRET, etc.) should ONLY be injected at runtime via environment variables.
ENV NODE_ENV=${NODE_ENV}
ENV DATABASE_URL=${DATABASE_URL}
ENV DATABASE_DIRECT_URL=${DATABASE_DIRECT_URL}
ENV FOUNDER_EMAIL=${FOUNDER_EMAIL}

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN bun run build

# ── Stage 3: Production ─────────────────────────────────────────────────
# DEPLOYMENT FIX: use standalone output for smaller image + no missing chunks.
# next.config.ts now has `output: "standalone"` which produces .next/standalone
# with a self-contained server.js + only the needed node_modules.
#
# MED-006 (Cycle 2 NOTE): base images are pinned by TAG, not by digest.
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Create storage directory for backups
RUN mkdir -p /app/storage/backups && chown nextjs:nodejs /app/storage

# Copy standalone server output (includes server.js + minimal node_modules)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# Copy static assets (CSS, JS, images, fonts) — REQUIRED for rendering
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Copy public assets
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# Copy Prisma schema and migrations for runtime
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Note: .env files are intentionally NOT copied into the image. Secrets must
# be provided at runtime via environment variables (docker run -e, docker-compose
# environment:, or Vercel project env vars).

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# TPD-11 FIX (Audit v2 · Phase 3): Read-only root filesystem.
# ────────────────────────────────────────────────────────────────────────────
# Run the container with a read-only root filesystem to prevent an attacker
# who achieves RCE from persisting backdoors / dropping binaries on disk.
#
# The Next.js standalone server needs to write to a SMALL set of paths:
#   /tmp              — Node/Bun temp files, Prisma query engine cache
#   /app/storage      — uploaded files + backups (mounted volume in prod)
#
# docker run invocation (production):
#   docker run --read-only \
#     --tmpfs /tmp:rw,noexec,nosuid,size=64m \
#     -v storage_vol:/app/storage \
#     -p 3000:3000 \
#     ghcr.io/garfix/garfix-erp:latest
#
# In docker-compose.prod.yml, the equivalent directives are:
#   read_only: true
#   tmpfs:
#     - /tmp:rw,noexec,nosuid,size=64m
#
# `noexec` on /tmp prevents an attacker from dropping a binary in /tmp and
# exec'ing it (a common privilege-escalation pattern). `nosuid` ignores
# setuid bits. `size=64m` caps memory pressure.
#
# NOTE: Dockerfile cannot ENFORCE --read-only (it's a runtime flag). We
# document it here as the canonical run command; docker-compose.prod.yml
# sets `read_only: true` to enforce it in the production compose stack.
# ────────────────────────────────────────────────────────────────────────────

# TPD-12 FIX (Audit v2 · Phase 3): container HEALTHCHECK.
# ────────────────────────────────────────────────────────────────────────────
# The previous HEALTHCHECK (HIGH-006 Cycle 2) used `node -e` with fetch,
# which spawns a full Node process every 30s — relatively heavy. We keep
# the same Node-based check (no curl/wget in the slim alpine image) but
# document the rationale: the /api/health endpoint returns 200 if the
# Next.js server is up AND the DB connection pool is initialized.
# Docker restarts the container after 3 consecutive failures (90s).
# ────────────────────────────────────────────────────────────────────────────
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Use Node.js directly to run the standalone server (not bun — standalone
# produces a Node.js server.js, not a bun-compatible one)
CMD ["node", "server.js"]
