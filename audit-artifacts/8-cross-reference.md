# Audit 7 — Deep Cross-Reference Audit (Task ID: 8)

**Repository:** `/home/z/my-project/audit/Garfix/` (branch `main`, post-P2/P3/P4)
**Scope:** Build a complete dependency graph across 9 layers (Routes ↔ Components ↔ Hooks ↔ Services ↔ APIs ↔ Database ↔ Zod ↔ Forms ↔ UI ↔ Navigation) and detect broken chains, duplicates, legacy/shadow implementations, and dead code.
**Method:** Static analysis only — no files were modified. Findings cite `file:line` for every claim.

---

## Executive Summary

| Category | Count |
|----------|------:|
| Broken chains | **6** |
| Duplicate implementations | **7** |
| Legacy / shadow implementations | **8** |
| Dead code (functions/types/constants/files) | **62+** |
| Dead Prisma models (zero callsites) | **4** (+1 seeder-only) |
| Truly orphan API routes | **0** |
| Unused shadcn/ui primitives | **29 / 48** |
| Unused React Query hooks | **45 / 282** |
| Query-key collisions | **0** (factory pattern prevents it) |

**The single most impactful finding** is the toast system split (Finding C-1): the legacy `<Toaster />` from `@/components/ui/toaster` is mounted in `layout.tsx:97` but is never fed any toasts; meanwhile every UI feedback call (`toast.success` / `toast.error` / `toast.info`) across 51 module files uses the `sonner` package whose `<Toaster />` (`@/components/ui/sonner`) is **never mounted**. The user-visible symptom is: **no toast notifications ever appear in the app**, even though every form-submit success/error handler calls one. This is a P0 UX bug.

---

## A. Broken Chains

A "broken chain" is a link in the Routes → Components → Hooks → Services → APIs → Database → Zod → Forms → UI → Navigation path where one layer is missing or mismatches the next.

