# GarfiX — Evidence Matrix

> Internal reference for all README claims. Each claim is mapped to repository evidence with confidence level.
> This document is NOT user-facing — it exists for documentation integrity auditing.

**Last verified:** 2026-08-15 (commit `745ca5e6`)

---

## Repository Metrics

| Claim | Value | Evidence | Confidence |
|-------|------:|----------|------------|
| API routes | 257 | `find src/app/api -name 'route.ts' \| wc -l` → 257 | High |
| OpenAPI paths | 257 | `docs/api/openapi.yaml` paths count → 257 | High |
| OpenAPI operations | 397 | `scripts/generate-openapi-spec.ts` output | High |
| OpenAPI schemas | 48 | `scripts/generate-openapi-spec.ts` output | High |
| Route ↔ OpenAPI match | 1:1 | `scripts/openapi-validation.ts` → Missing: 0, Extra: 0 | High |
| Prisma models | 106 | `grep -c '^model ' prisma/schema.prisma` → 106 | High |
| Migrations | 48 | `ls -d prisma/migrations/*/ \| wc -l` → 48 | High |
| Test files | 1,736 | `find . -name '*.test.ts' -not -path './node_modules/*'` → 1,736 | High |
| E2E specs | 12 | `find e2e -name '*.spec.ts' \| wc -l` → 12 | High |
| CI/CD workflows | 8 | `ls .github/workflows/*.yml` → 8 | High |
| src/lib files | 1,948 | `find src/lib -name '*.ts' \| wc -l` → 1,948 | High |
| npm dependencies | 63 prod + 17 dev | `package.json` | High |
| E-invoicing adapters | 7 | `src/lib/e-invoicing/router.ts` authority map | High |

---

## Architecture Claims

| Claim | Evidence | Confidence |
|-------|----------|------------|
| Next.js 16 App Router | `package.json` next ^16.1.1, `next.config.ts` | High |
| React 19 | `package.json` react ^19.0.0 | High |
| Bun 1.3.14 runtime | `package.json` engines, `Dockerfile` | High |
| PostgreSQL 17 | `prisma/schema.prisma` provider, `docker-compose.prod.yml` | High |
| Prisma 6.11.1 | `package.json` | High |
| Valkey 8.1 | `docker-compose.prod.yml` valkey/valkey:8.1-alpine | High |
| BullMQ ^6.0.10 | `package.json`, `src/lib/queues.ts` | High |
| Standalone output | `next.config.ts` output: "standalone" | High |
| 3-stage Docker build | `Dockerfile` (deps → builder → runner) | High |
| Non-root Docker user | `Dockerfile` USER nextjs:nodejs (UID 1001) | High |
| Read-only root filesystem | `docker-compose.prod.yml` read_only: true | High |

---

## Security Claims

| Claim | Evidence | Confidence |
|-------|----------|------------|
| JWT HS256 (algorithm pinned) | `src/lib/auth.ts` verifyToken with algorithms: ["HS256"] | High |
| Access token 30min, refresh 30d | `src/lib/auth.ts` ACCESS_TTL=1800, REFRESH_TTL=2592000 | High |
| Refresh token rotation | `src/lib/auth.ts` resolveAuth rotates on silent refresh | High |
| JTI blacklisting via Valkey | `src/lib/auth.ts` blacklistToken, isTokenBlacklisted | High |
| SessionRegistry (DB-backed) | `prisma/schema.prisma` model SessionRegistry | High |
| MFA TOTP RFC 6238 | `src/lib/mfa.ts` 30s period, 6 digits, SHA1, ±1 window | High |
| 128-bit recovery codes | `src/lib/mfa.ts` 16 random bytes per code | High |
| AES-256-GCM encryption | `src/lib/cryptoVault.ts` aes-256-gcm, scrypt N=16384 | High |
| CSRF double-submit | `middleware.ts` inv_csrf cookie + x-csrf-token header | High |
| Per-request CSP nonce | `middleware.ts` crypto.getRandomValues(16 bytes) | High |
| SSRF DNS pinning | `src/lib/ssrf.ts` fetchSafe with dns.lookup + IP validation | High |
| Rate limiting (10 tiers) | `src/lib/rateLimit.ts` LIMITS object | High |
| Webhook HMAC raw body signing | `src/lib/webhooks.ts` signs bodyString, sends same string | High |
| Webhook HMAC key-order sensitivity | `src/lib/__tests__/webhooks.test.ts` 3 canonicalization tests | High |
| Anti-enumeration (SEC-06) | `src/app/api/auth/login/route.ts` identical 401 for all failures | High |
| RLS via Prisma $extends + ALS | `src/lib/db.ts` tenantRls interceptor, `src/lib/tenant-context.ts` | High |
| Audit logging + tamper chain | `src/lib/audit.ts` logAudit + TamperEvidenceChain | High |
| PII redaction in audit logs | `src/lib/audit.ts` SENSITIVE_KEY_RE (22 patterns) | High |
| Bcrypt cost 12 | `src/lib/auth.ts` BCRYPT_ROUNDS default 12 | High |
| Body size limit 1 MiB | `src/lib/api.ts` parseJsonBody MAX_JSON_BODY_BYTES | High |

---

## E-Invoicing Claims

