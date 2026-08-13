# P5-DOC1 FIX (Audit v2 · Phase 5): Architecture Documentation

## System Overview

Garfix is a modular enterprise monolith ERP & Financial SaaS platform built on
Next.js 16 (App Router) with a 4-layer architecture.

## Architecture Layers

### 1. Presentation Layer (24 pages × 3 viewports)
- React 19 + Tailwind CSS 4 + GarfiX DS v4.0 (43 components)
- shadcn/ui (47 components)
- Cairo font (Arabic + Latin subsets)
- RTL layout (dir="rtl" + logical properties)
- WCAG 2.1 AAA compliance (contrast ≥ 7:1, focus-visible, skip-nav)

### 2. API Layer (250 routes)
- Next.js Route Handlers (Node.js runtime)
- Auth: JWT (HS256, 32+ char secret) + refresh token rotation
- RBAC: assertCompanyAccess + permission checks
- CSRF: double-submit cookie pattern
- Rate limiting: Valkey-based (sliding window, atomic Lua)
- Audit logging: logAudit() on all mutations
- Tenant isolation: ALS + Prisma $extends + PostgreSQL RLS (strict policies)

### 3. Business Logic Layer (9 modules)
- **Accounting**: double-entry journal, chart of accounts, fiscal periods
- **AI Fabric**: 6-stage cascade (cache → pattern → rule → memory → budget → AI)
- **E-Invoicing**: ZATCA (Saudi), ETA (Egypt), UAE FTA, Bahrain, Oman, Qatar, Kuwait
- **Inventory**: multi-warehouse, stock movements, reorder levels
- **HR & Payroll**: WPS compliance, attendance, leave management
- **Billing & SaaS**: subscription engine, dunning, per-feature quotas
- **Reports**: general ledger, trial balance, P&L, balance sheet
- **Automation**: rule engine, webhook delivery, BullMQ workers
- **Bulk Input**: CSV/Excel import, AI-powered parsing

### 4. Infrastructure Layer
- **PostgreSQL 17**: 106 Prisma models, 40 migrations, RLS enabled
- **Valkey 8** (Redis fork): rate limiting, cache, session registry, BullMQ queues
- **Crypto Vault**: AES-256-GCM (scrypt key derivation, per-deployment salt)
- **Storage**: S3/Local with tenant-scoped access
- **Backup**: pg_dump (PGPASSWORD env) + AES-256 encryption + restore drill

## Multi-Tenancy Model

```
Request → withErrorHandler → resolveAuth → ALS tenant context
                                              ↓
Prisma $extends interceptor reads ALS
                                              ↓
$transaction + set_config('app.current_company_slug', slug, true)
                                              ↓
RLS policy: tenant_isolation_strict (no IS NULL bypass)
                                              ↓
platform_admin_bypass policy (founder/admin via app.is_platform = 'on')
```

### Coverage
- 222 routes: automatic tenant scoping via ALS + Prisma extension
- 28 routes: exempt (public/inbound webhooks/health/docs)
- Total: 250 routes = 222 + 28 ✅

## AI Provider Cascade

```
DeepSeek (primary, paid)
  ↓ on failure
Gemini (fallback, vision-capable)
  ↓ on failure
OpenRouter (multi-model)
  ↓ on failure
OpenAI (last resort)
  ↓ on failure
Regex fallback (pattern extraction, no AI cost)
```

### Cost Optimization (6-stage cascade)
1. **Cache**: hash-based cache hit (Valkey)
2. **Pattern**: regex pattern matching
3. **Rule**: business rule evaluation
4. **Memory**: AI Fabric memory (previous similar requests)
5. **Budget**: per-tenant budget gate
6. **AI**: actual provider call (logged with cost)

## Security Architecture

### Defense in Depth
1. **App layer**: assertCompanyAccess + where: { companySlug }
2. **DB layer**: RLS strict policies (no bypass)
3. **Network**: CSP nonce, HSTS, COOP/COEP, X-Frame-Options
4. **Auth**: JWT rotation + blacklist + session registry
5. **Crypto**: AES-256-GCM at rest, scrypt key derivation
6. **MFA**: TOTP (RFC 6238) + 128-bit recovery codes + replay protection

### Fail-Closed Strategy (SEC-04)
- Valkey down → token blacklist rejects (not accepts)
- Valkey down → MFA rejects (not allows)
- Valkey down → writes fail (not silently succeed)
- Gated by VALKEY_FAIL_MODE env (default: "closed")

## Deployment

### Docker (3-stage build)
1. `deps`: install dependencies
2. `builder`: compile Next.js
3. `runner`: minimal Alpine image (non-root, read-only FS, tmpfs)

### CI/CD
- GitHub Actions: lint → typecheck → build → test → security scan
- Trivy + TruffleHog + Gitleaks + CodeQL
- Bundle size budget enforcement
- E2E tests (Playwright, 10 specs)

### Observability
- OpenTelemetry: traces + metrics (OTLP HTTP exporter)
- Prometheus /metrics endpoint
- 4 Grafana dashboards (API Health, AI Spend, DB Performance, Cache/Queue)
- k6 load testing (p95 < 200ms gate)

## Key Decisions (ADRs)

### D1: RLS as Defense Layer
RLS policies are strict (no IS NULL bypass). Tenant context is set via ALS +
Prisma extension bridge, not per-route codemod.

### D2: WCAG 2.1 AAA
Target is AAA (7:1 contrast), not AA (4.5:1). All docstrings updated.

### D3: Vercel Pages Purged
Legacy Vercel escape-hatch pages deleted (not fixed).

### D4: VAULT_SALT Rotation
Initial deployment uses backward-compat salt, then rotates via script.

### D5: Recovery Code Format
128-bit entropy (was 32-bit). Existing users must regenerate.

### D6: founder-validation Tests Out of CI
CI runs only 108 production tests (not 1,628 founder-validation tests).

---

*Generated by Z.ai Senior Architect Agent — Phase 5*
