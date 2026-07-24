# GarfiX EOS — نظام ERP/فواتير متعدد المستأجرين مع طبقة ذكاء اصطناعي

> Enterprise-grade multi-tenant ERP with 16-phase AI cost optimization cascade — Arabic-first, MENA-focused.

**الإصدار:** 12.1.0 | **المؤلف:** ahmedezzatelsayad | **الترخيص:** MIT

## Tech Stack

| التقنية | الإصدار | الدور |
|---------|---------|-------|
| Next.js | 16 | App Router + Server Actions |
| Bun | — | Runtime + Package Manager |
| TypeScript | — | 99% coverage |
| Prisma | — | ORM (72 models, 110 @@index directives, SQLite dev / PostgreSQL prod) |
| Tailwind CSS | 4 | Styling + Responsive Design |
| Valkey | 8.1 | Cache + Queue backend |
| BullMQ | — | Job processing (primary queue) |
| pg-boss | — | PostgreSQL-backed job queue (secondary fallback) |
| OpenTelemetry | — | Observability (OTLP/JSON export via `observability.ts`) |
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
├── prisma/                  # Schema (72 models) + 110 @@index + Migrations
├── e2e/                     # Playwright specs (8 files: accounting, e-invoicing, company-mgmt)
├── scripts/                 # Seed, bench, security-scan, rate-limit load test (~47 scripts)
├── docs/                    # Roadmaps, audit reports, API spec, ADRs
│   └── api/openapi.yaml     # OpenAPI/Swagger specification
├── src/
│   ├── app/api/             # Route handlers (208 route files, 177+ documented endpoints)
│   ├── modules/             # 20+ domain UI modules
│   ├── lib/
│   │   ├── ai-fabric/       # 16-phase AI cascade engine (20 files)
│   │   ├── invoice-brain/   # Pattern-first extraction (13 files)
│   │   ├── founder-validation/ # 1628+ test suite (11 sections)
│   │   ├── e-invoicing/     # MENA e-invoicing (6 countries + ZATCA certs + TLV)
│   │   ├── accounting/      # Full accounting engine (16 modules)
│   │   ├── billing/         # Subscription engine + pricing
│   │   ├── workers/         # BullMQ + pg-boss background jobs (5 workers)
│   │   ├── ai/              # Router, cost tracker, registry (6 files)
│   │   ├── integrations/    # Myfatoorah, Paymob, WhatsApp, Meta Ads
│   │   ├── observability.ts # OpenTelemetry stack: metrics, tracing, SLO, OTLP export
│   │   ├── metrics-middleware.ts # withMetrics() wrapper for API handlers
│   │   ├── cursor-pagination-server.ts # Server-side cursor pagination helpers
│   │   ├── auth.ts, db.ts, valkey.ts, rateLimit.ts, ...
│   │   ├── rbac.ts          # Enterprise-grade RBAC with granular permissions
│   │   ├── webhooks.ts      # Tenant-scoped webhook delivery system
│   │   ├── queue-pgboss.ts  # PostgreSQL-backed fallback queue
│   │   ├── ssrf.ts          # SSRF protection for outbound URLs
│   │   ├── a11y.ts          # Accessibility utilities (decorative icon props)
│   │   └── automation/      # Rule engine
│   ├── hooks/               # React Query hooks (16 domain scopes + cursor pagination + optimistic)
│   │   ├── cursor-pagination.ts  # useCursorPagination + server helpers
│   │   ├── optimistic.ts        # Optimistic update helpers (add, update, delete)
│   │   └── queries/             # Domain-scoped hooks (16 files)
│   ├── components/          # UI + GarfiX custom components (50+)
│   └── middleware.ts         # Auth + rate limit + CSRF + security headers
└── docker-compose.yml
```

## Key Features

- **Multi-tenant isolation** — عزل كامل بين الشركات مع slug-based routing و tenantScope
- **AI Fabric 16-phase cascade** — Cache → Pattern → Rule → Memory → Budget Gate → AI — تكلفة صفر على الأشكال المتكررة
- **Invoice Brain** — Pattern-first extraction: صفر تكلفة AI على الأشكال المتكررة مع learning engine
- **Cursor Pagination** — `useCursorPagination<T>()` hook (TanStack Query infinite scroll) على accounts, journal-entries, vouchers و routes عالية الحجم — ثلاثة hooks مخصصة: `useAccountsCursor`, `useJournalEntriesCursor`, `useVouchersCursor` — Server-side: `cursor-pagination-server.ts` يوفّر `parseCursorParams()`, `buildCursorPrismaQuery()`, `buildCursorResponse()`
- **Accounting Rate Limits** — ACCOUNTING_READ (40/min), ACCOUNTING_WRITE (15/min), REPORT_GENERATION (5/5min) — حدود مخصصة للعمليات المالية الحساسة — validated via `accounting-rate-limit-load-test.ts`
- **OpenTelemetry Observability** — `observability.ts` يوفّر MetricsRegistry, TraceContext, SLO definitions, و OTLP/JSON export عبر `OTEL_EXPORTER_OTLP_ENDPOINT` env var — `metrics-middleware.ts` يلف API handlers تلقائياً بـ `withMetrics()`
- **Enterprise RBAC** — نظام صلاحيات متدرج: PermissionScope (own/team/company/platform) + PermissionLevel (none→admin) + hierarchy + time-based restrictions + audit trail
- **Webhook System** — Tenant-scoped outgoing webhooks مع HMAC-SHA256 signing + exponential backoff retry + delivery tracking + SSRF protection
- **3-Tier Queue System** — BullMQ (Valkey) → pg-boss (PostgreSQL) → In-process (dev) — jobs survive crashes in all tiers
- **E-Invoicing MENA** — 6 دول: ZATCA (Saudi), UAE FTA, Egypt ETA, Kuwait, Bahrain NBR, Oman Tax — مع validation و retention و ZATCA TLV encoding
- **IDOR Protection** — 54 من 56 handlers محمية + transaction-safe journal entries
- **Security Pipeline** — `scripts/security-scan.sh` يفحص: dependency audit + secret leak detection + env validation + config hardening — CodeQL + TruffleHog + Gitleaks + SSRF protection + audit remediation
- **Accounting Rate Limit Load Test** — `scripts/accounting-rate-limit-load-test.ts` يختبر ACCOUNTING_READ/WRITE/REPORT_GENERATION limits تحت burst traffic مع p50/p95 latency analysis + 429 rate validation + burst detection
- **Optimistic Updates** — `optimistic.ts` يوفّر `optimisticAdd()`, `optimisticUpdate()`, `optimisticDelete()` — UI changes فورية مع rollback تلقائي عند فشل الخادم
- **Structured Logger** — Pino-compatible: `logger.info(msg, meta)` مع redaction + level filtering
- **Responsive Design** — Tailwind sm/md/lg breakpoints عبر كل modules + mobile-first
- **Enterprise Seeder** — 10 إلى 25,000 شركة ببيانات واقعية مع seed-based determinism
- **MENA Expansion** — 20+ دولة + صفحات footer عربية كاملة + Hijri date support
- **Valkey + BullMQ + pg-boss** — 3-tier queue: Valkey/BullMQ (primary) → pg-boss (secondary) → in-process (dev)
- **Arabic-first** — واجهة عربية مع RTL كامل + Arabic amount text conversion + accessibility (`a11y.ts`)
- **OpenAPI/Swagger** — 177+ endpoints documented in `docs/api/openapi.yaml` مع interactive viewer at `/api-docs`
- **Prisma Indexing** — 110 @@index directives على companySlug, status, createdAt, و composite fields لضمان أداء الاستعلامات على 72 models
- **Landing Page** — صفحة رئيسية تسويقية `EnhancedLandingPage.tsx` مع sections متعددة
- **PWA Support** — Service worker + manifest + offline capability
- **Full Accounting** — 16 modules: journals, AR/AP, banking, fixed assets, payroll/WPS, trade finance, consolidation, budgets, tax compliance, cost centers

## Architecture

```
Routes → Middleware (auth + rate limit + CSRF + security headers) → Modules → lib/ai-fabric (cascade) → Providers
                │                                          │
                ▼                                          ▼
         Rate Limiter (11 limits)                    16-Phase Cascade
         RBAC Permission Check                           │
         SSRF Validation                    ┌────────────┘
         Tenant Scoping                    ▼
         Observability (withMetrics)   Cache → Pattern → Rule → Memory → Budget Gate → AI
