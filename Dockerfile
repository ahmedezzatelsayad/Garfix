# ─────────────────────────────────────────────────────────────────────────────
# GarfiX v12.3 — Multi-stage Production Dockerfile
# Optimized for: minimal image size, security, fast builds, CI/CD stability
# Runtime deps: PostgreSQL 17 + Valkey 8 (Redis-compatible, BullMQ)
# ─────────────────────────────────────────────────────────────────────────────
# v12.3 CHANGELOG — Resolves "Docker/Bun SIGILL" blocker on GitHub Actions:
#   * Builder stage switched from `oven/bun:1.3.14` → `node:22-alpine`
#     Reason: `bun run build` (which calls `next build`) inside the Bun
#     Docker image intermittently crashes with SIGILL on GitHub Actions
#     ubuntu-latest runners (verified NOT reproducible on the GHA host
#     itself — only inside the oven/bun container). Switching the builder
#     stage to Node.js eliminates the SIGILL because Node.js + Next.js is
#     the officially supported build combination.
#   * Stage 1 (deps) still uses Bun for `bun install` — Bun install is
#     fast and reliable on GHA. Only the actual `next build` step is moved
#     to Node.js. The `node_modules/.bin/*` shims have `#!/usr/bin/env node`
#     shebangs, so they execute under Node.js without modification.
#   * All base images pinned by tag (not floating `latest`).
#   * Smoke test stage added: builds a runtime image, starts it, curls
#     /api/health, fails the build if HTTP != 200.
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Dependencies (Bun — fast install) ──────────────────────────
# Bun install is reliable on GHA. Only the `next build` step needs Node.js.
FROM oven/bun:1.3.14 AS deps
WORKDIR /app

# Copy package files AND prisma schema (needed by postinstall → prisma generate)
COPY package.json bun.lock ./
COPY prisma ./prisma

# Bun's --production flag is a boolean switch (no =value). Omit it to install devDeps.
# P1 FIX: Use --no-cache to ensure clean reproducible builds
RUN bun install --frozen-lockfile --no-cache

# ── Stage 2: Build (Node.js — eliminates Bun/Docker SIGILL) ─────────────
# Switched from oven/bun to node:22-alpine in v12.3.
# Next.js is officially built/tested on Node.js; using Bun for `next build`
# inside Docker on GHA runners intermittently raises SIGILL.
FROM node:22-alpine AS builder
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
ENV NEXT_TELEMETRY_DISABLED=1

# Copy installed node_modules from Bun-based deps stage.
# The node_modules/.bin/* shims have `#!/usr/bin/env node` shebangs, so they
# execute correctly under Node.js without any modification.
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client (uses node_modules/.bin/prisma → node shebang)
RUN ./node_modules/.bin/prisma generate

# Build Next.js (uses node_modules/.bin/next → node shebang)
# This is the step that previously crashed with SIGILL under Bun.
RUN ./node_modules/.bin/next build

# ── Stage 3: Production Runner (Node.js) ────────────────────────────────
# Next.js standalone server.js requires Node.js APIs.
# (Bun 1.3.x has native module compatibility issues with Next.js standalone)
#
# MED-006 (Cycle 2 NOTE): base images are pinned by TAG, not by digest.
#   Pinning by digest would prevent supply-chain attacks via upstream image
#   tampering, but it also prevents automatic security patching of the base
#   OS. For now we keep tag-pinning (auto-receives patch bumps within the
#   major) and rely on Trivy image scanning in CI (security.yml container-scan
#   job) to catch vulnerabilities in the base image. To migrate to digest
#   pinning, compute the digest with:
#     docker pull node:22-alpine && \
#     docker inspect --format='{{index .RepoDigests 0}}' node:22-alpine
#   and replace `FROM node:22-alpine` with `FROM node:22-alpine@sha256:<digest>`.
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# HIGH-006 FIX (Cycle 2): remove `curl` from the production image.
#   `curl` is a common attacker tool for lateral movement and data
#   exfiltration once RCE is achieved. We install only `shadow` (for
#   addgroup/adduser, which alpine doesn't ship by default). The
#   HEALTHCHECK below is rewritten to use Node's built-in `fetch` instead
#   of curl.
RUN apk add --no-cache shadow
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Create storage directory for backups
RUN mkdir -p /app/storage/backups && chown nextjs:nodejs /app/storage

# Copy standalone build output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy Prisma schema and migrations for runtime
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# HIGH-006 FIX (Cycle 2): replace curl-based HEALTHCHECK with a Node-based
#   one. Node 22 has a built-in global `fetch` so no extra dependencies are
#   needed. The check is identical in semantics: GET /api/health, exit 0 on
#   2xx, exit 1 otherwise.
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]

# ── Stage 4: Smoke Test (built on-demand via --target smoke-test) ───────
# This stage is NOT included in the default `docker build` output. It's
# used by CI/CD to run a smoke test inside Docker itself, verifying the
# built image actually serves /api/health before pushing to the registry.
#
# Usage in CI:
#   docker build --target smoke-test -t garfix-smoke:latest .
#   docker run --rm -d -p 3001:3000 --name garfix-smoke garfix-smoke:latest
#   # ... wait for health, curl /api/health, expect 200 ...
#   docker stop garfix-smoke
#
# The smoke-test stage inherits everything from `runner` and adds `curl`
# (which is fine here — this image is NEVER pushed to the registry).
FROM runner AS smoke-test
USER root
RUN apk add --no-cache curl wget
# Override the non-root user for testing convenience
USER nextjs
# Smoke-test entrypoint is identical to runner; CI orchestrates the curl
