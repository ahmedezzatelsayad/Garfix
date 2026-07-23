# GarfiX EOS — نظام ERP/فواتير متعدد المستأجرين مع طبقة ذكاء اصطناعي

> Enterprise-grade multi-tenant ERP with 16-phase AI cost optimization cascade — Arabic-first, MENA-focused.

**الإصدار:** 12.1.0 | **المؤلف:** ahmedezzatelsayad | **الترخيص:** MIT

## Tech Stack

| التقنية | الإصدار | الدور |
|---------|---------|-------|
| Next.js | 16 | App Router + Server Actions |
| Bun | — | Runtime + Package Manager |
| TypeScript | — | 99% coverage |
| Prisma | — | ORM (SQLite dev / PostgreSQL prod) |
| Tailwind CSS | 4 | Styling + Responsive Design |
| Valkey | 8.1 | Cache + Queue backend |
| BullMQ | — | Job processing (primary queue) |
| pg-boss | — | PostgreSQL-backed job queue (secondary fallback) |
| shadcn/ui | — | Component library |

## Quick Start

```bash
git clone https://github.com/ahmedezzatelsayad/Garfix.git
cd Garfix
cp .env.example .env.local
bun install
bun run dev
```

## Project Structure

```
Garfix/
├── prisma/                  # Schema (72+ models) + Migrations
├── e2e/                     # Playwright specs (6 files)
├── scripts/                 # Seed, bench, CLI tools (~30 scripts)
├── docs/                    # Roadmaps, audit reports, API spec
│   └── api/openapi.yaml     # OpenAPI/Swagger specification
├── src/
│   ├── app/api/             # Route handlers (177+ endpoints)
│   ├── modules/             # 20+ domain UI modules
│   ├── lib/
│   │   ├── ai-fabric/       # 16-phase AI cascade engine (20 files)
│   │   ├── invoice-brain/   # Pattern-first extraction (13 files)
│   │   ├── founder-validation/ # 1628+ test suite (11 sections)
│   │   ├── e-invoicing/     # MENA e-invoicing (6 countries)
│   │   ├── accounting/      # Full accounting engine (16 modules)
│   │   ├── billing/         # Subscription engine + pricing
│   │   ├── workers/         # BullMQ + pg-boss background jobs
│   │   ├── ai/              # Router, cost tracker, registry (6 files)
│   │   ├── integrations/    # Myfatoorah, Paymob, WhatsApp, Meta Ads
│   │   ├── auth.ts, db.ts, valkey.ts, rateLimit.ts, ...
│   │   ├── rbac.ts          # Enterprise-grade RBAC with granular permissions
│   │   ├── webhooks.ts      # Tenant-scoped webhook delivery system
│   │   ├── queue-pgboss.ts  # PostgreSQL-backed fallback queue
│   │   ├── ssrf.ts          # SSRF protection for outbound URLs
│   │   └── automation/      # Rule engine
│   ├── hooks/               # React Query hooks (11 domain scopes)
│   ├── components/          # UI + GarfiX custom components (50+)
│   └── middleware.ts         # Auth + rate limit + CSRF
└── docker-compose.yml
```

## Key Features

