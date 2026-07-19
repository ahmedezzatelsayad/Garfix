# GarfiX EOS — Roadmap of Deferred Work

This document lists every item that was deferred during the v13 fix pass, with rationale, prerequisite, and rough effort estimate. Items are ordered by recommended priority.

---

## Priority 1 — Pre-Production Blockers (founder action required)

### 1.1 Link Git to GitHub Remote
- **Prerequisite:** Founder has a GitHub account + Personal Access Token.
- **Action:**
  ```bash
  git remote add origin git@github.com:<founder-username>/garfix-eos.git
  git push -u origin main
  ```
- **Effort:** 5 minutes.
- **Why now:** GATE 0 step 4 explicitly requires this. Without it, another workspace reset loses everything again.

### 1.2 Set Production Environment Variables
- **Required for production deploy:**
  - `DATABASE_URL` — PostgreSQL connection string (not SQLite file path).
  - `JWT_SECRET` — 32+ random chars.
  - `JWT_REFRESH_SECRET` — different 32+ random chars.
  - `FOUNDER_EMAIL` — the founder's actual email.
  - `FOUNDER_PASSWORD` — 8+ chars, set BEFORE running `bun run seed` in production. The seed script will refuse to run in production without this.
  - `PAYMENTS_ENC_KEY` — 32+ chars, used by `cryptoVault` to encrypt integration API keys at rest.
- **Effort:** 10 minutes (mostly generating secrets via `openssl rand -hex 32`).

### 1.3 PostgreSQL Migration
- **Prerequisite:** PostgreSQL instance provisioned (e.g., Supabase, Neon, RDS, or self-hosted).
- **Action:**
  1. Set `DATABASE_URL` to the PG connection string.
  2. `bunx prisma migrate deploy` (or `bunx prisma db push` for first-time setup).
  3. In PG, enable the `pg_trgm` extension: `CREATE EXTENSION IF NOT EXISTS pg_trgm;`
  4. Add a GIN index on `ProductCatalog.name` for fuzzy matching:
     ```sql
     CREATE INDEX idx_product_catalog_name_trgm ON "ProductCatalog" USING GIN (name gin_trgm_ops);
     ```
  5. Switch `total` column from `String` (SQLite Decimal-as-text workaround) to `Decimal` in `prisma/schema.prisma`. Then `bunx prisma migrate dev --name decimal-totals`.
  6. After migration, replace the `findMany`-then-sum workaround in `src/app/api/ai/chat/route.ts` and `src/app/api/ai/chat/stream/route.ts` with the proper `db.invoice.aggregate({ _sum: { total: true } })`. The TODOs are already in the code.
- **Effort:** 2-4 hours (depending on data migration complexity).
- **Why now:** Master Plan GATE 8.1. SQLite is fine for dev but won't scale past ~10 concurrent tenants.

### 1.4 Production Queue System
- **Prerequisite:** PostgreSQL (1.3 above).
- **Action:** Replace the in-memory queue in `src/lib/queues.ts` with `pg-boss` or `graphile-worker`. The current implementation has retries + dead-letter log (added in FIX_REPORT_2) but is in-memory — lost on server restart.
- **Effort:** 4-6 hours.
- **Why now:** Master Plan GATE 8.2. Critical for production reliability.

---

## Priority 2 — Code Quality (mechanical refactors)

### 2.1 Logger Signature Fix (97 files)
- **Problem:** 92 of the 126 `tsc --noEmit` errors are `logger.info(meta, msg)` calls where the logger expects `logger.info(msg, meta)`. The function signature is `info(message: string, meta?: Record<string, unknown>)` but the codebase has it backwards across 97 files.
- **Action:** Mechanical find-and-replace:
  - Find: `logger.info({ ...meta }, "message string")`
  - Replace: `logger.info("message string", { ...meta })`
  - Same for `logger.warn`, `logger.error`, `logger.debug`.
