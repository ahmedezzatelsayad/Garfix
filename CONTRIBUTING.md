# Contributing to GarfiX ERP

## Development Setup

```bash
git clone https://github.com/ahmedezzatelsayad/Garfix.git
cd Garfix
bun install
cp .env.example .env.local  # Fill in required vars
bunx prisma generate
bunx prisma migrate deploy
bun run dev  # http://localhost:3000
```

## Required Environment Variables

See `.env.example` for the full list. Required for dev:
- `DATABASE_URL` — PostgreSQL connection string
- `VALKEY_URL` — Valkey/Redis connection string
- `JWT_SECRET` + `JWT_REFRESH_SECRET` — ≥ 32 chars each, different
- `FOUNDER_EMAIL` — Founder account email
- `PAYMENTS_ENC_KEY` — ≥ 32 chars, AES-256 encryption key

## Code Style

- **Language**: TypeScript (strict mode, but `noImplicitAny: false` — being migrated)
- **Runtime**: Bun (NOT npm — `bun.lock` is canonical, `package-lock.json` is gitignored)
- **Linter**: ESLint with Next.js config. Critical rules enabled: `no-debugger`, `no-unreachable`, `no-fallthrough` (all `error`), `no-undef` (`warn`)
- **Formatter**: No enforced formatter — match surrounding code style
- **Comments**: Arabic comments for business logic, English for technical/infra

## PR Checklist

Before submitting a PR:
- [ ] `bunx tsc --noEmit` passes with 0 errors
- [ ] `bunx eslint .` passes with 0 errors (warnings OK)
- [ ] `bun test src/lib/__tests__/` passes
- [ ] `bun run build` succeeds
- [ ] No `@ts-nocheck` added to new files
- [ ] No `console.log` in production code (use `logger.info/debug/warn/error`)
- [ ] No secrets committed (PATs, API keys, passwords)
- [ ] Multi-tenant: all DB queries scope by `companySlug`
- [ ] API routes use `parseJsonBody()` (not raw `req.json()`)
- [ ] New AI endpoints apply `sanitizeUserMessages()` + `redactPii()`

## Testing

- **Unit tests**: `src/lib/__tests__/*.test.ts` — run via `bun test`
- **E2E tests**: `e2e/*.spec.ts` — run via `bunx playwright test`
- **Contract tests**: `src/lib/__tests__/api-contract.test.ts` — validates API response shapes
- Tests use `bun:test` (NOT vitest — vitest files were migrated in Sprint 8)

## Database Migrations

```bash
# Create a new migration
bunx prisma migrate dev --name descriptive_name

# Apply migrations to production
bunx prisma migrate deploy

# Check migration status
bunx prisma migrate status
```

- ALL migrations are forward-only (no `down` migrations)
- Destructive migrations (DROP COLUMN/TABLE) require a backup first
- Test on a staging DB before production

## Security

- **Vulnerability disclosure**: See [SECURITY.md](./SECURITY.md)
- **Never commit secrets**: Use SSM Parameter Store in production
- **CSRF**: All mutating endpoints require `X-CSRF-Token` header (double-submit pattern)
- **Auth**: Use `requireAuth()` / `requirePermission()` in every route handler
- **Rate limiting**: Sensitive endpoints (login, AI, webhooks) have per-user + per-IP limits

## Architecture

- **Next.js 16 App Router** with dual-mode: AWS (full React) vs Vercel (pure HTML)
- **Prisma 6** with PostgreSQL 17 + Valkey 8.1
- **Multi-tenancy**: `companySlug` scoping on all tenant data (app-layer, not RLS)
- **AI**: 5-layer fallback chain (OpenRouter → Gemini → DeepSeek → z-ai → regex)
- **Queues**: BullMQ (Valkey) with pg-boss fallback (PostgreSQL)

## Questions?

Contact: `founder@garfix.app`