```

## Rate Limiting (11 Limits)

| الحد | القيمة | الوصف |
|------|--------|-------|
| LOGIN | 5/15min | تسجيل الدخول (lockout بعد 5 فشل) |
| REGISTER | 3/hr | تسجيل حساب جديد |
| OTP_VERIFY | 5/5min | تحقق OTP |
| PASSWORD_RESET | 3/hr | إعادة تعيين كلمة المرور |
| AI_CHAT | 10/min | محادثة AI |
| AI_BULK | 3/min | عمليات AI جماعية |
| API_READ | 60/min | قراءة API عام |
| API_WRITE | 30/min | كتابة API عام |
| ACCOUNTING_READ | 40/min | قراءة المحاسبة — accounts, journal-entries, vouchers |
| ACCOUNTING_WRITE | 15/min | كتابة المحاسبة — voucher creation, JE posting |
| REPORT_GENERATION | 5/5min | تقارير مالية ثقيلة — P&L, balance sheet, export-excel |

الـ rate limiter يستخدم Valkey (production) أو in-memory (dev/sandbox) مع fail-open عند فشل Valkey. كل حد يُرسل `X-RateLimit-Remaining` و `X-RateLimit-Reset` headers.

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

## OpenTelemetry Observability Stack

```
API Request → withMetrics() wrapper
    │
    ├── metrics.increment("api.request", { route, method })
    ├── metrics.histogram("api.latency", durationMs, { route })
    ├── traceContext.start("handler") → span → end()
    │
    ├── Periodic Flush (5min interval)
    │       ├── Metrics → OTLP/JSON → OTEL_EXPORTER_OTLP_ENDPOINT
    │       └── Traces → OTLP/JSON → OTEL_EXPORTER_OTLP_ENDPOINT
    │
    └── Graceful Shutdown → final flush
