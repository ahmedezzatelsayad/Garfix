# GarfiX EOS

> Arabic-first, multi-tenant SaaS ERP platform for the MENA region — invoicing, accounting, e-invoicing, AI-powered invoice extraction, and HR in a single Next.js monolith.

[![CI](https://github.com/ahmedezzatelsayad/Garfix/actions/workflows/ci.yml/badge.svg)](https://github.com/ahmedezzatelsayad/Garfix/actions/workflows/ci.yml)
[![E2E Tests](https://github.com/ahmedezzatelsayad/Garfix/actions/workflows/e2e.yml/badge.svg)](https://github.com/ahmedezzatelsayad/Garfix/actions/workflows/e2e.yml)
[![Security Scan](https://github.com/ahmedezzatelsayad/Garfix/actions/workflows/security.yml/badge.svg)](https://github.com/ahmedezzatelsayad/Garfix/actions/workflows/security.yml)
[![Performance](https://github.com/ahmedezzatelsayad/Garfix/actions/workflows/performance.yml/badge.svg)](https://github.com/ahmedezzatelsayad/Garfix/actions/workflows/performance.yml)

**Version:** 12.1.0 · **Runtime:** Next.js 16 (App Router) + Bun 1.3.14 + Node.js 22 · **Database:** PostgreSQL 17 · **License:** Proprietary (no LICENSE file present in repository — see Known Limitations)

---

## Overview

GarfiX is an enterprise-grade ERP designed for Gulf and MENA markets. It combines double-entry accounting, multi-country e-invoicing compliance, AI-assisted invoice extraction, and multi-tenant SaaS billing in a single deployable Next.js application. The codebase is Arabic-first (RTL UI, Arabic labels, Hijri calendar support) with 257 API routes across 18 business domains.

### Key Highlights

- **257 API routes** across accounting, AI, auth, e-invoicing, HR, inventory, and platform admin
- **106 Prisma models** with PostgreSQL Row-Level Security (RLS) for tenant isolation
- **48 migrations** — schema is PostgreSQL-only (SQLite was removed; `db:push` is not used in production)
- **6-stage AI cost-optimization cascade** (Cache → Pattern → Rule → Memory → Budget → LLM) with per-tenant budget gates
- **7 e-invoicing authorities** (SA ZATCA, EG ETA, AE FTA, BH NBR, OM OTA, KW, QA) — 4 with live submission, 3 stubbed pending government API availability
- **14 external integrations** (Stripe, MyFatoorah, Paymob, WhatsApp, Twilio, SendGrid, AWS S3, Meta Ads, + 7 e-invoicing adapters)
- **3-tier queue fallback** (BullMQ + Valkey → pg-boss + PostgreSQL → in-process) with transactional outbox relay
- **Transactional outbox pattern** for at-least-once event delivery with dead-letter handling
- **12 Playwright E2E specs** (~30 test blocks) + 1,736 test files
- **Setup wizard** (OpenCart-style) for zero-config first-boot installation without `.env` editing

### Verified Metrics

| Metric | Value | Evidence | Last Verified |
|--------|------:|----------|---------------|
| API routes | 257 | `find src/app/api -name 'route.ts' \| wc -l` | 2026-08-15 |
| OpenAPI paths | 257 | `docs/api/openapi.yaml` (generated, validated 1:1 with route files) | 2026-08-15 |
| Prisma models | 106 | `grep -c '^model ' prisma/schema.prisma` | 2026-08-15 |
| Migrations | 48 | `ls -d prisma/migrations/*/ \| wc -l` | 2026-08-15 |
| Test files | 1,736 | `find . -name '*.test.ts' -not -path './node_modules/*'` | 2026-08-15 |
| E2E specs | 12 | `find e2e -name '*.spec.ts' \| wc -l` | 2026-08-15 |
| CI/CD workflows | 8 | `ls .github/workflows/*.yml` | 2026-08-15 |
| src/lib files | 1,948 | `find src/lib -name '*.ts' \| wc -l` | 2026-08-15 |
| npm dependencies | 63 + 17 dev | `package.json` dependencies + devDependencies | 2026-08-15 |
| E-invoicing countries | 7 | `src/lib/e-invoicing/router.ts` authority map | 2026-08-15 |

---

## Architecture

```mermaid
graph TB
    subgraph "Client"
        Browser[Browser — React 19 RSC]
    end

    subgraph "Next.js 16 App Router"
        MW[Edge Middleware<br/>CSRF + Security Headers]
        Pages[Pages & Layouts]
        API[257 API Routes]
    end

    subgraph "Business Logic — src/lib/"
        Auth[Auth + JWT + MFA]
        RBAC[RBAC + Permissions]
        Tenant[Tenant Context — ALS]
        Acct[Accounting Engine<br/>Double-Entry + RLS]
        AIFab[AI Fabric<br/>6-Stage Cascade]
        EInv[E-Invoicing<br/>7 Countries]
        Webhook[Webhook System]
    end

    subgraph "Infrastructure"
        DB[(PostgreSQL 17<br/>106 models + RLS)]
        Valkey[(Valkey 8<br/>Cache + Queues + Rate Limit)]
        Outbox[Transactional Outbox]
        Breakers[Circuit Breakers<br/>12 services]
    end

    subgraph "External Services"
        LLM[DeepSeek / Gemini / OpenRouter]
        Pay[Stripe / MyFatoorah / Paymob]
        Gov[ZATCA / ETA / FTA / NBR]
        Storage[S3 / Local Disk]
    end

    Browser --> MW --> Pages
    MW --> API
    API --> Auth & RBAC & Tenant
    API --> Acct & AIFab & EInv & Webhook
    Acct --> DB
    AIFab --> LLM
    AIFab --> Valkey
    EInv --> Gov
    Webhook --> Pay
    Tenant -->|RLS| DB
    API --> Outbox --> Valkey
    API --> Breakers
```

### Runtime Architecture

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Presentation** | Next.js 16 App Router + React 19 | RSC with client-side hydration; `output: "standalone"` for Docker |
| **API** | 257 Route Handlers | Node.js runtime (pinned via `export const runtime = "nodejs"`) |
| **Middleware** | Edge-safe (no Prisma/JWT/Redis) | CSRF double-submit + CSP nonce + security headers only |
| **Business Logic** | `src/lib/` (1,949 files) | Domain modules: accounting, AI, e-invoicing, integrations |
| **Database** | PostgreSQL 17 + Prisma 6.11 | 106 models, 48 migrations, RLS via Prisma `$extends` + AsyncLocalStorage |
| **Cache/Queue** | Valkey 8 (Redis-compatible) | BullMQ queues, L1+L2 cache with pub/sub invalidation, rate limiting |
| **Instrumentation** | `src/instrumentation.ts` | Two-tier startup: blocking DB init + background workers (BullMQ, outbox relay, crons) |

### Multi-Tenancy

Tenant isolation is enforced at the PostgreSQL level via Row-Level Security (RLS):

1. **Tenant resolution:** JWT claim `companies[]` → selected `companySlug` per request
2. **Context propagation:** `AsyncLocalStorage` (`src/lib/tenant-context.ts`) carries the slug through the request lifecycle
3. **Query interception:** Prisma `$extends` interceptor (`src/lib/db.ts`) wraps every query in a `$transaction` that calls `set_config('app.current_company_slug', slug, true)` before execution
4. **Platform admin bypass:** Founder/admin queries set `app.is_platform='on'` to bypass RLS policies
5. **Re-entrancy guard:** `markInTransaction()` prevents nested `$transaction` wrapping (preserves outer atomicity)

**Confidence: High** — verified in `src/lib/db.ts` (Layer 2: `tenantRls` interceptor), `src/lib/tenant-context.ts`, and migration `20260813130000_p1_rls_strict_policies`.

### Authentication & Authorization

```mermaid
sequenceDiagram
    participant U as User
    participant M as Middleware (Edge)
    participant A as /api/auth/login
    participant DB as Database
    participant V as Valkey

    U->>M: POST /api/auth/login {email, password}
    M->>M: CSRF check (exempt for login)
    M->>A: Forward request
    A->>DB: Verify password (bcrypt, auto-rehash)
    A->>DB: Check MFA enabled?
    alt MFA enabled
        A-->>U: 401 (generic — SEC-06 anti-enumeration)
        U->>A: POST /api/auth/login {email, password, mfaCode}
        A->>V: Validate TOTP + rate limit + replay check
    end
    A->>DB: Register session (SessionRegistry + JTI)
    A-->>U: 200 + Set-Cookie (inv_token + inv_refresh + inv_csrf)
```

**Authentication:**
- JWT HS256 (algorithm pinned) with access (30min) + refresh (30d) token split
- HttpOnly + SameSite cookies; `inv_token` (access), `inv_refresh` (refresh), `inv_csrf` (CSRF, JS-readable)
- Refresh-token rotation on every silent refresh
- Token versioning (`tv` claim) invalidates all sessions on password reset / logout-all
- Dual revocation: Valkey blacklist (`token:blacklist:<jti>`) + DB `SessionRegistry` (forensic IP/UA tracking)
- MFA: TOTP RFC 6238 (30s, 6 digits, ±1 window) + 10 recovery codes (128-bit each, SHA-256 hashed, AES-256-GCM encrypted)
- **SEC-06 anti-enumeration:** login returns identical 401 for wrong password / user not found / MFA missing / MFA wrong

**Authorization (RBAC):**
- 16 permissions in `PERMISSION_CATALOG` (`view_invoices`, `create_invoice`, `delete_invoice`, `finance_access`, `e_invoicing_submit`, etc.)
- 4 built-in roles: `viewer` (read-only), `employee` (no delete), `editor` (full CRUD + export), `admin` (all + locked perms)
- 5 locked permissions (`reports_access`, `settings_access`, `finance_access`, `employee_management`, `e_invoicing_submit`) — admin/founder only
- `computeEffectivePermissions()` merges role baseline + per-user overrides (non-locked only)
- Founder identified by `isFounderEmail()` (email match), not role value — protects against role-value changes

**Confidence: High** — verified in `src/lib/auth.ts`, `src/lib/mfa.ts`, `src/lib/permissions.ts`, `src/lib/middleware.ts`.

---

## Technology Stack

| Category | Technology | Version | Evidence |
|----------|-----------|---------|----------|
| **Runtime** | Bun | 1.3.14 | `package.json` engines, `Dockerfile` |
| **Framework** | Next.js | ^16.1.1 | `package.json`, `next.config.ts` |
| **UI** | React | ^19.0.0 | `package.json` |
| **Language** | TypeScript | ^5 | `tsconfig.json` (strict mode) |
| **Database** | PostgreSQL | 17 | `prisma/schema.prisma` provider, `docker-compose.prod.yml` |
| **ORM** | Prisma | 6.11.1 | `package.json`, `prisma/schema.prisma` |
| **Cache/Queue** | Valkey | 8.1 | `docker-compose.prod.yml`, `src/lib/valkey.ts` |
| **Queue lib** | BullMQ | ^6.0.10 | `package.json`, `src/lib/queues.ts` |
| **Auth** | jsonwebtoken + bcryptjs | — | `src/lib/auth.ts` |
| **Validation** | Zod | ^4.0.2 | `package.json`, API route schemas |
| **UI components** | shadcn/ui (new-york) + Radix UI | 27 packages | `components.json`, `package.json` |
| **CSS** | Tailwind CSS | ^4 | `package.json` |
| **E2E testing** | Playwright | ^1.61.1 | `package.json`, `playwright.e2e.config.ts` |
| **AI SDK** | z-ai-web-dev-sdk | ^0.0.18 | `package.json`, `src/lib/aiProvider.ts` |
| **OCR** | tesseract.js | ^7.0.0 | `package.json`, `src/lib/invoice-brain/ocrAdapter.ts` |

---

## Repository Structure

```
garfix/
├── src/
│   ├── app/                        # Next.js App Router (308 files)
│   │   ├── api/                    # 257 route.ts files
│   │   ├── setup/                  # Setup wizard (6-step installer)
│   │   ├── founder-panel/          # Founder-only admin (10 pages)
│   │   └── (dashboard)/            # Authenticated app pages
│   ├── lib/                        # Business logic (1,949 files)
│   │   ├── ai/                     # AI provider routing + key pool (24 files)
│   │   ├── ai-fabric/              # 6-stage cascade gateway (37 files)
│   │   ├── accounting/             # Double-entry journal engine (39 files)
│   │   ├── e-invoicing/            # 7-country e-invoicing adapters (25 files)
│   │   ├── integrations/           # 14 external integrations (23 files)
│   │   ├── invoice-brain/          # OCR + pattern extraction (22 files)
│   │   ├── circuit-breaker/        # 12 per-service breakers
│   │   ├── accessibility/          # WCAG 2.1 AAA focus traps
│   │   ├── setup/                  # Setup wizard config helpers
│   │   ├── auth.ts                 # JWT + session + refresh rotation
│   │   ├── mfa.ts                  # TOTP + recovery codes
│   │   ├── permissions.ts          # RBAC catalog + role defaults
│   │   ├── cryptoVault.ts          # AES-256-GCM encryption at rest
│   │   ├── ssrf.ts                 # DNS-rebinding-resistant fetchSafe
│   │   ├── db.ts                   # Prisma client + RLS extension
│   │   ├── queues.ts               # 3-tier queue (BullMQ → pg-boss → in-process)
│   │   ├── cache.ts                # L1+L2 cache with pub/sub invalidation
│   │   ├── outbox.ts               # Transactional outbox relay
│   │   └── valkey.ts               # Valkey/Redis client
│   ├── components/                 # React components (109 files)
│   │   ├── ui/                     # shadcn/ui (40+ components)
│   │   ├── garfix-ds/              # Design system (GarfixModal, GarfixButton, etc.)
│   │   └── garfix/                 # Custom components (DataTable, ErrorBoundary, etc.)
│   ├── modules/                    # 18 business module views (80 files)
│   ├── hooks/                      # React Query hooks + useAccessibility (26 files)
│   ├── context/                    # AuthContext + BrandContext
│   └── instrumentation.ts          # Server startup (Tier1 blocking + Tier2 background)
├── prisma/
│   ├── schema.prisma               # 106 models, 3,057 lines
│   ├── migrations/                 # 48 migrations
│   └── seed.ts                     # Demo data seeder
├── e2e/                            # 12 Playwright E2E specs
├── scripts/                        # 127 files (seeds, benchmarks, chaos drills, k6)
├── docs/                           # 65 files (architecture, ADRs, audit reports)
├── .github/workflows/              # 8 CI/CD workflows
├── Dockerfile                      # 3-stage build (bun → node:22-alpine)
├── docker-compose.prod.yml         # Self-contained prod stack (postgres + valkey + app)
├── next.config.ts                  # standalone output, serverExternalPackages
└── .env.example                    # 331 lines — full env var reference
```

---

## Quick Start

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| **Bun** | ≥ 1.3.14 | Package manager + runtime |
| **PostgreSQL** | ≥ 17 | Primary database |
| **Valkey** | ≥ 8.1 | Cache + queues + rate limiting (optional for dev) |

### Path A: Setup Wizard (no `.env` needed)

```bash
git clone https://github.com/ahmedezzatelsayad/Garfix.git
cd Garfix
bun install
bunx prisma generate
bun run build
bun run start
```

Open `http://localhost:3000` — the middleware redirects to `/setup` (6-step wizard):
1. Welcome
2. Database configuration (tests connection live)
3. Run migrations
4. Create founder account + company
5. Optional integrations (Stripe, OpenRouter, WhatsApp, Redis, SMTP)
6. Complete (writes `.env` + `.setup-complete` marker, disables wizard)

### Path B: Manual `.env` configuration

```bash
git clone https://github.com/ahmedezzatelsayad/Garfix.git
cd Garfix
bun install
cp .env.example .env
# Edit .env: DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET, PAYMENTS_ENC_KEY, FOUNDER_EMAIL
bunx prisma migrate deploy
bunx prisma generate
bun run dev
```

---

## Environment Variables

> Full reference in `.env.example` (331 lines). Only required vars listed here.

| Variable | Required | Purpose | Safe Example |
|----------|----------|---------|--------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string | `postgresql://user:pass@host:5432/db?schema=public` |
| `DATABASE_DIRECT_URL` | ✅ | Direct connection (for migrations) | Same as `DATABASE_URL` |
| `JWT_SECRET` | ✅ | HS256 signing (≥32 chars) | `openssl rand -hex 64` |
| `JWT_REFRESH_SECRET` | ✅ | Refresh token signing (≥32 chars, different) | `openssl rand -hex 64` |
| `PAYMENTS_ENC_KEY` | ✅ | AES-256-GCM vault key (≥32 chars) | `openssl rand -base64 32` |
| `FOUNDER_EMAIL` | ✅ | Platform founder email | `founder@example.com` |
| `VALKEY_URL` | Production | Valkey/Redis for queues + cache + rate limit | `valkey://localhost:6379` |
| `VAULT_SALT` | Recommended | Per-deployment salt for scrypt | `openssl rand -hex 32` |
| `APP_URL` | Production | Public URL for callbacks/links | `https://garfix.app` |
| `SETUP_COMPLETE` | Optional | Skip setup wizard (set after manual setup) | `true` |
| `NODE_ENV` | Production | Runtime environment | `production` |
| `TRUSTED_PROXIES` | Optional | Comma-separated proxy IPs for rate limiting | `10.0.0.1,10.0.0.2` |
| `BCRYPT_ROUNDS` | Optional | Bcrypt cost factor (default 12) | `12` |
| `MAX_SESSIONS_PER_USER` | Optional | Concurrent session limit (default 5) | `5` |
| `DEEPSEEK_API_KEY` | Optional | DeepSeek AI provider key | `sk-...` |
| `GARFIX_USE_GOOGLE_FONT` | Optional | Enable Cairo font (requires internet at build) | `1` |
| `GARFIX_SKIP_INSTRUMENTATION` | Optional | Skip BullMQ/cron startup (standalone server) | `1` |

---

## Development

```bash
# Install dependencies
bun install

# Start dev server (hot reload)
bun run dev

# Type check
bunx tsc --noEmit

# Lint
bunx eslint .

# Run unit tests
bun test --isolate

# Run E2E tests (requires running app + DB)
bunx playwright test

# Run a single E2E spec
bunx playwright test e2e/invoice-create.spec.ts

# Database operations
bunx prisma migrate dev --name my_migration    # Create migration
bunx prisma migrate deploy                     # Apply in production
bunx prisma generate                           # Regenerate client
bunx prisma studio                              # GUI for database
```

---

## API Overview

257 API routes grouped by domain:

| Domain | Routes | Key endpoints |
|--------|--------|---------------|
| **accounting/** | 92 | accounts, journal-entries, vouchers, bank-reconciliation, fixed-assets, budgets, fiscal-periods, wps, tax-filing, profit-loss, balance-sheet, trial-balance |
| **platform-admin/** | 22 | tenants, tickets, ai-providers, feature-flags, audit, integrations |
| **ai/** | 17 | chat, chat/stream, parse-image, parse-file, smart-parse, bulk-import, invoice-brain/extract |
| **founder-panel/** | 16 | api-key-pool, ai-fabric, ai-config, companies, e-invoicing, mission-control |
| **auth/** | 10 | login, register, logout, refresh, me, csrf, mfa/status, change-password, forgot-password, reset-password |
| **e-invoicing/** | 13 | submit, zatca/{onboard,submit,status}, peppol/submit, webhooks/{7 countries} |
| **hr/** | 14 | employees, salaries, commissions, attendance, leaves, performance, gratuity |
| **invoices/** | 4 | CRUD + payment + status |
| **webhooks/** | 5 | endpoints, events, deliveries, whatsapp |
| **setup/** | 6 | status, test-db, run-migrations, create-founder, save-integrations, complete |
| **Other** | 53 | clients, catalog, inventory, automation, saas, permissions, health, metrics, storage, etc. |

---

## Security

### Verified Controls

| Control | Implementation | Evidence |
|---------|---------------|----------|
| **CSRF** | Double-submit cookie (`inv_csrf`) + header (`x-csrf-token`), SameSite=strict | `middleware.ts` |
| **CSP** | Per-request nonce, no `unsafe-eval` in production | `middleware.ts` |
| **SSRF** | `validateBaseUrl()` + `fetchSafe()` with DNS pinning (13 CIDR ranges blocked) | `src/lib/ssrf.ts` |
| **SQL injection** | Prisma parameterized queries + RLS policies | `src/lib/db.ts` |
| **XSS** | CSP nonce + React auto-escaping | `middleware.ts` |
| **Auth** | JWT HS256 (algorithm pinned), refresh rotation, JTI blacklisting | `src/lib/auth.ts` |
| **MFA** | TOTP RFC 6238, 128-bit recovery codes, replay protection, rate limiting | `src/lib/mfa.ts` |
| **Encryption at rest** | AES-256-GCM, scrypt key derivation (N=16384), per-deployment salt | `src/lib/cryptoVault.ts` |
| **Rate limiting** | Valkey-backed sliding window, 10 limit tiers, spoofing-resistant IP | `src/lib/rateLimit.ts` |
| **Webhook security** | HMAC-SHA256 (timing-safe), signs raw body string (not re-serialized JSON), SSRF validation, 10s timeout. Receivers MUST verify the raw request body — see `verifyWebhookSignature()` JSDoc in `src/lib/webhooks.ts` | `src/lib/webhooks.ts` |
| **Anti-enumeration** | Identical 401 for all login failures (SEC-06) | `src/app/api/auth/login/route.ts` |
| **Tenant isolation** | PostgreSQL RLS via Prisma `$extends` + AsyncLocalStorage | `src/lib/db.ts`, `src/lib/tenant-context.ts` |
| **Audit logging** | All mutations logged + tamper-evident hash chain + PII redaction | `src/lib/audit.ts` |
| **Input validation** | Zod schemas on all API routes + 1 MiB body size limit | `src/lib/api.ts` |
| **Security headers** | HSTS, X-Frame-Options: DENY, COOP/COEP, X-Content-Type-Options | `middleware.ts` |

### Known Security Considerations

- **In-memory rate-limit fallback** does not protect multi-instance deployments without `VALKEY_URL` — verify it is set in all production deploys
- **S3 uploads** use simplified SigV4 via plain `fetch` (not `@aws-sdk/s3-client`) — falls back to local disk on failure
- **Kuwait/ZATCA/UAE e-invoicing submission** is stubbed (returns `ok:false`) — real submissions require cert onboarding

---

## AI System

### 6-Stage Cost Optimization Cascade

```mermaid
flowchart LR
    Request[AI Request] --> Cache{1. Cache<br/>hit?}
    Cache -->|Yes| Return1[Return cached]
    Cache -->|No| Pattern{2. Pattern<br/>match?}
    Pattern -->|Yes| Return2[Return pattern result]
    Pattern -->|No| Rule{3. Rule<br/>candidate?}
    Rule -->|Yes| Return3[Return rule result]
    Rule -->|No| Memory{4. Memory<br/>entry?}
    Memory -->|Yes| Return4[Return memory]
    Memory -->|No| Budget{5. Budget<br/>gate}
    Budget -->|Blocked| Return5[Budget blocked]
    Budget -->|OK| AI[6. AI Runtime<br/>LLM call]
    AI --> Log[Log to AIRequestLog]
    Log --> CacheWrite[Write back to cache]
```

| Stage | Source | Resolution |
|-------|--------|------------|
| 1. Cache | `AIFabricCacheEntry` table | Hash(companySlug + normalizedInput), 1h TTL |
| 2. Pattern | Invoice-brain pattern engine | Layout fingerprint → template lookup |
| 3. Rule | `RuleCandidate` table (status="promoted") | Auto-promoted business rules |
| 4. Memory | `AIMemoryEntry` table | Previous AI decisions by inputHash |
| 5. Budget | `BudgetConfig` per tenant | Monthly spend gate (hard_stop / budget_exceeded) |
| 6. AI | LLM provider call | DeepSeek → Gemini → OpenRouter → OpenAI → z-ai fallback |

**Supported AI providers:** DeepSeek (default), Gemini, OpenRouter, Anthropic, OpenAI, z-ai (sandbox), Custom (OpenAI-compatible).

**Key features:** provider fallback chain with circuit breakers, per-key RPM rate limiting via Valkey, encrypted API key pool (AES-256-GCM), cost tracking per request (`AIRequestLog`), cross-company intelligence (privacy-preserving pattern sharing).

**Confidence: High** — verified in `src/lib/ai-fabric/gateway.ts`, `src/lib/aiProvider.ts`, `src/lib/ai/`.

---

## Background Jobs & Queues

### 3-Tier Queue Architecture

| Tier | Backend | Trigger | Production-safe |
|------|---------|---------|-----------------|
| 1 | BullMQ + Valkey | `VALKEY_URL` set | ✅ Multi-instance |
| 2 | pg-boss + PostgreSQL | `DATABASE_URL` set, no Valkey | ✅ Same DB |
| 3 | In-process | Neither set | ❌ Single-instance only |

**7 queues:** `ai-jobs`, `email-jobs`, `whatsapp-jobs`, `sms-jobs`, `backup-jobs`, `scheduler-jobs`, `events-jobs` (outbox relay target).

**Transactional Outbox:** DB writes + event publishes are atomic via `appendToOutbox(tx, event)` inside a `$transaction`. A background relay (`startOutboxRelay`) processes pending events every 1s with at-least-once delivery and dead-letter handling after 10 failures.

**Confidence: High** — verified in `src/lib/queues.ts`, `src/lib/outbox.ts`.

---

## E-Invoicing Coverage

> **Important:** The presence of an adapter ≠ production-ready integration. Each adapter has a different implementation status. The table below is verified against `src/lib/e-invoicing/router.ts` and per-country adapter source files.

| Country | Authority | Adapter File | Router Behavior | Submit Function | Production Status |
|---------|-----------|-------------|-----------------|-----------------|-------------------|
| 🇪🇬 Egypt | ETA | `egypt-eta.ts` | Calls `submitEgyptEtaInvoice()` | ✅ Implemented (JWT token, retry with backoff) | **Live** — callable, returns `ok:true` on success |
| 🇧🇭 Bahrain | NBR | `bahrain-nbr.ts` | Calls `submitBahrainNbrInvoice()` | ✅ Implemented (API key, retry with backoff) | **Live** — callable, returns `ok:true` on success |
| 🇴🇲 Oman | OTA | `oman-tax.ts` | Calls `submitOmanTaxInvoice()` | ✅ Implemented (OAuth2, retry with backoff) | **Live** — callable, returns `ok:true` on success |
| 🇶🇦 Qatar | GTA | (none — handled by router default) | Returns `ok:true, submissionStatus:"not_required"` | — | **Not required** — no mandatory e-invoicing |
| 🇸🇦 Saudi Arabia | ZATCA | `zatca.ts` | Returns `ok:false` (stub via router) | 🟡 `submitZatcaInvoice()` exists but uses **simulation endpoints** (`gw-fatoora.zatca.gov.sa/e-invoicing/simulation/v2`) and **placeholder** ECDSA signatures | **Stub** — requires real CSID certificates + production endpoint |
| 🇦🇪 UAE | FTA (Peppol) | `uae-fta.ts` | Returns `ok:false` (stub via router) | 🟡 `submitUaeFtaInvoice()` exists but uses **placeholder PKI signatures** | **Stub** — requires Peppol Access Point contract + real PKI |
| 🇰🇼 Kuwait | KITA | `kuwait.ts` | Returns `ok:false` (stub via router) | 🟡 `submitKuwaitInvoice()` exists but MOCI portal API **not yet published** | **Stub** — awaiting government API availability |

**Key distinction:**
- **Live** = `submitXxxInvoice()` is called by the router, makes a real HTTP request to the government API, and returns `ok:true` on success
- **Stub** = the router returns `ok:false` with a clear error message. A `submitXxxInvoice()` function EXISTS in the adapter file, but it uses simulation endpoints, placeholder signatures, or awaits government API availability. It is callable from dedicated API routes (`/api/e-invoicing/zatca/submit`, `/api/e-invoicing/peppol/submit`, `/api/e-invoicing/submit`) but is NOT production-ready.
- **Not required** = no mandatory e-invoicing in this country; router returns `ok:true` with `submissionStatus:"not_required"`

**Confidence: High** — verified by reading each adapter file and the router's `submitEInvoice()` switch-case logic. The P1 audit fix (commit in router.ts) explicitly changed the router from returning fake `submissionId` with `ok:true` to returning honest `ok:false` for stubbed countries.

---

## Docker & Deployment

### Docker (3-stage build)

```bash
# Build
docker build -t garfix .

# Run with docker-compose (includes PostgreSQL + Valkey)
cp .env.example .env
# Edit .env with real values
docker compose -f docker-compose.prod.yml up -d

# Run migrations
docker compose -f docker-compose.prod.yml run --rm app bunx prisma migrate deploy
```

**Image:** `oven/bun:1.3.14` (build) → `node:22-alpine` (runtime, standalone output)
**Hardening:** non-root user (UID 1001), read-only root filesystem, tmpfs `/tmp`, no secrets baked into image
**Healthcheck:** `/api/health` (30s interval, 3 retries)

### Production Deployment

| Platform | Configured | Verified | Notes |
|----------|-----------|----------|-------|
| **Docker Compose** | ✅ | ✅ | Self-contained: postgres + valkey + app |
| **AWS EC2** | ✅ | ✅ | GitHub Actions workflow (`deploy-aws.yml`) |
| **Hetzner VPS** | ✅ | ✅ | Documented in `CHEAP-DEPLOYMENT.md` |
| **Vercel** | ✅ | ✅ | Production-verified (Neon Postgres + Vercel Cron every 5 min via `/api/cron/maintenance`) |
| **Replit** | ✅ | ✅ | Documented in `AWS-REPLIT-DEPLOYMENT.md` |

See `AWS-REPLIT-DEPLOYMENT.md` and `CHEAP-DEPLOYMENT.md` for detailed deployment guides.

---

## CI/CD

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | push/PR | TypeScript + ESLint + Build (198 pages) |
| `e2e.yml` | push/PR | 30 Playwright E2E tests (PostgreSQL + Valkey services) |
| `security.yml` | push/PR | 13 security test files, 356 tests |
| `performance.yml` | push/PR | Bundle size + k6 load test (p95 < 200ms) |
| `performance-nightly.yml` | schedule | Lighthouse audit (informational, `continue-on-error`) |
| `deploy-aws.yml` | manual/release | Docker build → SCP to EC2 → migrate → deploy |
| `founder-deploy.yml` | manual | Founder-specific deployment |
| `pr-checks.yml` | PR | Additional PR gates |

---

## Testing

```bash
# Unit tests (1,736 test files — not individual test cases)
bun test --isolate

# E2E tests (12 specs, ~30 test blocks)
bunx playwright test

# Security suite (13 files, 356 tests)
bun test --isolate src/lib/__tests__/

# Founder validation suite (1,628 files — excluded from CI)
bun run test:founder

# Accessibility scan (axe-core, WCAG AAA)
node scripts/axe-core-scan.mjs

# Load testing (k6, 10 routes)
k6 run scripts/k6/top10-routes.js
```

---

## Observability

| Feature | Status | Implementation |
|---------|--------|----------------|
| **Health endpoint** | ✅ | `/api/health` (DB + Valkey + queues + memory + disk) |
| **Structured logging** | ✅ | `src/lib/logger.ts` (JSON to stdout, browser-safe) |
| **Audit trail** | ✅ | `AuditLog` + `TamperEvidenceChain` (hash-chained) |
| **OpenTelemetry** | ✅ | OTLP/HTTP exporter, auto-instrumentation (http, pg, ioredis) |
| **Prometheus metrics** | ✅ | `/metrics` endpoint (request count, latency, AI tokens/cost) |
| **Circuit breaker dashboard** | ✅ | `/api/health/circuit-breakers` (12 services) |
| **Grafana dashboards** | ✅ | 4 JSON dashboards in `scripts/grafana/` |

---

## Known Limitations

### Confirmed
- **No `LICENSE` file** — README states Proprietary but no LICENSE file exists in the repository
- **Vercel** — now production-verified: app + middleware run on Node.js runtime, Neon Postgres via a non-BYPASSRLS `garfix_app` role (RLS enforced), and lightweight background maintenance runs via Vercel Cron (`vercel.json` → `/api/cron/maintenance` every 5 minutes). Heavy BullMQ workers (bulk email/WhatsApp) still need a long-running worker — see `DEPLOYMENT.md`.
- **ZATCA/UAE/Kuwait e-invoicing** — submission is stubbed pending government API availability
- **S3 uploads** — simplified SigV4 (not `@aws-sdk/s3-client`); falls back to local disk
- **In-process queue tier** — single-instance only, not production-safe without Valkey

### Architectural
- **Two OpenTelemetry setups** — `telemetry-sdk.ts` and `observability/otel.ts` have overlapping functionality
- **`package.json` name mismatch** — package is named `nextjs_tailwind_shadcn_ts` (legacy scaffold), not `garfix`
- **Dual money API** — `src/lib/money.ts` has both legacy JS Number and `Prisma.Decimal` APIs (potential footgun for contributors)

---

## Documentation

| Document | Purpose |
|----------|---------|
| [docs/api/openapi.yaml](docs/api/openapi.yaml) | OpenAPI 3.1 spec — 257 paths, 397 operations, 48 schemas (generated, validated 1:1 with route files) |
| [CHEAP-DEPLOYMENT.md](CHEAP-DEPLOYMENT.md) | VPS deployment guide (Oracle, Hetzner, Contabo, Fly.io) |
| [AWS-REPLIT-DEPLOYMENT.md](AWS-REPLIT-DEPLOYMENT.md) | AWS EC2 + Replit deployment guide |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Full production deployment guide |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture + ADRs |
| [docs/RUNBOOK.md](docs/RUNBOOK.md) | RTO/RPO + restore procedure + Valkey backup |
| [docs/adr/](docs/adr/) | 9 Architecture Decision Records (001–009) |
| [e2e/README.md](e2e/README.md) | E2E test suite documentation |
| [prisma/README.md](prisma/README.md) | Database schema + migrations |
| [.env.example](.env.example) | Full environment variable reference (331 lines) |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines. The project uses conventional commits and requires passing CI (TypeScript + ESLint + Build + E2E + Security) before merge.

---

## Documentation Status

This README is derived from the current repository state (commit `3b26aa0`). For implementation-specific details, the source code and linked project documentation remain authoritative.