- **Files affected:** `src/lib/rateLimit.ts`, `src/lib/startupCheck.ts`, `src/lib/storage.ts`, `src/lib/cache.ts`, and ~93 others.
- **Effort:** 1-2 hours (could be automated with a codemod).
- **Risk:** Low — pure mechanical refactor. Run `bun test` after to confirm no behavior change.
- **Why now:** Drops `tsc --noEmit` from 126 → ~34 errors, making future type-errors immediately visible.

### 2.2 `ignoreBuildErrors` Removal
- **Problem:** `next.config.ts` may contain `typescript: { ignoreBuildErrors: true }` and `eslint: { ignoreDuringBuilds: true }`. These silently swallow type/lint errors during `next build`, which is how the original v12 shipped with 131 tsc errors.
- **Action:**
  1. Read `next.config.ts`. Remove the `ignoreBuildErrors` / `ignoreDuringBuilds` flags.
  2. Run `bunx tsc --noEmit` and fix any new errors that surface (mostly the logger signature issues from 2.1).
  3. Run `bunx next build` and confirm it succeeds with zero errors.
- **Effort:** 30 minutes (after 2.1 is done).
- **Why now:** Without this, production builds will silently ship type errors.

### 2.3 IDOR WARN Follow-up
- **Problem:** `src/app/api/companies/[slug]` DELETE uses inline `resolveAuth + isFounderEmail` instead of `requireFounder(req)`. The founder email check is correct, but it skips the `emailVerified` defense-in-depth check that `requireFounder` enforces.
- **Action:** Replace the inline check with `const founderAccess = await requireFounder(req); if (founderAccess instanceof NextResponse) return founderAccess;` (matches the pattern already used in PATCH and DELETE on the same file).
- **Effort:** ~5 minutes (3-line change).
- **Why now:** Closes the last IDOR audit finding from GATE 3.

---

## Priority 3 — UI/UX Modernization (multi-day refactors)

### 3.1 Inline-Style → Tailwind Migration
- **Problem:** GLM handoff P1.1 lists 19 files with 41-151 inline `style={{}}` occurrences each (~1300+ total). The project ships a full Tailwind + shadcn/ui setup (48 components under `src/components/ui`) but most feature modules bypass it.
- **Files affected (largest first, per GLM handoff guidance):**
  | File | Count |
  |---|---|
  | `src/modules/accounting/AccountingView.tsx` | 151 |
  | `src/modules/invoices/InvoicesView.tsx` | 134 |
  | `src/modules/bulk-input/BulkInputView.tsx` | 87 |
  | `src/modules/landing/LandingPage.tsx` | 80 |
  | `src/modules/clients/ClientsView.tsx` | 77 |
  | `src/modules/team/TeamView.tsx` | 74 |
  | `src/modules/hr/HRView.tsx` | 74 |
  | `src/modules/admin/PlatformAdminPanel.tsx` | 67 |
  | `src/modules/onboarding/SetupWizard.tsx` | 59 |
  | `src/modules/inventory/InventoryView.tsx` | 58 |
  | `src/modules/clients/ClientProfile.tsx` | 56 |
  | `src/modules/purchases/PurchasesView.tsx` | 53 |
  | `src/modules/hr/GratuityCalculator.tsx` | 51 |
  | `src/modules/ai/AICopilotBubble.tsx` | 49 |
  | `src/modules/catalog/CatalogView.tsx` | 48 |
  | `src/modules/saas/SaaSControlPanel.tsx` | 45 |
  | `src/modules/reports/ReportsView.tsx` | 41 |
  | `src/modules/common/Sidebar.tsx` | 41 |
  | `src/modules/dashboard/DashboardView.tsx` | 40 |
- **Constraints:**
  - Do NOT touch `src/components/garfix/ErrorBoundary.tsx` — its inline styles are intentional (must survive even if Tailwind/CSS fails to load).
  - Use the existing CSS variables in `src/app/globals.css` (`--primary`, `--muted-foreground`, `--destructive`, etc.) via Tailwind color tokens, NOT raw `var(--...)` inline strings.
  - After each file: run `bunx tsc --noEmit` AND take a before/after screenshot to verify no visual regression.
- **Effort:** ~3-5 days (one PR per file is ideal for review).
- **Why now:** Without this, responsive design (3.2) is wasted effort.

