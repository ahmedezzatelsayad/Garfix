# GarfiX EOS — نظام ERP/فواتير متعدد المستأجرين مع طبقة ذكاء اصطناعي

> Enterprise-grade multi-tenant ERP with 16-phase AI cost optimization cascade.

**الإصدار:** 12.1.0 | **المؤلف:** ahmedezzatelsayad | **الترخيص:** MIT

## Tech Stack

| التقنية | الإصدار | الدور |
|---------|---------|-------|
| Next.js | 16 | App Router + Server Actions |
| Bun | — | Runtime + Package Manager |
| TypeScript | — | 99% coverage |
| Prisma | — | ORM (SQLite dev / PostgreSQL prod) |
| Tailwind CSS | 4 | Styling |
| Valkey | 8.1 | Cache + Queue backend |
| BullMQ | — | Job processing |
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
├── prisma/                  # Schema (1777 lines) + Migrations
├── e2e/                     # Playwright specs (6 files)
├── scripts/                 # Seed, bench, CLI tools
├── src/
│   ├── app/api/             # Route handlers (120+ endpoints)
│   ├── modules/             # 20 domain UI modules
│   ├── lib/
│   │   ├── ai-fabric/       # 16-phase AI cascade engine
│   │   ├── invoice-brain/   # Pattern-first extraction
│   │   ├── founder-validation/ # 1628+ test suite (11 sections)
│   │   ├── workers/         # BullMQ background jobs
│   │   ├── ai/              # Router, cost tracker, registry
│   │   ├── integrations/    # Myfatoorah, WhatsApp, Meta Ads
│   │   ├── auth.ts, db.ts, valkey.ts, rateLimit.ts, ...
│   │   └── automation/      # Rule engine
│   ├── hooks/               # React Query hooks
│   ├── components/          # UI + GarfiX custom components
│   └── middleware.ts         # Auth + rate limit
└── docker-compose.yml
```

## Key Features

- **Multi-tenant isolation** — عزل كامل بين الشركات مع slug-based routing
- **AI Fabric 16-phase cascade** — Cache → Pattern → Rule → Memory → Budget Gate → AI
- **Invoice Brain** — Pattern learning: صفر تكلفة AI على الأشكال المتكررة
- **IDOR protection** — 54 من 56 handlers محمية + transaction-safe journal entries
- **Security pipeline** — CodeQL + TruffleHog + Gitleaks + audit remediation
- **Enterprise seeder** — 10 إلى 25,000 شركة ببيانات واقعية
- **MENA Expansion** — 20+ دولة + صفحات footer عربية كاملة
- **Valkey + BullMQ** — استبدال Redis بـ Valkey + معالجة مهام خلفية
- **Arabic-first** — واجهة عربية مع RTL كامل

## Architecture

```
Routes → Middleware (auth + rate limit) → Modules → lib/ai-fabric (cascade) → Providers
                │                                    │
                ▼                                    ▼
         Rate Limiter (7 limits)              16-Phase Cascade
                                                   │
              ┌────────────────────────────────────┘
              ▼
        Cache → Pattern → Rule → Memory → Budget Gate → AI
```

## Test Stats

- **1855+** ملف اختبار
- **1800+** حالة اختبار
- Founder Validation Suite مع 11 قسم
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

The OpenAPI spec covers 120+ endpoints across 16 tags:
Auth, Invoices, Clients, Catalog, Inventory, Accounting, HR, AI, Dashboard,
Settings, Automation, Webhooks, SaaS, Reports, Health, Companies

Key documentation features:
- JWT Bearer authentication via HttpOnly cookies
- Multi-tenant scoping (`companySlug` query param or `X-Company-Slug` header)
- Arabic field names and descriptions (RTL support)
- Kuwait Decree 10/2026 e-invoicing compliance fields
- Permission-based access control documented per endpoint
- Error response schemas with codes

## License

MIT — ahmedezzatelsayad · [github.com/ahmedezzatelsayad/Garfix](https://github.com/ahmedezzatelsayad/Garfix)