- **Multi-tenant isolation** — عزل كامل بين الشركات مع slug-based routing و tenantScope
- **AI Fabric 16-phase cascade** — Cache → Pattern → Rule → Memory → Budget Gate → AI — تكلفة صفر على الأشكال المتكررة
- **Invoice Brain** — Pattern-first extraction: صفر تكلفة AI على الأشكال المتكررة مع learning engine
- **Enterprise RBAC** — نظام صلاحيات متدرج: PermissionScope (own/team/company/platform) + PermissionLevel (none→admin) + hierarchy + time-based restrictions + audit trail
- **Webhook System** — Tenant-scoped outgoing webhooks مع HMAC-SHA256 signing + exponential backoff retry + delivery tracking + SSRF protection
- **Multi-tier Queue** — 3-tier fallback: BullMQ (Valkey) → pg-boss (PostgreSQL) → In-process (dev) — jobs survive crashes in all tiers
- **E-Invoicing MENA** — 6 دول: ZATCA (Saudi), UAE FTA, Egypt ETA, Kuwait, Bahrain NBR, Oman Tax — مع validation و retention
- **IDOR Protection** — 54 من 56 handlers محمية + transaction-safe journal entries
- **Security Pipeline** — CodeQL + TruffleHog + Gitleaks + SSRF protection + audit remediation
- **Structured Logger** — Pino-compatible: `logger.info(msg, meta)` مع redaction + level filtering
- **Responsive Design** — Tailwind sm/md/lg breakpoints عبر كل modules + mobile-first
- **Enterprise Seeder** — 10 إلى 25,000 شركة ببيانات واقعية مع seed-based determinism
- **MENA Expansion** — 20+ دولة + صفحات footer عربية كاملة + Hijri date support
- **Valkey + BullMQ + pg-boss** — 3-tier queue: Valkey/BullMQ (primary) → pg-boss (secondary) → in-process (dev)
- **Arabic-first** — واجهة عربية مع RTL كامل + Arabic amount text conversion
- **OpenAPI/Swagger** — 177+ endpoints documented in `docs/api/openapi.yaml` مع interactive viewer at `/api-docs`
- **Landing Page** — صفحة رئيسية تسويقية `EnhancedLandingPage.tsx` مع sections متعددة
- **PWA Support** — Service worker + manifest + offline capability
- **Full Accounting** — 16 modules: journals, AR/AP, banking, fixed assets, payroll/WPS, trade finance, consolidation, budgets, tax compliance, cost centers

## Architecture

```
Routes → Middleware (auth + rate limit + CSRF) → Modules → lib/ai-fabric (cascade) → Providers
                │                                          │
                ▼                                          ▼
         Rate Limiter (7 limits)                    16-Phase Cascade
         RBAC Permission Check                           │
         SSRF Validation                    ┌────────────┘
         Tenant Scoping                    ▼
                                   Cache → Pattern → Rule → Memory → Budget Gate → AI
```

## Queue Architecture (3-tier)

```
enqueue(job)
    │
    ├─ Valkey/BullMQ available? ──► BullMQ queue (production-grade)
    │                                  │ persistent, retries, rate-limits, distributed
    │
    ├─ DATABASE_URL available? ──► pg-boss (PostgreSQL-backed)
    │                                  │ persistent, retries, dead-letter queues, advisory locks
    │                                  │ uses SAME DATABASE_URL as Prisma — no extra infra
    │
    └─ Dev/Sandbox ──► In-process runner
                          │ NOT production-safe, but works for local dev
```

## RBAC Architecture

```
User ──► Role (OWNER / ADMIN / MANAGER / ACCOUNTANT / EMPLOYEE / VIEWER)
              │
              ▼
         PermissionScope (own / team / company / platform)
              │
              ▼
         PermissionLevel (none=0, read=1, write=2, approve=3, admin=4)
              │
              ▼
         ResourcePermission (invoice:read, invoice:write, invoice:approve, ...)
              │
              ▼
         Time-based restrictions + Permission groups (financial / operations / admin / hr)
              │
              ▼
         Audit trail (every permission check logged)
```

## E-Invoicing Coverage

| الدولة | الملف | المعيار |
|--------|-------|---------|
| السعودية (ZATCA) | `zatca.ts` + `zatca-validation.ts` + `zatca-certs.ts` | Phase 2 e-invoicing |
| الإمارات (FTA) | `uae-fta.ts` + `uae-fta-validation.ts` | UAE VAT e-invoicing |
| مصر (ETA) | `egypt-eta.ts` + `egypt-eta-validation.ts` | Egyptian Tax Authority |
| الكويت | `kuwait.ts` + `kuwait-validation.ts` | Kuwait Decree 10/2026 |
| البحرين (NBR) | `bahrain-nbr.ts` | Bahrain National Bureau for Revenue |
| عمان | `oman-tax.ts` | Oman Tax Authority |
| التوجيه | `router.ts` | Unified routing per country |
| الأرشفة | `retention.ts` | Retention policies per jurisdiction |

## Webhook System