```

المكونات:
- **MetricsRegistry** — counters, gauges, histograms مع cardinality limits و redaction
- **TraceContext** — distributed tracing مع trace/span IDs, request correlation
- **SLO Definitions** — api.latency.p95 < 500ms, error.rate < 1%, budget.exhaustion < 5%
- **OTLP Export** — `OTEL_EXPORTER_OTLP_ENDPOINT` env var يفعّل POST إلى collector
- **Metrics Endpoints** — `/api/metrics/prometheus`, `/api/metrics/observability`, `/api/metrics/slo`

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

## Cursor Pagination Architecture

```
Client (TanStack Query)
    │
    ├── useCursorPagination<T>({ queryKey, url, params })
    │       ├── useInfiniteQuery → fetches CursorPage<T>
    │       ├── getNextPageParam → lastPage.nextCursor
    │       └── items = pages.flatMap(p => p.items)
    │
    ├── Specialized hooks:
    │       ├── useAccountsCursor(companySlug, { search, limit })
    │       ├── useJournalEntriesCursor(companySlug, { status, search, limit })
    │       ├── useVouchersCursor(companySlug, { voucherType, status, limit })
    │
    └── Prefetch: prefetchNextCursorPage(queryClient, ...)

Server (API Route)
    │
    ├── parseCursorParams(req) → { companySlug, cursor, limit, search, status, extraFilters }
    ├── buildCursorPrismaQuery(cursor, limit) → { take: limit+1, skip, cursor, orderBy }
    ├── Prisma findMany({ where, ...pagination })
    └── buildCursorResponse(allItems, limit) → { items, nextCursor, totalCount }

API Pattern: GET /api/resource?companySlug=X&cursor=123&limit=20
Response: { items: [...], nextCursor: "124" | null, totalCount?: number }
```

## E-Invoicing Coverage

| الدولة | الملف | المعيار |
|--------|-------|---------|
| السعودية (ZATCA) | `zatca.ts` + `zatca-validation.ts` + `zatca-certs.ts` + `zatca-tlv.ts` | Phase 2 e-invoicing + TLV encoding |
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

## Security Scan Script

`scripts/security-scan.sh` يُنفّذ 4 فحوصات متتالية:

| الفحص | الوصف |
|-------|-------|
| **Dependency Audit** | `bun audit` — فحص الثغرات المعروفة في dependencies |
| **Secret Leak Detection** | regex scan لـ AWS keys, OpenAI keys, GitHub PATs, JWTs, private keys, hardcoded passwords — يستثني .env و node_modules |
| **Env Validation** | فحص وجود JWT_SECRET, DATABASE_URL, FOUNDER_EMAIL — فحص طول و entropy — كشف placeholder values — فحص JWT_SECRET ≠ JWT_REFRESH_SECRET |
| **Config Hardening** | فحص security headers في middleware.ts — فحص ACCOUNTING_READ/WRITE/REPORT_GENERATION rate limits في rateLimit.ts — فحص eslint-plugin-security |

```bash
# تشغيل الفحص الكامل
bash scripts/security-scan.sh

# فحص سريع (بدون bun audit)
bash scripts/security-scan.sh --quick