### 3.2 Responsive Design
- **Problem:** GLM handoff P1.2. Zero instances of `matchMedia`, `useMediaQuery`, `innerWidth`, or Tailwind responsive prefixes (`sm:`, `md:`, `lg:`) under `src/modules`. Layouts use fixed pixel values and at best `flexWrap: "wrap"`. This is a business app likely accessed on phones by staff.
- **Action:** As part of the Tailwind migration above, add responsive breakpoints (`sm:`/`md:`/`lg:`) to at minimum:
  - `AppShell` — sidebar should collapse to a drawer below `md`.
  - `Sidebar` — full-width drawer on mobile, fixed rail on desktop.
  - `DashboardView` — single-column on mobile, multi-column on `lg`.
  - `InvoicesView` — table becomes card list on mobile.
  - `ClientsView` — same.
  - Verify each at 375px (iPhone SE), 768px (iPad), 1280px (laptop).
- **Effort:** ~2 days (after 3.1 is done).
- **Why now:** Without this, mobile users have a degraded experience.

---

## Priority 4 — Founder Panel Polish

### 4.1 Review Queue Management Screen
- **Problem:** GATE 4 item 5. The `/api/product-matching/review` endpoint exists and is linked from the BulkInputView banner (GATE 5), but only as a JSON link. There's no founder-facing UI for managing the review queue across all tenants.
- **Action:** Build a new tab in PlatformAdminPanel showing pending review-queue items with: tenant, input text, suggested match (if any), confidence, action buttons (accept / reject / override). Filterable by tenant.
- **Effort:** ~1 day.
- **Why now:** Closes the last open GATE 4 item.

### 4.2 Usage-vs-Plan Visualization
- **Problem:** GATE 4 item 3. The data is already surfaced (AI Usage tab + per-tenant Support View drawer), but there's no "this tenant is at 80% of their plan's invoice quota" view.
- **Action:** Add a "plan utilization" column to the tenants table showing % of quota used (invoices / AI calls / storage) with a color-coded bar.
- **Effort:** ~4 hours.
- **Why now:** Founder-facing operational visibility.

### 4.3 Admin P2 Deferred Items
- **`retention-cleanup` UI** — ops-only, low frequency. Can be triggered via curl. Build a simple "trigger cleanup" button in the founder panel when this becomes a regular ops task. ~2 hours.
- **`integrations` founder view** — needs design: should the founder see all integrations across all tenants, or per-tenant? Currently each integration has its own settings screen in the tenant view. ~1-2 days depending on scope.
- **`landing-content` CMS** — needs landing-page schema design first. ~2-3 days.

---

## Priority 5 — Testing & CI/CD

### 5.1 Complete the Test Suite (GATE 2 remaining)
- **`task1-100-cases.test.ts`** — needs `garfix_test_invoices.json` fixture. Ask the founder to provide it (or generate from production data, anonymized).
- **`collision-recovery-audit.test.ts`** — needs a running SQLite/PG instance with the full Prisma schema migrated. The test scaffold is in place; just needs `DATABASE_URL` set + `bunx prisma db push` before running.
- **`b10-performance-benchmark.test.ts`** — needs PostgreSQL first (GATE 8.1). The 100M-row benchmark can't run on SQLite.
- **Effort:** 1-2 days once the prerequisites are met.

### 5.2 GATE 6 — Tenant User E2E
- **Action:** Manual end-to-end test of the tenant user journey:
  1. Login → create mixed Arabic/English invoice (some existing products, some new → triggers all 4 match tiers including AI zone).
  2. Review the review queue if it has pending suggestions.
  3. Create a purchase invoice.
  4. View inventory report + verify numbers match actual movements.
  5. Use one of the 6 HR sub-modules.
  6. Change password from settings.
  7. View Tenant Overview (if role allows).
- **Effort:** 2-3 hours (manual testing).
- **Why now:** Catches integration bugs that unit tests miss.

