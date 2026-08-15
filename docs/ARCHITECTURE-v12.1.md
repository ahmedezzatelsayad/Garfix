# GarfiX EOS v12.1 — Architecture & Deployment Guide

## 📋 Table of Contents

1. [Overview](#overview)
2. [Architecture Changes (v12.1)](#architecture-changes-v121)
3. [Database Configuration](#database-configuration)
4. [Runtime Bootstrap System](#runtime-bootstrap-system)
5. [Build vs Runtime Separation](#build-vs-runtime-separation)
6. [Development Setup](#development-setup)
7. [CI/CD Pipeline](#cicd-pipeline)
8. [Deployment](#deployment)
9. [Troubleshooting](#troubleshooting)

---

## Overview

GarfiX EOS v12.1 is a multi-tenant SaaS ERP/Invoicing platform built with:

- **Framework**: Next.js 16.2.10 with App Router
- **Runtime**: Bun
- **Database**: PostgreSQL (unified across all environments)
- **ORM**: Prisma 6.x
- **Queue**: BullMQ with Valkey (Redis-compatible)
- **UI**: shadcn/ui + Tailwind CSS 4

### Key Features

- Multi-tenant company management
- AI-powered invoice processing
- Queue-based background jobs (email, WhatsApp, backup, scheduler)
- Real-time mission control dashboard
- RTL Arabic support

---

## Architecture Changes (v12.1)

### Problem Statement

**Previous Issues (v12.0):**
1. ❌ Build failed in CI/CD: `Error code 14: Unable to open the database file`
2. ❌ Workers registered at module import time (side effects)
3. ❌ SQLite used as default database (unsuitable for production)
4. ❌ Server Components executing Prisma queries during build

### Solutions Implemented

#### 1. Unified PostgreSQL Provider

```
Before: SQLite (dev) / PostgreSQL (prod) — required manual switch
After:  PostgreSQL (all environments) — single configuration
```

**Files Changed:**
- `prisma/schema.prisma` — Switched to PostgreSQL datasource
- `.env` — Updated DATABASE_URL format
- `.env.example` — Created with environment-specific examples

#### 2. Import Side-Effect Removal

**Anti-Pattern Removed:**
```typescript
// ❌ BEFORE (caused build failures)
// aiProductMatchWorker.ts
registerAIProductMatchWorker(); // Executed on import!

// startupCheck.ts
import "./workers/aiProductMatchWorker"; // Triggered side effect
```

**New Pattern:**
```typescript
// ✅ AFTER (explicit bootstrap)
// aiProductMatchWorker.ts
export function registerAIProductMatchWorker(): void {
  // Registration logic only, no auto-execution
}

// src/runtime/bootstrap.ts
export async function bootstrapRuntime() {
  registerAIProductMatchWorker(); // Only when explicitly called
  await recoverPendingJobs();
}
```

**Files Modified:**
- `src/lib/workers/aiProductMatchWorker.ts` — Removed module-level call
- `src/lib/workers/emailWorker.ts` — Removed module-level call
- `src/lib/workers/whatsappWorker.ts` — Removed module-level call
- `src/lib/workers/backupWorker.ts` — Removed module-level call
- `src/lib/workers/schedulerWorker.ts` — Removed module-level call
- `src/lib/startupCheck.ts` — Removed all worker imports

#### 3. Mission Control Refactoring

**Before:** Server Component with Prisma queries at module level → Build failures
**After:** Client Component fetching from API Route → Build-safe

**Files Created:**
- `src/app/api/founder-panel/mission-control/route.ts` — API endpoint
- `src/app/founder-panel/mission-control/page.tsx` — Client Component

#### 4. Runtime Bootstrap System

**New Architecture:**
```
next start
    │
    ▼
instrumentation.ts (Next.js entry point)
    │
    ▼
bootstrapRuntime()
    │
    ├── registerEmailWorker()
    ├── registerWhatsAppWorker()
    ├── registerBackupWorker()
    ├── registerAIProductMatchWorker()
    ├── registerSchedulerWorker() (last)
    │
    └── recoverPendingJobs()
```

**Files Created:**
- `src/runtime/bootstrap.ts` — Explicit runtime initialization
- `src/instrumentation.ts` — Next.js server entry point

---

## Database Configuration

### Environment Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `DATABASE_URL` | Application connection (with pooling) | `postgresql://user:pass@host:5432/db?schema=public&connection_limit=20` |
| `DATABASE_DIRECT_URL` | Direct connection (for migrations) | `postgresql://user:pass@host:5432/db` |

### Development (Docker Compose)

```bash
# Start services
docker compose up -d postgres valkey

# Set environment
DATABASE_URL="postgresql://garfix:garfix_strong_pass_change_me@postgres:5432/garfix?schema=public"
DATABASE_DIRECT_URL="postgresql://garfix:garfix_strong_pass_change_me@postgres:5432/garfix"
VALKEY_URL="valkey://valkey:6379"

# Run migrations
bun run db:deploy

# Start dev server
bun run dev
```

### Production (Neon/RDS/Supabase)

```bash
# Neon Serverless
DATABASE_URL="postgresql://user:pass@ep-xxx.region.neon.tech/garfix?sslmode=require&schema=public"

# AWS RDS
DATABASE_URL="postgresql://master:pass@garfix-prod.xxxxxx.region.rds.amazonaws.com:5432/garfix?schema=public"
```

---

## Runtime Bootstrap System

### Entry Points

| File | When It Runs | Purpose |
|------|-------------|---------|
| `src/instrumentation.ts` | `next start` only | Server lifecycle hooks |
| `src/runtime/bootstrap.ts` | Called by instrumentation | Worker registration |

### Worker Registration Order

1. **Email Worker** — Transactional emails (OTP, welcome, tickets)
2. **WhatsApp Worker** — WhatsApp Business API messages
3. **Backup Worker** — Automated database backups
4. **AI Product Match Worker** — AI invoice resolution
5. **Scheduler Worker** — Periodic tasks (registered LAST)

> ⚠️ Scheduler is registered last because it may immediately enqueue jobs to other workers.

### Manual Bootstrap (for testing)

```typescript
import { bootstrapRuntime } from '@/runtime/bootstrap';

const result = await bootstrapRuntime();
console.log(result);
// {
//   success: true,
//   workersRegistered: ['email', 'whatsapp', 'backup', 'ai-product-match', 'scheduler'],
//   jobsRecovered: 5,
//   errors: [],
//   durationMs: 123
// }
```

---

## Build vs Runtime Separation

### What Runs During Build (`next build`)

✅ **Safe Operations:**
- TypeScript compilation
- Component tree analysis
- Static page generation (for non-dynamic pages)
- Asset optimization
- Prisma client generation

❌ **Never During Build:**
- Prisma queries (moved to API routes)
- Worker registration (moved to bootstrap)
- Database connections
- Queue connections
- External service calls

### What Runs During Runtime (`next start`)

✅ **Runtime Only:**
- `instrumentation.ts` → `bootstrapRuntime()` → Worker registration
- API route handlers (Prisma queries)
- Queue job processing
- Scheduled tasks

---

## Development Setup

### Prerequisites

- Bun >= 1.0
- Docker & Docker Compose (for local services)
- Node.js >= 20 (for some tooling)

### Quick Start

```bash
# 1. Clone repository
git clone https://github.com/ahmedezzatelsayad/Garfix.git
cd Garfix

# 2. Install dependencies
bun install

# 3. Copy environment template
cp .env.example .env

# 4. Start infrastructure services
docker compose up -d postgres valkey

# 5. Generate Prisma client
bun run db:generate

# 6. Push schema to database
bun run db:push

# 7. Seed database (optional)
bun run seed

# 8. Start development server
bun run dev
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `bun run dev` | Start development server (port 3000) |
| `bun run build` | Production build |
| `bun run start` | Start production server |
| `bun run lint` | Run ESLint |
| `bun test` | Run unit tests |
| `bun run db:generate` | Generate Prisma client |
| `bun run db:push` | Push schema changes |
| `bun run db:migrate` | Create new migration |
| `bun run seed` | Seed database with sample data |

---

## CI/CD Pipeline

### Workflow: `.github/workflows/ci.yml`

```
Push/PR to main/develop
         │
         ▼
┌─────────────────────────────────────┐
│  Job 1: Lint                       │ ← Runs first (no dependencies)
│  - ESLint on src/app, src/lib      │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  Job 2: Type Check                 │ ← Parallel with Lint
│  - tsc --noEmit (production code)  │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  Job 3: BUILD (Critical Gate)       │ ← Needs Lint + TypeCheck
│  - next build                      │ ← No DB service needed!
│  - Architecture compliance check   │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  Job 4: Unit Tests                 │ ← Needs Build + PostgreSQL
│  - Core module tests               │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  Job 5: Integration Tests           │ ← Needs Build + PostgreSQL
│  - API endpoint tests              │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  Job 6: CI Summary                 │ ← Aggregates all results
│  - Pass/Fail status                │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  Job 7: Deploy (main branch only)   │ ← Needs all green
│  - Staging deployment              │
└─────────────────────────────────────┘
```

### Key CI Features

1. **PostgreSQL Service**: All test jobs use `postgres:16-alpine`
2. **Architecture Compliance**: Build job checks for:
   - No module-level worker registration
   - No worker imports in `startupCheck.ts`
3. **No DB for Build**: Build succeeds without database (new!)

---

## Deployment

### Vercel (Recommended)

```json
// vercel.json
{
  "buildCommand": "bun run build",
  "installCommand": "bun install",
  "framework": "nextjs",
  "functions": {
    "src/app/api/**/*.ts": {"maxDuration": 60},
    "src/app/api/ai/**/*.ts": {"maxDuration": 120}
  }
}
```

**Environment Variables Required:**
- `DATABASE_URL` — PostgreSQL connection string
- `DATABASE_DIRECT_URL` — Direct connection for migrations
- `JWT_SECRET` — >= 32 characters
- `JWT_REFRESH_SECRET` — Different from JWT_SECRET
- `FOUNDER_EMAIL` — Admin email
- `VALKEY_URL` — Valkey/Redis URL

### Docker Production

```bash
# Build and run with Docker Compose
docker compose up -d app

# Services started:
# - postgres:17-alpine (database)
# - valkey:8.1 (queue backend)
# - garfix-app (application)
```

### Manual Deployment

```bash
# 1. Build
bun run build

# 2. Start production server
NODE_ENV=production bun .next/standalone/server.js
```

---

## Troubleshooting

### Build Fails with Database Error

**Symptom:** `Error code 14: Unable to open the database file`

**Cause:** Code still has import-time side effects that try to connect to DB.

**Solution:**
```bash
# Check for side effects
grep -rn "register.*Worker()" src/lib/workers/
grep -rn "from.*workers/" src/lib/startup.ts

# All should be commented out or removed
# Workers should only be registered via bootstrapRuntime()
```

### Workers Not Processing Jobs

**Symptom:** Jobs stuck in "pending" status

**Cause:** `bootstrapRuntime()` not called.

**Solution:**
1. Check if `instrumentation.ts` exists and exports `register()`
2. Verify server was started with `next start` (not just `next build`)
3. Check logs for "[bootstrap]" messages

### PostgreSQL Connection Issues

**Symptom:** `ECONNREFUSED` or `password authentication failed`

**Solutions:**
1. Ensure PostgreSQL is running: `docker compose ps`
2. Check credentials in `.env` match `docker-compose.yml`
3. Verify network connectivity from app to postgres

### Migration Errors

**Symptom:** `There is a pending migration`

**Solution:**
```bash
# Reset and re-migrate (dev only!)
bun run db:reset

# Or deploy existing migrations
bun run db:deploy
```

---

## Side-Effect Audit Checklist

Before committing code, verify no new side effects were introduced:

```bash
# Find potential side effects
grep -rn "^[^/]*(" src/lib/workers/*.ts | grep -E "(registerWorker|recoverPending|\.start\(\))"

# These should NEVER appear at module level (outside functions):
# ❌ new PrismaClient()
# ❌ registerWorker()
# ❌ recoverPendingJobs()
# ❌ scheduler.start()
# ❌ cron.start()
# ❌ setInterval()
# ❌ setTimeout()
# ❌ process.on(...)
# ❌ app.listen(...)
# ❌ queue.process(...)
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| v12.1 | 2025-01 | Architecture overhaul: PostgreSQL unified, side-effect removal, bootstrap system |
| v12.0 | 2025-01 | Initial release with multi-tenancy, AI processing, queue system |

---

## Support

For issues or questions:
1. Check this documentation
2. Review CI/CD logs for build errors
3. Check `/api/startup-check` health endpoint
4. Open issue on GitHub repository