| Claim | Evidence | Confidence |
|-------|----------|------------|
| Egypt: Live submission | `router.ts` calls submitEgyptEtaInvoice(), returns ok:true | High |
| Bahrain: Live submission | `router.ts` calls submitBahrainNbrInvoice(), returns ok:true | High |
| Oman: Live submission | `router.ts` calls submitOmanTaxInvoice(), returns ok:true | High |
| Qatar: Not required | `router.ts` default case returns ok:true, "not_required" | High |
| ZATCA: Stub (simulation endpoints) | `zatca.ts` uses `gw-fatoora.zatca.gov.sa/e-invoicing/simulation/v2` | High |
| ZATCA: Placeholder ECDSA | `zatca.ts` line 687 "Signature placeholder" | High |
| UAE: Stub (placeholder PKI) | `uae-fta.ts` line 708 "PKI signature placeholder" | High |
| Kuwait: Stub (API not published) | `kuwait.ts` line 503 "placeholder since portal API hasn't been published" | High |
| Router returns ok:false for stubs | `router.ts` P1 fix: was fake ok:true, now ok:false | High |

---

## AI System Claims

| Claim | Evidence | Confidence |
|-------|----------|------------|
| 6-stage cascade | `src/lib/ai-fabric/gateway.ts` executeCascade() | High |
| 7 AI providers | `src/lib/aiProvider.ts` ProviderType enum: z-ai, deepseek, openrouter, anthropic, openai, gemini, custom | High |
| Per-tenant budget gate | `src/lib/ai-fabric/budget-engine.ts` checkBudgetGate() | High |
| Circuit breakers per provider | `src/lib/circuit-breaker/` externalBreakers: openrouter, deepseek, gemini, myfatoorah, paymob, whatsapp, zatca, uae-fta, email-smtp, valkey | High |
| Encrypted API key pool | `src/lib/ai/keyVault.ts` + cryptoVault.encryptSecret | High |
| Cost tracking per request | `AIRequestLog` model in schema.prisma | High |

---

## Queue/Infrastructure Claims

| Claim | Evidence | Confidence |
|-------|----------|------------|
| 3-tier queue fallback | `src/lib/queues.ts` BullMQ → pg-boss → in-process | High |
| 7 queue names | `src/lib/queues.ts` QUEUE_NAMES enum | High |
| Transactional outbox | `src/lib/outbox.ts` appendToOutbox + startOutboxRelay | High |
| At-least-once delivery | `src/lib/outbox.ts` relay + consumer idempotency requirement | High |
| Dead-letter after 10 attempts | `src/lib/outbox.ts` OUTBOX_MAX_ATTEMPTS default 10 | High |
| L1+L2 cache with pub/sub | `src/lib/cache.ts` cacheGet/cacheSet + onCacheInvalidate | High |
| 12 circuit breakers | `src/lib/circuit-breaker/` externalBreakers + standalone breakers | High |
| OpenTelemetry (single source) | `src/lib/telemetry-sdk.ts` (otel.ts re-exports) | High |
| 4 Grafana dashboards | `scripts/grafana/dashboard-*.json` (4 files) | High |

---

## Deployment Claims

| Claim | Evidence | Confidence |
|-------|----------|------------|
| Docker Compose self-contained | `docker-compose.prod.yml` (postgres + valkey + app) | High |
| AWS EC2 deploy workflow | `.github/workflows/deploy-aws.yml` | High |
| Setup wizard (6 steps) | `src/app/setup/page.tsx` + 6 API routes under `/api/setup/` | High |
| Vercel not validated | `middleware.ts` imports Node modules; no Vercel test in CI | Medium |
| Health endpoint | `/api/health` route exists | High |

---

## CI/CD Claims

| Claim | Evidence | Confidence |
|-------|----------|------------|
| CI: TypeScript + ESLint + Build | `.github/workflows/ci.yml` | High |
| E2E: Playwright with PG + Valkey | `.github/workflows/e2e.yml` service containers | High |
| Security: 13 test files, 356 tests | `.github/workflows/security.yml` | High |
| Performance: bundle size + k6 | `.github/workflows/performance.yml` | High |
| Lighthouse nightly (informational) | `.github/workflows/performance-nightly.yml` continue-on-error | High |

---

## Verified Commands

| Command | Purpose | Verified |
|---------|---------|----------|
| `bun install` | Install deps | ✅ 799 packages |
| `bunx prisma generate` | Generate Prisma client | ✅ |
| `bunx prisma migrate deploy` | Apply migrations | ✅ 48 migrations |
| `bunx tsc --noEmit` | TypeScript check | ✅ 0 errors |
| `bunx eslint` (changed files) | Lint | ✅ 0 errors, 0 warnings |
| `bun run build` | Production build | ✅ standalone output |
| `bun run scripts/generate-openapi-spec.ts` | Generate OpenAPI | ✅ 257 paths |
| `bun run scripts/openapi-validation.ts` | Validate OpenAPI vs routes | ✅ 1:1 match |
| `bun test src/lib/__tests__/webhooks.test.ts` | HMAC tests | ✅ 53 pass (incl. 3 canonicalization) |

---

## Contradictions Found and Corrected

| Area | Old Claim | Actual State | Action Taken |
|------|-----------|--------------|--------------|
| API routes | 254 | 257 | Corrected in README |
| Test files | ~1,735 | 1,736 | Corrected in README |
| package.json name | nextjs_tailwind_shadcn_ts | garfix (fixed) | Renamed |
| package.json version | 0.2.0 | 12.1.0 (fixed) | Aligned with next.config.ts |
| OpenAPI spec | v12.0-LEGACY only | Generated fresh 257-path spec | Created docs/api/openapi.yaml |
| OTel systems | Two overlapping setups | Consolidated to telemetry-sdk.ts | Merged |
| Webhook HMAC | Signed re-serialized JSON | Signs raw body string | Fixed + tested |
| Vercel | "incompatible" | "not currently supported/validated" | Softened wording |
| E-invoicing | "7 countries supported" | 3 live + 3 stub + 1 not required | Detailed table added |