### 5.3 GATE 7 — Founder E2E
- **Action:** Manual end-to-end test of the founder journey:
  1. View all companies + switch between them (Support View from GATE 4).
  2. Review the review queue across all companies (not single-tenant).
  3. Review queue-failures (dead-letter log).
  4. Review StockMovement ledger for a specific company.
  5. Edit product-matching thresholds for a company + verify the change applies.
  6. Soft-delete a test company + verify financial records retained for 5 years (per worklog decision).
- **Effort:** 2-3 hours (manual testing).

### 5.4 Docker + CI/CD (GATE 8.3)
- **Prerequisite:** GitHub remote linked (1.1).
- **Action:**
  1. Write `Dockerfile` (multi-stage: install deps → build → run).
  2. Write `docker-compose.yml` (app + PostgreSQL + Redis if needed).
  3. Write GitHub Actions workflow: on push to `main` → run `bun install` → `bunx prisma generate` → `bunx tsc --noEmit` → `bun test` → `bunx next build`. Block merge on any failure.
  4. Optional: auto-deploy to a staging environment on green builds.
- **Effort:** 1-2 days.
- **Why now:** Without CI, the type errors and logger-signature issues will silently regress.

### 5.5 100M Load Test (GATE 8.4)
- **Prerequisite:** PostgreSQL (1.3).
- **Action:** Use the B.12 prompt (from a prior session, not in this zip) to seed 100M rows and benchmark query performance. Identify bottlenecks.
- **Effort:** 1 day.
- **Why now:** Validates that the schema + indexes scale to production traffic.

---

## Priority 6 — Documentation

### 6.1 API Reference
- **Problem:** No `docs/api-reference.md` exists. The `/api` root returns a JSON info block but there's no human-readable reference for the ~60 endpoints.
- **Action:** Auto-generate from the route files. Each route already has a docstring at the top; extract them into a single markdown file. Could be a `scripts/gen-api-docs.ts` script that walks `src/app/api/` and emits markdown.
- **Effort:** 4-6 hours.

### 6.2 Architecture Decision Records (ADRs)
- **Problem:** Several architectural decisions are scattered across `worklog.md`, code comments, and the handoff prompts. No central ADR log.
- **Action:** Create `docs/adr/` directory with one markdown file per decision:
  - ADR-001: Multi-tenant via shared DB + `companySlug` column (not separate schemas).
  - ADR-002: JWT in httpOnly cookies (not localStorage).
  - ADR-003: Single-route SPA (`src/app/page.tsx` is the only page; modules render client-side).
  - ADR-004: Oversell blocked, not backordered (Task 24).
  - ADR-005: Orphan items recorded as zero-qty StockMovement + pushed to review queue.
  - ADR-006: Soft-delete for tenants; hard-delete requires type-to-confirm; financial records retained 5 years.
  - ADR-007: Queue retries (3 attempts, 1s/5s/15s backoff) + in-memory dead-letter log (100/queue). Pending PG migration to `pg-boss`.
  - ADR-008: AI provider fallback chain (priority order, retry on failure).
  - ADR-009: Password policy: 8+ chars + letter + digit (applied uniformly across register/reset/change).
  - ADR-010: `emailVerified: true` auto-set on register (deliberately no email-verification step).
- **Effort:** ~4 hours (one ADR is ~1 page).

---

## Summary

| Priority | Items | Est. Effort | Prerequisite |
|----------|-------|-------------|--------------|
| 1 — Pre-Production | GitHub remote, env vars, PG migration, queue system | 6-10 hours | Founder action |
| 2 — Code Quality | Logger fix, ignoreBuildErrors removal, IDOR WARN | 2-3 hours | None |
| 3 — UI/UX | Tailwind migration, responsive design | 5-7 days | None (do together) |
| 4 — Founder Panel | Review queue UI, usage-vs-plan, Admin P2 deferred | 3-5 days | None |
| 5 — Testing & CI | Complete test suite, GATE 6/7 E2E, Docker, load test | 4-5 days | PG migration for some |
| 6 — Documentation | API reference, ADRs | 1-2 days | None |

**Recommended next sprint:** Priority 1 + Priority 2. Get the project on GitHub, on PostgreSQL, with a clean `tsc --noEmit` (0 errors). That unblocks everything else.
