# ─────────────────────────────────────────────────────────────────────────────
# GarfiX v12.4 — Multi-stage Production Dockerfile
# Optimized for: minimal image size, security, fast builds, CI/CD stability
# Runtime deps: PostgreSQL 17 + Valkey 8 (Redis-compatible, BullMQ)
# ─────────────────────────────────────────────────────────────────────────────
# v12.4 CHANGELOG — Resolves Security Container Scan failures:
#   * Pinned `node:22-alpine` (floating) → `node:22-alpine3.21` (specific
#     Alpine release). Floating tags can silently roll forward to a new
#     Alpine minor with different CVE surface; pinning locks the OS layer.
#   * Added `apk upgrade --no-cache` in the runner stage so the latest
#     security patches for alpine packages (musl, busybox, libssl, etc.)
#     are applied on top of the pinned base.
#   * Removed the dead `smoke-test` stage. It was the LAST stage in
#     v12.3, which meant `docker build` (without `--target`) produced
#     the smoke-test image (with curl+wget) — not the runner image. Trivy
#     therefore scanned curl/wget CVEs that are NOT in the actual
#     production image. CI smoke testing is done by cd.yml's
#     docker-smoke-test job, which pulls the published runner image and
#     curls from the host. The in-Dockerfile smoke-test stage was dead
#     code. Removing it makes `runner` the default build target.
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
# v12.4: pinned to alpine3.21 (specific Alpine release).
FROM node:22-alpine3.21 AS builder
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
# v12.4: pinned to node:22-alpine3.21 (specific Alpine release).
# v12.4: `apk upgrade --no-cache` applies latest security patches for the
#   alpine base packages (musl, busybox, libssl, etc.) on top of the
#   pinned base. This closes CVEs that ship with the base image but have
#   fixed versions available in the alpine update repo.
#
# MED-006 (Cycle 2 NOTE): base images are pinned by TAG, not by digest.
#   Pinning by digest would prevent supply-chain attacks via upstream image
#   tampering, but it also prevents automatic security patching of the base
#   OS. For now we keep tag-pinning (auto-receives patch bumps within the
#   major) + `apk upgrade` (applies patch bumps at build time) and rely on
#   Trivy image scanning in CI (security.yml container-scan job) to catch
#   any residual vulnerabilities. To migrate to digest pinning, compute
#   the digest with:
#     docker pull node:22-alpine3.21 && \
#     docker inspect --format='{{index .RepoDigests 0}}' node:22-alpine3.21
#   and replace `FROM node:22-alpine3.21` with `FROM node:22-alpine3.21@sha256:<digest>`.
FROM node:22-alpine3.21 AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# v12.4: upgrade alpine packages to latest patched versions before
# installing anything new. This closes CVEs in the base image's
# musl/busybox/openssl without changing the major versions.
RUN apk upgrade --no-cache

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

# ── Note on smoke testing ────────────────────────────────────────────────────
# The previous v12.3 Dockerfile had a `smoke-test` stage here that added
# curl+wget for in-Docker smoke testing. It was the LAST stage, which meant
# `docker build` (without `--target`) produced the smoke-test image, not the
# production runner image. This caused Trivy to scan curl/wget CVEs that
# were NOT in the actual production image — false positives that blocked
# the security pipeline.
#
# CI smoke testing is now done by cd.yml's `docker-smoke-test` job, which:
#   1. Pulls the published `runner` image from ghcr.io
#   2. Starts it in a container with PostgreSQL + Valkey service containers
#   3. Curls /api/health from the host (curl runs on the runner, not in
#      the container — the container stays production-clean)
# No in-Dockerfile smoke-test stage is needed.