| # | Chain | Broken Link | Severity | Fix |
|---|-------|-------------|----------|-----|
| A-1 | User action → `toast.success("تم…")` → visible notification | **No `<Toaster />` from `sonner` is mounted.** `layout.tsx:4,97` imports and renders the **legacy** `Toaster` from `@/components/ui/toaster` (which uses `useToast()` from `@/hooks/use-toast`). All 51 module files (`src/modules/**/*.tsx`) call `import { toast } from "sonner"` (the new package), but the sonner `<Toaster />` (defined in `src/components/ui/sonner.tsx`) is **never imported anywhere**. Result: every `toast.success/error/info` call silently does nothing visible. | **P0** | In `src/app/layout.tsx`, replace `import { Toaster } from "@/components/ui/toaster"` with `import { Toaster } from "@/components/ui/sonner"`. Delete `src/components/ui/toaster.tsx` and `src/hooks/use-toast.ts` (both are now dead — see D-1). |
| A-2 | Form (ClientForm, CompanySettingsForm, ClientForm, etc.) → react-hook-form → zodResolver → Zod schema → server-side schema | **No client form uses react-hook-form or zodResolver.** `rg -l 'zodResolver' src/` returns 0 hits. `rg -l 'react-hook-form' src/` returns 1 hit (`src/components/ui/form.tsx` — the shadcn primitive itself, which is never consumed). All forms in `src/modules/` use plain `useState` + manual `if (!name) toast.error(…)` validation (e.g. `src/modules/clients/ClientForm.tsx:35`). Server-side Zod schemas exist in 90+ `route.ts` files (`rg 'z\.object\(' src/app/api/ | wc -l` = 188) but are **never shared** with the client. Risk: client/server schema drift; client-side validation does not match server-side validation. | **P1** | Either (a) accept the split (server validates with Zod, client validates manually) and document it, OR (b) extract Zod schemas into `src/lib/schemas/*.ts` and import them on both sides with `zodResolver`. Recommend (b) for at least the auth + invoice + client flows. |
| A-3 | `useLogin` / `useLogout` / `useRegister` / `useForgotPassword` / `useResetPassword` / `useChangePassword` / `useUser` hooks (in `src/hooks/queries/auth.ts`) → `/api/auth/*` routes | **These 7 React Query auth hooks are never called.** `AuthContext.tsx` reimplements the same logic with raw `fetch()` calls (`src/context/AuthContext.tsx:rg 'fetch.*api/auth'` → 5 hits: `/api/auth/me`, `/api/auth/refresh`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/refresh`). The hooks are dead duplicates. | **P2** | Delete the 7 unused auth hooks from `src/hooks/queries/auth.ts`. Keep `useUpdateSaasUser` (used by `AccountView.tsx`). Document `AuthContext` as the canonical auth surface. |
| A-4 | `SettingsView` (AppShell switch entry `view === "settings"`) → settings hooks | **`SettingsView` itself calls zero data hooks.** It delegates to `CompanySettingsForm` (`useUpdateSettings`), `TemplateSettingsForm` (`useInvoiceTemplates`, `useUpdateSettings`), and `TemplateListManager` (`useCreateInvoiceTemplate`, etc.). The delegation is correct, but `SettingsView` is a thin orchestrator with no direct data binding — easy to miss in a graph audit. | LOW | No action needed; delegation is intentional. Document for future audits. |
| A-5 | `src/modules/common/OnboardingScreen.tsx` → AppShell onboarding fallback | **`OnboardingScreen` is never rendered.** AppShell.tsx comment (lines 22, 191, 196) claims it's "kept around as a fallback if SetupWizard itself errors out", but no code path actually renders it. `<ErrorBoundary>` wraps `<Suspense>` which directly contains `<SetupWizard>` — there's no `fallback={<OnboardingScreen />}` prop. | **P2** | Delete `src/modules/common/OnboardingScreen.tsx` (dead code — see D-2). Or wire it as the actual `<ErrorBoundary fallback={<OnboardingScreen />}>` if the intent was real. |
| A-6 | User clicks theme-toggle (Topbar) → `BrandContext.toggleTheme()` → `<html>.classList.toggle("dark")` | **Two theme systems run in parallel and fight over `<html>.classList`.** `Providers.tsx:43` mounts next-themes `<ThemeProvider attribute="class" defaultTheme="system" enableSystem>`. **In parallel**, `BrandContext.tsx` keeps its own `useState<"light"|"dark">`, reads `localStorage("garfix:theme")`, and calls `document.documentElement.classList.toggle("dark", …)` in a `useEffect`. The two stores use different localStorage keys (`"theme"` for next-themes, `"garfix:theme"` for BrandContext), so on reload next-themes reads its key (null → system pref) while BrandContext reads its key (user's last choice) — they re-apply the class in race order. The P3 worklog claimed this was fixed ("removed its own theme state + localStorage + document.documentElement.classList.toggle. Now delegates to next-themes' useTheme()") but the code still has all three (verified `BrandContext.tsx` lines around `theme`/`THEME_KEY`). | **P1** | Make `BrandContext.toggleTheme` call `next-themes`'s `setTheme("dark")`/`setTheme("light")`. Delete `BrandContext`'s `theme` state, `THEME_KEY`, and the `useEffect` that toggles `classList`. Keep only `useTheme()` from next-themes. |

---

## B. Duplicate Implementations

Same logic implemented in 2+ places. Cache drift and double-maintenance risk.

| # | Implementation 1 | Implementation 2 | Severity | Fix (which to keep) |
|---|------------------|------------------|----------|---------------------|
| B-1 | `src/lib/telemetry.ts` (legacy hand-rolled metrics + Span/Metric types + console output) | `src/lib/telemetry-sdk.ts` (P1.2 — real `@opentelemetry/sdk-node` wrapper, loaded from `instrumentation.ts`) AND `src/lib/telemetry/tracing.ts` (separate OTLP exporter using `@opentelemetry/api` directly, exported via `src/lib/telemetry/index.ts` barrel) | **P2** | Three implementations of "telemetry". Keep `telemetry-sdk.ts` (canonical — wraps the official SDK, started in `instrumentation.ts`). Delete `telemetry.ts` (legacy; its only consumer was `event-bus.ts` which is itself dead — see D-3). Merge `telemetry/tracing.ts`'s `traceApiRoute`/`traceDbQuery` helpers into `telemetry-sdk.ts` and delete `telemetry/` directory. |
| B-2 | `src/lib/queues.ts` (multi-tier queue: BullMQ → pg-boss → in-process) — used by 10 modules (`outbox.ts`, `backup.ts`, `subscription-engine.ts`, `productMatcher.ts`, `workers/*`, etc.) | `src/lib/queue-pgboss.ts` (standalone pg-boss wrapper, 270+ lines) — **never imported by any production code** (`rg -l '@/lib/queue-pgboss' src/` returns only `src/lib/workers/README.md`) | **P2** | Keep `queues.ts` (canonical). Delete `queue-pgboss.ts` (shadow; `queues.ts` already has its own pg-boss fallback tier — the comment in `queues.ts:rg 'pg-boss mode'` confirms). |
| B-3 | `src/lib/openapi/openapi.json` (599 KB, 207 paths) — served by `/api/docs/route.ts` | `src/lib/openapi/openapi.yaml` (450 KB, 207 paths) — rendered by `/api-docs/page.tsx` | **P2** | Two physical files containing the same OpenAPI 3.1 spec. Must be regenerated in lockstep or they drift. Pick one canonical format (recommend JSON — matches the `/api/docs` endpoint output) and generate the other from it at build time (e.g. `bun run scripts/generate-openapi-spec.ts --format yaml`). |
| B-4 | `src/hooks/queries/auth.ts` — `useLogin`, `useLogout`, `useRegister`, `useForgotPassword`, `useResetPassword`, `useChangePassword`, `useUser` (7 hooks, React Query + typed `apiGet`/`apiPost` client) | `src/context/AuthContext.tsx` — `login()`, `logout()`, `refresh()` methods using raw `fetch()` and managing user state in React context | **P2** | `AuthContext` is the canonical surface (used by every page). The 7 query hooks are dead duplicates (see A-3). Delete them. |
| B-5 | `src/hooks/queries/hr.ts:629` exports `useCommissions(companySlug)` | `src/hooks/queries/accounting.ts:1817` exports `useAccountingCommissions(companySlug, from?, to?)` | LOW | Already resolved by renaming — `accounting.ts` exports `useAccountingCommissions` (not `useCommissions`), and `VouchersDetailView.tsx:11` imports it with alias `useAccountingCommissions as useCommissions`. The **stale comment** in `src/hooks/queries/index.ts:7-9` claims duplicates still exist — fix the comment. |
| B-6 | `src/hooks/queries/platform-admin.ts:959` exports `useInitiatePayment()` (admin-side) | `src/hooks/queries/accounting.ts:1334` exports `useAccountingInitiatePayment()` (company-side) | LOW | Same as B-5 — already renamed to disambiguate. Stale `index.ts:8` comment claims duplicate; fix the comment. |
| B-7 | `src/lib/email.ts` (Nodemailer SMTP transport) | `src/lib/workers/emailWorker.ts` (queue-driven email dispatch using `email.ts`) | LOW | Complementary, not duplicate — `emailWorker` consumes `email.ts`. The duplication concern is the **env-var name mismatch** already flagged in Audit 5 (`SMTP_PASSWORD` vs `SMTP_PASS`); see that report for fix. |

---

## C. Legacy / Shadow Implementations

Old code that does the same job as newer canonical code, kept "for backward compat" but never actually called.

| # | Legacy | Canonical | Severity | Fix |
|---|--------|-----------|----------|-----|
| C-1 | `src/hooks/use-toast.ts` + `src/components/ui/toast.tsx` + `src/components/ui/toaster.tsx` — legacy shadcn/radix toast system. **Mounted** in `layout.tsx:97` but **never fed** (`rg 'useToast' src/ | grep -v use-toast.ts | grep -v toaster.tsx` = 0 hits). The mounted `<Toaster />` displays zero toasts forever. | `src/components/ui/sonner.tsx` — sonner `<Toaster />`. All app code calls `import { toast } from "sonner"` (51 files). But sonner's `<Toaster />` is **never mounted**, so its calls also produce nothing visible. | **P0** | Replace `layout.tsx:4` import with `@/components/ui/sonner`. Delete `use-toast.ts`, `toast.tsx`, `toaster.tsx` (3 dead files). Verify toasts appear after the swap. |
| C-2 | `src/lib/telemetry.ts` — "legacy hand-rolled metrics module" (per its own comment in `telemetry-sdk.ts:6`) | `src/lib/telemetry-sdk.ts` (P1.2 canonical) | **P2** | Delete `telemetry.ts`. Its only supposed consumer (`event-bus.ts`) is itself dead (D-3). |
| C-3 | `src/lib/queue-pgboss.ts` — standalone pg-boss wrapper, never imported | `src/lib/queues.ts` (canonical multi-tier queue that already has pg-boss as Tier 2 fallback) | **P2** | Delete `queue-pgboss.ts`. |
| C-4 | `src/lib/event-bus.ts` — typed in-process event bus (publish/subscribe) | `src/lib/pubSub.ts` (canonical multi-instance pub/sub with Valkey cross-process support + audit trail via `telemetry/event-bus-audit.ts`) | **P2** | Delete `event-bus.ts`. The only references to it are **comments** in `telemetry-sdk.ts:7` and `instrumentation.ts` ("preserved for backward compat with event-bus.ts") — but nothing actually imports it (`rg 'from.*event-bus' src/` = 0 hits; the hits are for `event-bus-audit.ts`, a different file). |
| C-5 | `src/modules/common/OnboardingScreen.tsx` — single-form stub, kept as "fallback" per AppShell.tsx:22 comment | `src/modules/onboarding/SetupWizard.tsx` — real 7-step wizard, rendered by AppShell.tsx:199 | **P2** | Delete `OnboardingScreen.tsx`. The "fallback" claim in AppShell.tsx is false — no `<ErrorBoundary fallback={<OnboardingScreen />}>` exists. |
| C-6 | `prisma/schema.prisma` `model Post` — generic post model (id/title/content/published/authorId). Comment in `scripts/update-prisma-schema.ts` literally says: *"Remove the Post model (legacy) - it's not referenced by any API route"*. Migration `20260729000000_add_missing_tables/migration.sql` creates the `posts` table. | (No canonical replacement — was probably a Next.js starter-template leftover) | LOW | Drop the `Post` model from `prisma/schema.prisma`. Add a migration `drop_posts_table.sql`. |
| C-7 | `src/lib/auditExport.ts` — "Export audit logs for a tenant (CSV/PDF-ready)" | No direct duplicate, but `src/lib/audit.ts` (canonical logging) + `src/lib/tamperAudit.ts` (chain verification) + `src/app/api/audit/route.ts` (audit list endpoint) already cover the audit surface. `auditExport.ts` is never imported. | **P3** | Either delete `auditExport.ts` or wire it into a new `/api/audit/export` endpoint if CSV export is a desired feature. |
| C-8 | `src/lib/db-rls.ts` — Prisma extension `withTenant(db, slug)` Proxy wrapper (P1.5 — Postgres RLS). Worklog P1.5 claims it was wired into the codebase, but `rg -l '@/lib/db-rls' src/` returns 0 hits (only the file itself). | Canonical RLS is enforced at the **Postgres level** via migration `20260725110000_enable_postgres_rls` (28 tables, `current_setting('app.current_company_slug')`). The Prisma-side `withTenant` wrapper was supposed to call `set_config()` inside `$transaction` but is never called. | **P2** | Either delete `db-rls.ts` (if RLS-at-SQL-level is sufficient) OR wire `withTenant(db, slug)` into the `requirePermissionForCompany` middleware so every API route wraps its DB access. Currently RLS policies exist but `app.current_company_slug` is never set by app code → policies evaluate against NULL → silently allow cross-tenant reads. **This is a security gap, not just dead code.** |

---

## D. Dead Code (functions, types, constants, files never referenced)

### D.1 Files that are completely dead (zero imports anywhere in src/)

| File | Size | Notes |
|------|-----:|-------|
| `src/hooks/use-toast.ts` | 4.2 KB | Legacy toast hook, only consumer is `toaster.tsx` (itself dead — see C-1) |
| `src/components/ui/toaster.tsx` | 0.9 KB | Legacy Toaster wrapper, mounted but fed zero toasts |
| `src/components/ui/toast.tsx` | 5.5 KB | Legacy radix Toast primitives, only consumer is `toaster.tsx` |
| `src/lib/telemetry.ts` | ~6 KB | Legacy metrics module, never imported (see C-2) |
| `src/lib/queue-pgboss.ts` | ~12 KB | Standalone pg-boss wrapper, never imported (see C-3) |
| `src/lib/event-bus.ts` | ~5 KB | In-process pub/sub, never imported (see C-4) |
| `src/lib/auditExport.ts` | ~3 KB | Audit CSV/PDF exporter, never imported (see C-7) |
| `src/lib/db-rls.ts` | ~6 KB | Prisma RLS Proxy wrapper, never imported (see C-8) |
| `src/lib/embeddingCache.ts` | ? | Embedding cache, never imported (`rg 'embeddingCache\|embedding-cache' src/` = 0 outside itself) |
| `src/modules/common/OnboardingScreen.tsx` | ~7 KB | Stub onboarding, never rendered (see C-5) |

### D.2 Unused shadcn/ui primitives (29 of 48)

The following primitives are defined in `src/components/ui/*.tsx` but are **never imported by any file outside `src/components/ui/`**:

```
aspect-ratio, avatar, breadcrumb, calendar, carousel, collapsible, command,
context-menu, drawer, dropdown-menu, form, hover-card, input-otp, menubar,
navigation-menu, pagination, popover, progress, radio-group, resizable,
scroll-area, separator, sidebar, skeleton, slider, sonner, toggle-group,
toggle, tooltip
```

Notable sub-cases:
- **`form.tsx`** — the shadcn `Form` primitive (react-hook-form integration) is **never used** because no business form uses react-hook-form (see A-2). Deleting it would be safe today.
- **`sonner.tsx`** — defines the `<Toaster />` for sonner toasts. **Should be mounted** but isn't (see C-1). Don't delete — fix the mount.
- **`tooltip.tsx` / `skeleton.tsx`** — only imported by `sidebar.tsx` (which is itself in the unused list). Transitively dead.
- **`sidebar.tsx`** — a 1500+ line shadcn sidebar primitive. Never imported (the app uses its own `src/modules/common/Sidebar.tsx` instead). 100% dead.
- **`dropdown-menu.tsx` / `popover.tsx` / `command.tsx`** — shadcn primitives that should be used by `CommandPalette.tsx` but aren't; `CommandPalette` reimplements command-palette UI from scratch using `lucide-react` icons + raw `div`s.

### D.3 Unused React Query hooks (45 of 282)

These exported hooks in `src/hooks/queries/*.ts` are never called anywhere in `src/` (including tests):

<details>
<summary>Click to expand full list (45 hooks)</summary>

```
useAIChat, useAIMemory, useAITools, useAccountingCommissions,
useAccountingDashboard, useAccountingInitiatePayment, useAuditLog,
useAutomationLogs, useBackups, useCatalogItem, useClient, useCompany,
useCreateAIAgent, useCreateAIMemory, useCreateAutomation, useCreateBackup,
useCreateNotification, useDeleteAnnouncement, useFeatureFlags,
useForgotPassword, useInventoryMovements, useInvoice, useInvoiceBrainStats,
useLandingContent, useLogin, useLogout, useMarkNotificationsRead, useModules,
useParseFile, useParseImage, useProductMatchingConfig, useRegister, useReports,
useResetPassword, useRetryWebhookDelivery, useSettings, useTestIntegration,
useTestWebhookEndpoint, useUpdateAnnouncement, useUpdateCompany,
useUpdatePurchase, useUpdateWarehouse, useUser, useWebhookDeliveries,
useWebhookEndpoint
```

</details>

**Hotspots:**
- `src/hooks/queries/auth.ts` — 7 of 8 hooks dead (only `useUpdateSaasUser` is alive). See A-3.
- `src/hooks/queries/ai.ts` — 4 hooks dead (`useAIChat`, `useAIMemory`, `useAITools`, `useCreateAIAgent`, `useCreateAIMemory`). The live AI hooks are `useAIAgents`, `useAIAgentMessage`, `useAIChatHistory`, `useAIChatMessages`, `useAIToolsExecute`, `useExtractInvoice`, `useSmartParse`, `useBulkImport`, `useEntityMemoryNotes`, `useCreateEntityMemoryNote`, `useDeleteAIMemory`, `useParseImageJson`.
- `src/hooks/queries/settings.ts` — `useSettings` dead (the live one is `useUpdateSettings`).
- `src/hooks/queries/webhooks.ts` — `useWebhookDeliveries`, `useWebhookEndpoint`, `useRetryWebhookDelivery`, `useTestWebhookEndpoint` all dead. Only `useWebhookEndpoints`, `useCreateWebhookEndpoint`, `useUpdateWebhookEndpoint`, `useDeleteWebhookEndpoint`, `useWebhookEvents` are live.

### D.4 Dead Prisma models — see Section E for the full matrix.

### D.5 Stale documentation comments

| File:Line | Stale Claim | Reality |
|-----------|-------------|---------|
| `src/hooks/queries/index.ts:7-9` | "useCommissions exists in both hr.ts and accounting.ts (different signatures). useInitiatePayment exists in both platform-admin.ts and accounting.ts" | Both duplicates were already resolved by renaming to `useAccountingCommissions` and `useAccountingInitiatePayment`. Comment is wrong. |
| `src/modules/common/AppShell.tsx:22` | "We keep OnboardingScreen around as a fallback if SetupWizard itself errors out (defensive ErrorBoundary inside the wizard)." | No `<ErrorBoundary fallback={<OnboardingScreen />}>` exists. The claim is aspirational. |
| `src/lib/telemetry-sdk.ts:6-7` | "telemetry.ts is preserved for backward compatibility with event-bus.ts." | `event-bus.ts` is itself dead (never imported). Both can be deleted together. |
| `src/instrumentation.ts` (comment) | "for backward compat with event-bus.ts" | Same — there is no actual `event-bus.ts` consumer. |

---

## E. Prisma Model Usage Matrix

98 models in `prisma/schema.prisma`. Callsite counts via `rg 'db\.<model>' src/ scripts/ prisma/` (excludes `prisma/schema.prisma` itself).

### E.1 Dead schema (zero callsites — table exists in DB but no code touches it)

| Model | Callsites | Status | Notes |
|-------|----------:|--------|-------|
| `BudgetLine` | 0 | **DEAD** | Table `budget_lines` created in migration `20260729000000_add_missing_tables/migration.sql`. Parent `Budget` is used (12 callsites), but lines are never read/written via Prisma. The `BudgetsView.tsx` UI manipulates budget lines as embedded JSON inside the `Budget.data` field instead. |
| `LetterOfCreditDocument` | 0 | **DEAD** | Table `letter_of_credit_documents` created. Parent `LetterOfCredit` is used (12 callsites), but documents array is never persisted via Prisma. |
| `Post` | 0 | **DEAD** | Generic blog-post model. Comment in `scripts/update-prisma-schema.ts`: *"Remove the Post model (legacy) - it's not referenced by any API route"*. Likely a Next.js starter-template leftover. |
| `ProfitDistributionEntry` | 0 | **DEAD** | Table created. Parent `ProfitDistribution` is seeder-only (see below). |

### E.2 Seeder-only (used by `prisma/seed.ts` but not by any application code)

| Model | Callsites in src/scripts | Callsites in prisma/seed.ts | Status |
|-------|-------------------------:|----------------------------:|--------|
| `ProfitDistribution` | 0 | 2 | **SEED-ONLY** — seeded but never read/written by API routes. The `/api/accounting/profit-distribution/route.ts` delegates to `src/lib/accounting/partner-capital.ts` which uses `db.account` and `db.$transaction` to post JEs — it never touches `db.profitDistribution`. |

### E.3 All other 93 models — used

Top 15 by callsite count (for context):

| Model | Callsites |
|-------|----------:|
| `Company` | 90 |
| `Invoice` | 74 |
| `Account` | 72 |
| `AIRequestLog` | 62 |
| `AppUser` | 50 |
| `CompanyRuntime` | 43 |
| `ProductCatalog` | 41 |
| `Client` | 38 |
| `PlatformSettings` | 37 |
| `JournalEntry` | 29 |
| `InventoryItem` | 26 |
| `PaymentTransaction` | 24 |
| `JobQueue` | 24 |
| `RuleCandidate` | 23 |
| `AIMemoryEntry` | 22 |

(Full matrix of all 98 models with callsite counts available on request — only the 5 anomalies are listed above.)

---

## F. Zod Schema Duplication Matrix

188 `z.object(...)` declarations across `src/`. The pattern is overwhelmingly **one schema per route file** (named `CreateSchema`, `UpdateSchema`, `PatchSchema`, etc.) with no shared module.

### F.1 Schema shapes that are duplicated across files (DRY violations)

| Schema shape | Files | Fix |
|--------------|-------|-----|
| `InvoiceSchema` (invoice line items + totals) | `src/lib/invoice-brain/schema.ts`, `src/app/api/invoices/route.ts`, `src/app/api/ai/smart-parse/route.ts` (implicit) | Extract to `src/lib/schemas/invoice.ts` and import in all 3 places. |
| `LoginSchema` (`{ email, password }`) | `src/app/api/auth/login/route.ts` defines it; `src/app/login/page.tsx` validates email/password manually with `if (!email)` | Extract `LoginSchema` to `src/lib/schemas/auth.ts`. Import on both client (with `zodResolver`) and server. |
| `RegisterSchema` (`{ email, password, displayName }`) | `src/app/api/auth/register/route.ts` defines it; `src/app/signup/page.tsx` validates manually with a 5-check strength meter | Same as above. |
| `ClientCreateSchema` (`{ name, email?, phone?, … }`) | `src/app/api/clients/route.ts` defines it; `src/modules/clients/ClientForm.tsx` validates only `if (!name)` | Extract + share. |
| `LineItemSchema` (invoice line item) | `src/app/api/invoices/route.ts`, `src/app/api/ai/bulk-import/route.ts`, `src/app/api/ai/smart-parse/route.ts`, `src/lib/invoice-brain/schema.ts` | 4 places define roughly the same line-item shape. Extract to `src/lib/schemas/line-item.ts`. |
| `BudgetEntrySchema` | 2 files (accounting budget routes) | Minor — extract if more budget endpoints added. |

### F.2 Schemas that exist but are NEVER validated against (orphan schemas)

None found — every declared `z.object(...)` is referenced by at least one `safeParse` or `parse` call within the same file. The risk is the inverse: client-side forms don't share these schemas (see A-2).

---

## G. React Query Key Uniqueness

- **Total unique query-key factory functions in `src/hooks/query-keys.ts`:** 105 (across 20 domain buckets: `auth`, `clients`, `suppliers`, `invoices`, `companies`, `settings`, `invoiceTemplates`, `hr`, `accounting`, `inventory`, `catalog`, `automation`, `ai`, `dashboard`, `notifications`, `purchases`, `reports`, `backups`, `platformAdmin`, `saas`, `audit`, `featureFlags`, `modules`, `productMatching`, `founderPanel`, `webhooks`).
- **Inline (non-factory) keys:** 4 — all in `src/hooks/queries/onboarding.ts` (`["onboarding", "status"]`, `["onboarding", "slug-check", slug]`, `["onboarding"]`, `["companies"]`) and `src/hooks/queries/platform-admin.ts:rg '\["landing'` (1 hit). These bypass the central factory.
- **Duplicate query keys (cache-collision risk):** **0**. The factory pattern (`queryKeys.<domain>.<action>(args)`) prevents collisions because every key is namespaced by domain.
- **Inline keys that overlap factory keys:** 2 — `["onboarding"]` (invalidation only; no `useQuery({queryKey:["onboarding"]})` exists, so no collision) and `["companies"]` (matches `queryKeys.companies.all` semantically but the factory version is also `["companies"]`, so invalidation hits the same cache). Recommend migrating `onboarding.ts` to use the factory for consistency.
- **Hooks sharing the same `queryKey` value:** 0 — every `useQuery`/`useMutation` uses a unique factory-generated key or a unique inline key.

**Conclusion:** React Query cache integrity is solid. No collisions, no shared keys, no cache-poisoning risk.

---

## H. Context Provider Mount Verification

`src/context/` contains 2 providers (plus `src/components/garfix/CommandPaletteProvider.tsx`).

| Provider | Defined in | Mounted in `Providers.tsx`? | Hook called somewhere? | Status |
|----------|-----------|------------------------------|------------------------|--------|
| `ThemeProvider` | `next-themes` (npm) | ✅ `Providers.tsx:43` (`<ThemeProvider attribute="class" defaultTheme="system" enableSystem>`) | ✅ indirectly via `BrandContext.useBrand().theme` (which **should** delegate to `useTheme()` but currently runs its own state — see A-6) | ⚠️ **Mounted but parallel-implemented** (A-6) |
| `AuthProvider` | `src/context/AuthContext.tsx` | ✅ `Providers.tsx:44` (`<AuthProvider>`) | ✅ `useAuth()` called in 9 files (`AppShell`, `page.tsx`, `login`, `signup`, `AccountView`, `SaaSControlPanel`, `AICopilotBubble`, `SetupWizard`, `OnboardingScreen`-dead) | ✅ Healthy |
| `BrandProvider` | `src/context/BrandContext.tsx` | ✅ `Providers.tsx:46` (`<BrandProvider>`) | ✅ `useBrand()` called in 21 files (every view + AppShell + SetupWizard) | ✅ Healthy (except theme race — A-6) |
| `QueryClientProvider` | `@tanstack/react-query` (npm) | ✅ `Providers.tsx:45` | ✅ all hooks in `src/hooks/queries/` | ✅ Healthy |
| `CommandPaletteProvider` | `src/components/garfix/CommandPaletteProvider.tsx` | ⚠️ **NOT in `Providers.tsx`** — instead mounted directly inside `AppShell.tsx:140` (`<CommandPaletteProvider>{…}`) | ✅ `useCommandPalette()` is consumed by `CommandPalette.tsx` and `AppShell.tsx` (via `Cmd+K` listener) | ⚠️ Inconsistent mount location — works because AppShell is always rendered for authed users, but unauthed landing/login/signup pages have no command palette. Acceptable but should be documented. |
| `ReactQueryDevtools` | `@tanstack/react-query-devtools` | ✅ `Providers.tsx:50-52` (dev-only) | N/A | ✅ Healthy |

**No orphan providers.** All defined providers are mounted and their hooks are consumed.

---

## I. Layer-by-Layer Summary

| Layer Pair | Status | Findings |
|------------|--------|----------|
| **1. Routes ↔ Components** | ✅ Healthy | All 15 `page.tsx` routes map to existing components. AppShell renders 18 lazy-loaded views, all of which exist. |
| **2. Components ↔ Hooks** | ⚠️ 45 unused hooks | 282 exported hooks; 45 never called (see D.3). |
| **3. Hooks ↔ Services** | ✅ Healthy | Every live hook calls a service / API; every API is called by at least one hook (no orphans). |
| **4. Services ↔ APIs** | ✅ Healthy | All 211 API routes have at least one caller (in `src/hooks/`, `src/modules/`, or `src/lib/openapi/contract-test-helpers.ts`). |
| **5. APIs ↔ Database** | ⚠️ 4 dead models | 4 Prisma models have zero callsites; 1 is seeder-only (see E). All other 93 are used. |
| **6. Database ↔ Zod** | ⚠️ Mostly aligned but unverified | Every API route that writes data uses a Zod schema; spot-checks show field names match Prisma columns. No formal property-by-property comparison done (would require running `prisma generate` and AST-parsing — out of scope for static audit). |
| **7. Zod ↔ Forms** | ❌ **Broken** | 0 client forms use `zodResolver` or import any Zod schema. Server-only validation. (A-2) |
| **8. Forms ↔ UI** | ⚠️ 29 unused shadcn primitives | 48 shadcn primitives defined; 29 never imported outside `ui/`. The `Form` primitive itself is unused. (D.2) |
| **9. UI ↔ Navigation** | ✅ Healthy | `AppShell.tsx` switch + `Sidebar` `navigate(view)` + hash routing all wired correctly. `onClick` handlers produce navigation or state changes consistently. |

---

## J. Recommended Action Plan (priority order)

| # | Priority | Action | Files touched | Effort |
|---|----------|--------|---------------|--------|
| 1 | **P0** | Swap `layout.tsx` to mount `@/components/ui/sonner` Toaster instead of legacy `@/components/ui/toaster`. Verify toasts appear. | `src/app/layout.tsx` | 5 min |
| 2 | **P0** | After swap, delete dead toast files: `src/hooks/use-toast.ts`, `src/components/ui/toaster.tsx`, `src/components/ui/toast.tsx`. | 3 files deleted | 5 min |
| 3 | **P1** | Fix `BrandContext` theme race: remove its `theme` state + `THEME_KEY` + `classList.toggle` effect; delegate to `next-themes`'s `useTheme()`. | `src/context/BrandContext.tsx` | 30 min |
| 4 | **P1** | Delete `src/lib/db-rls.ts` OR wire `withTenant(db, slug)` into `requirePermissionForCompany`. Current state is a **security gap** — RLS policies exist but `app.current_company_slug` is never set, so policies silently allow cross-tenant reads. | `src/lib/db-rls.ts`, `src/lib/middleware.ts` | 2 hr (wire) or 5 min (delete) |
| 5 | **P1** | Delete 7 unused auth hooks from `src/hooks/queries/auth.ts` (keep `useUpdateSaasUser`). Document `AuthContext` as canonical. | `src/hooks/queries/auth.ts` | 10 min |
| 6 | **P2** | Delete dead files: `src/lib/telemetry.ts`, `src/lib/queue-pgboss.ts`, `src/lib/event-bus.ts`, `src/lib/auditExport.ts`, `src/lib/embeddingCache.ts`, `src/modules/common/OnboardingScreen.tsx`. | 6 files deleted | 10 min |
| 7 | **P2** | Delete 4 dead Prisma models (`BudgetLine`, `LetterOfCreditDocument`, `Post`, `ProfitDistributionEntry`) + add drop migration. Decide what to do with `ProfitDistribution` (seeder-only) — either wire it into `partner-capital.ts` or drop it too. | `prisma/schema.prisma`, new migration | 30 min |
| 8 | **P2** | Delete the 29 unused shadcn primitives (or document why they're kept — e.g. `sonner.tsx` will be used after fix #1). | `src/components/ui/*.tsx` (29 files) | 20 min |
| 9 | **P2** | Consolidate OpenAPI spec: pick one format (recommend JSON), generate the other from it at build time. | `src/lib/openapi/*`, `package.json` script | 1 hr |
| 10 | **P2** | Extract shared Zod schemas (`LoginSchema`, `RegisterSchema`, `InvoiceSchema`, `LineItemSchema`, `ClientCreateSchema`) to `src/lib/schemas/*.ts`. Wire client forms to use them via `zodResolver`. | new `src/lib/schemas/` dir + 5 form files | 4 hr |
| 11 | **P2** | Delete remaining 38 unused hooks (after #5). Run `rg '^export function use' src/hooks/queries/` to regenerate the dead-list and confirm zero usage. | `src/hooks/queries/*.ts` | 30 min |
| 12 | **P3** | Drop `Post` Prisma model + `posts` table migration. | `prisma/schema.prisma` + new migration | 15 min |
| 13 | **P3** | Fix stale comments in `src/hooks/queries/index.ts:7-9` and `src/modules/common/AppShell.tsx:22`. | 2 files | 5 min |
| 14 | **P3** | Move `CommandPaletteProvider` mount from `AppShell.tsx` to `Providers.tsx` for consistency (so it's available on landing/login/signup pages too — optional feature). | 2 files | 15 min |

---

## K. Audit Method Notes

- **Prisma callsite count:** used `rg -o 'db\.[a-zA-Z]+\.' src/ scripts/ prisma/` then `sed` to extract the model name, sorted and counted via `uniq -c`. Cross-checked the 5 zero-callsite candidates manually with `rg "db\.<model>\b"` (case-sensitive) and a case-insensitive `rg -i '<model_name>'` sweep.
- **Hook usage:** `rg '^export function use[A-Z][a-zA-Z]+' src/hooks/queries/` to enumerate, then `rg '\b<hook>\(' src/` to find callers (excluding the definition file and test files).
- **UI primitive usage:** `rg "from ['\"]@/components/ui/<primitive>['\"]" src/` excluding `src/components/ui/`. Cross-checked with a PascalCase component-name search to catch barrel imports.
- **Query-key uniqueness:** parsed `src/hooks/query-keys.ts` (375-line factory) + grepped every `queryKey:` literal in `src/hooks/queries/`. Compared literal `[…]` arrays against factory output shapes.
- **OpenAPI drift:** counted 207 paths in both `openapi.json` and `openapi.yaml` — they appear in sync today but have no build-time check.
- **No file modifications were performed.** This is an audit-only deliverable per the task spec.

---

**Report generated:** Task ID 8, Agent: Explore.
**Companion artifacts:** `audit-artifacts/2-d-server-inventory.md` (Audit 2), `audit-artifacts/2-d-client-inventory.md`, `audit-artifacts/2-d-mismatches.md`.
