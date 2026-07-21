# GarfiX EOS — نظام ERP/فواتير متعدد المستأجرين مع طبقة ذكاء اصطناعي

> Enterprise-grade multi-tenant ERP with 16-phase AI cost optimization cascade.

**الإصدار:** 12.0.0 | **المؤلف:** ahmedezzatelsayad | **الترخيص:** MIT

## Tech Stack

| التقنية | الإصدار | الدور |
|---------|---------|-------|
| Next.js | 15 | App Router + Server Actions |
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
│   ├── app/api/             # Route handlers (56+ endpoints)
│   ├── modules/             # 20 domain UI modules
│   ├── lib/
│   │   ├── ai-fabric/       # 16-phase AI cascade engine
│   │   ├── invoice-brain/   # Pattern-first extraction
│   │   ├── founder-validation/ # 1855+ test suite
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
- **IDOR protection** — 54 من 56 handlers محمية
- **Security pipeline** — CodeQL + TruffleHog + Gitleaks
- **Enterprise seeder** — 10 إلى 25,000 شركة ببيانات واقعية
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
- **1500+** حالة اختبار
- 6 ملفات E2E (Playwright)

## License

MIT — ahmedezzatelsayad · [github.com/ahmedezzatelsayad/Garfix](https://github.com/ahmedezzatelsayad/Garfix)