# تقرير JSON لـ CI
bash scripts/security-scan.sh --json
```

## Accounting Rate Limit Load Test

`scripts/accounting-rate-limit-load-test.ts` يختبر حدود المحاسبة تحت burst traffic:

| الحد | الاختبار | الـ endpoints |
|------|----------|---------------|
| ACCOUNTING_READ (40/min) | 5 concurrent workers cycling through accounts, journal-entries, vouchers, bank-accounts, aging | GET endpoints |
| ACCOUNTING_WRITE (15/min) | POST requests for journal-entries, vouchers, accounts, bank-transfer | POST endpoints |
| REPORT_GENERATION (5/5min) | Cycling through profit-loss, balance-sheet, cash-flow, trial-balance, export-excel | GET endpoints |

النتائج: p50/p95 latency, 429 rate, throughput/min, burst detection, limit validation.

```bash
# تشغيل الاختبار
bun run scripts/accounting-rate-limit-load-test.ts

# مع إعدادات مخصصة
bun run scripts/accounting-rate-limit-load-test.ts --url=http://localhost:3000 --duration=120 --concurrency=5

# مع JWT token
bun run scripts/accounting-rate-limit-load-test.ts --auth-token=YOUR_JWT
```

## Test Stats

- **1855+** ملف اختبار عبر المشروع
- **1800+** حالة اختبار
- Founder Validation Suite مع 11 قسم + 180+ deep tests
- Accounting module: 19 test files
- E-invoicing: 7 test files (كل دولة)
- RBAC: comprehensive permission tests
- Webhook: delivery + SSRF protection tests
- Queue: pg-boss + BullMQ integration tests
- Rate limit: advanced rate limit tests
- Observability: metrics + tracing tests
- Responsive design: validation tests
- Decimal migration: type safety tests
- 8 ملفات E2E (Playwright): auth, invoices, clients, dashboard, settings, api-health, accounting, e-invoicing, company-management

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
| 8 | **Validation Logic** | سلامة البيانات: معيدات، علاقات، حدود |
| 9 | **Learning Validation** | اختبار محرك التعلم (pattern + memory) |
| 10 | **Failure Injection** | حقن أعطال: Valkey, Postgres, BullMQ, OpenRouter, Network, Disk, Memory |
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
- **API docs route**: `/api/docs` (OpenAPI JSON served dynamically)
- **Spec generator**: `scripts/generate-openapi-spec.ts`

The OpenAPI spec covers 177+ endpoints across 16+ tags:
Auth, Invoices, Clients, Catalog, Inventory, Accounting, HR, AI, Dashboard,
Settings, Automation, Webhooks, SaaS, Reports, Health, Companies, Permissions, Product Matching, Founder Validation, Metrics

Key documentation features:
- JWT Bearer authentication via HttpOnly cookies
- Multi-tenant scoping (`companySlug` query param or `X-Company-Slug` header)
- Arabic field names and descriptions (RTL support)
- Kuwait Decree 10/2026 e-invoicing compliance fields
- RBAC permission-based access control documented per endpoint
- Cursor pagination (`nextCursor` parameter) on high-volume routes
- Error response schemas with codes

## Security

| الميزة | الوصف |
|--------|-------|
| **SSRF Protection** | `ssrf.ts` — block internal IPs, private ranges, cloud metadata endpoints |
| **CSRF Protection** | Double-submit cookie pattern in middleware |
| **Crypto Vault** | AES-256 encryption for secrets + webhook secrets |
| **IDOR Protection** | `tenantScope.ts` + `requirePermissionForCompany()` — 54/56 handlers |
| **Rate Limiting** | 11 custom rate limits including accounting-specific (ACCOUNTING_READ/WRITE, REPORT_GENERATION) |
| **MFA** | `mfa.ts` — TOTP-based 2-factor authentication |
| **Audit Trail** | Every permission check, data mutation, and webhook delivery logged |
| **Password Policy** | `passwordPolicy.ts` — length, complexity, breach-dictionary check |
| **Security Scan** | `scripts/security-scan.sh` — dependency audit + secret leak + env validation + config hardening |
| **Observability** | OpenTelemetry-compatible metrics + tracing + SLO monitoring via `OTEL_EXPORTER_OTLP_ENDPOINT` |
| **Accessibility** | `a11y.ts` — decorative icon props, aria-label helpers |

## License

MIT — ahmedezzatelsayad · [github.com/ahmedezzatelsayad/Garfix](https://github.com/ahmedezzatelsayad/Garfix)
