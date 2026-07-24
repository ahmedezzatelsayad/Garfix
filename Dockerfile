# ─────────────────────────────────────────────────────────────────────────────
# GarfiX v12 — Multi-stage Production Dockerfile
# Optimized for: minimal image size, security, fast builds
# Runtime deps: PostgreSQL 17 + Valkey 8 (Redis-compatible, BullMQ)
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Dependencies ────────────────────────────────────────────────
FROM oven/bun:1.3.14 AS deps
WORKDIR /app

# Copy package files AND prisma schema (needed by postinstall → prisma generate)
COPY package.json bun.lock ./
COPY prisma ./prisma

# Bun's --production flag is a boolean switch (no =value). Omit it to install devDeps.
# P1 FIX: Use --no-cache to ensure clean reproducible builds
RUN bun install --frozen-lockfile --no-cache

# ── Stage 2: Build ──────────────────────────────────────────────────────
FROM oven/bun:1.3.14 AS builder
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

RUN bun run db:generate
RUN bun run build

# ── Stage 3: Production ─────────────────────────────────────────────────
# Use Node.js for runtime — Next.js standalone server.js requires Node.js APIs
# (Bun 1.3.x has native module compatibility issues with Next.js standalone)
#
# MED-006 (Cycle 2 NOTE): base images are pinned by TAG, not by digest.
#   Pinning by digest would prevent supply-chain attacks via upstream image
#   tampering, but it also prevents automatic security patching of the base
#   OS. For now we keep tag-pinning (auto-receives patch bumps within the
#   major) and rely on Trivy image scanning in CI (to be added in a future
#   cycle) to catch vulnerabilities in the base image. To migrate to digest
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