```
Event occurs (invoice.created, payment.received, ...)
    │
    ▼
dispatchWebhook() ──► Find matching endpoints for tenant
    │                     │
    │              Filter by subscribed events
    │                     │
    ▼              Create WebhookDelivery (pending)
    │
processPendingDeliveries() ──► HMAC-SHA256 sign payload
    │                              │
    │                         SSRF validate URL (defense-in-depth)
    │                              │
    │                         POST to endpoint with X-Garfix-Signature
    │                              │
    ├─ Success ──► Mark delivered
    └─ Fail ──► Exponential backoff retry (5s → 25s → 125s) → Dead letter
```

## Test Stats

- **1855+** ملف اختبار عبر المشروع
- **1800+** حالة اختبار
- Founder Validation Suite مع 11 قسم + 180+ deep tests
- Accounting module: 16 test files
- E-invoicing: 7 test files (كل دولة)
- RBAC: comprehensive permission tests
- Webhook: delivery + SSRF protection tests
- Queue: pg-boss + BullMQ integration tests
- Responsive design: validation tests
- Decimal migration: type safety tests
- 6 ملفات E2E (Playwright)

## Founder Validation Suite

مجموعة اختبار ضغط CTO-level تضمن جاهزية النظام للإنتاج — 11 قسم تغطي كل جانب:

| # | القسم | الوصف |
|---|-------|-------|
| 1 | **Seeder Validation** | اختبار مولّد البيانات (10 → 25,000 شركة) |
| 2 | **Edge Cases** | 20 اختبار حافة: قيم فارغة، حد أقصى، أحرف عربية |
| 3 | **Cost Validation** | حسابات التكلفة: لكل فاتورة، provider، tenant، نموذج |
| 4 | **Metrics** | نسب error rate, cache hit, p50/p95/p99 latency |
| 5 | **Telemetry** | تسجيل الأحداث وتصفية حسب tenant/model/provider |
| 6 | **Scale Tests** | تحميل متدرج: 100 → 500 → 1000 → 5000 → 10000 طلب |
| 7 | **Report Validation** | فحص اكتمال التقرير ودقته |
| 8 | **Validation Logic** | سلامة البيانات: معرفات، علاقات، حدود |
| 9 | **Learning Validation** | اختبار محرك التعلم (pattern + memory) |
| 10 | **Failure Injection** | حقن أعطال: Valkey, Postgres, BullMQ, OpenRouter, Network, Disk |
| 11 | **Deep Tests** | 180+ اختبار عميق: Arabic encoding, cross-tenant, concurrent safety |

```bash
# تشغيل المجموعة الكاملة
bun run scripts/founder-validation-suite.ts
# أو عبر API
POST /api/founder-validation
```

## API Documentation

The full OpenAPI/Swagger specification is available at:

- **Spec file**: [`docs/api/openapi.yaml`](docs/api/openapi.yaml)
- **Interactive viewer**: `/api-docs` page (visit at `http://localhost:3000/api-docs`)

The OpenAPI spec covers 177+ endpoints across 16+ tags:
Auth, Invoices, Clients, Catalog, Inventory, Accounting, HR, AI, Dashboard,
Settings, Automation, Webhooks, SaaS, Reports, Health, Companies, Permissions, Product Matching, Founder Validation

Key documentation features:
- JWT Bearer authentication via HttpOnly cookies
- Multi-tenant scoping (`companySlug` query param or `X-Company-Slug` header)
- Arabic field names and descriptions (RTL support)
- Kuwait Decree 10/2026 e-invoicing compliance fields
- RBAC permission-based access control documented per endpoint
- Error response schemas with codes

## Security

| الميزة | الوصف |
|--------|-------|
| **SSRF Protection** | `ssrf.ts` — block internal IPs, private ranges, cloud metadata endpoints |
| **CSRF Protection** | Double-submit cookie pattern in middleware |
| **Crypto Vault** | AES-256 encryption for secrets + webhook secrets |
| **IDOR Protection** | `tenantScope.ts` + `requirePermissionForCompany()` — 54/56 handlers |
| **Rate Limiting** | 7 custom rate limits per endpoint type |
| **MFA** | `mfa.ts` — TOTP-based 2-factor authentication |
| **Audit Trail** | Every permission check, data mutation, and webhook delivery logged |
| **Password Policy** | `passwordPolicy.ts` — length, complexity, breach-dictionary check |

## License

MIT — ahmedezzatelsayad · [github.com/ahmedezzatelsayad/Garfix](https://github.com/ahmedezzatelsayad/Garfix)
