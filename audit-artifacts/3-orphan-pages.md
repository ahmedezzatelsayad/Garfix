# Task 3 — Orphan Pages Audit (Focused Retry)

> Scope: 6 high-value orphan categories (A–F). Sampled broadly, not exhaustively.
> Methodology: per category, walked the candidate set, then `rg`-grepped for non-self references in `src/`. Zero non-self callers ⇒ orphan.
> Companion artifact: `audit-artifacts/2-d-mismatches.md` (full server-route orphan inventory, 35 entries).

---

## A. Orphan Next.js Pages

Walked all 15 `src/app/**/page.tsx` files. For each route, checked reachability via `<Link href>`, `router.push/replace`, `redirect()`, and `PUBLIC_PAGE_PREFIXES` in `src/middleware.ts`.

**Result: 0 strict orphans.** Every page is reachable via `PUBLIC_PAGE_PREFIXES`:

| Page Route | Reachable Via |
|---|---|
| `/` | Exact match in `PUBLIC_PAGE_PREFIXES` + landing |
| `/login`, `/signup`, `/contact`, `/cookies`, `/privacy`, `/terms`, `/help`, `/status`, `/partners`, `/refund`, `/api-docs` | Exact match in `PUBLIC_PAGE_PREFIXES` (lines 30–44 of `middleware.ts`) |
| `/founder-panel/ai-fabric`, `/founder-panel/finops`, `/founder-panel/mission-control` | Prefix match `/founder-panel` in `PUBLIC_PAGE_PREFIXES` (founder-panel self-authenticates) |

### INVESTIGATE — pages with NO inbound `<Link>` / `router.push` (only middleware prefix keeps them "reachable")

| File | Route | Suggested Fix (DELETE / RECONNECT / INVESTIGATE) |
|---|---|---|
| `src/app/partners/page.tsx` | `/partners` | INVESTIGATE — no Link from any component; only middleware prefix. Add link in `AppFooter` or delete if marketing page is dead. |
| `src/app/refund/page.tsx` | `/refund` | INVESTIGATE — no Link from any component; only middleware prefix. |
| `src/app/api-docs/page.tsx` | `/api-docs` | INVESTIGATE — no Link from any component; only middleware prefix. Likely intended for external Swagger UI consumers; consider documenting. |
| `src/app/founder-panel/ai-fabric/page.tsx` | `/founder-panel/ai-fabric` | INVESTIGATE — no inbound Link/router.push (founder accesses via direct URL only). Add a nav card on `/founder-panel` index or mission-control. |
| `src/app/founder-panel/finops/page.tsx` | `/founder-panel/finops` | INVESTIGATE — same as above. |
| `src/app/founder-panel/mission-control/page.tsx` | `/founder-panel/mission-control` | INVESTIGATE — same as above. |

> No `/founder-panel/page.tsx` index exists (only the three sub-routes + a README). Adding one with three `<Link>` cards would resolve all three sub-route orphans-in-practice.

---

## B. Orphan Dashboard Views

Walked all 30 `src/modules/**/*View.tsx` files. The AppShell switch (`src/modules/common/AppShell.tsx:205–222`) directly renders 18 views; the remaining 12 candidate orphans were verified against `src/modules/accounting/AccountingView.tsx` (renders them as `moduleTab` sub-views, lines 488–499) and `src/modules/admin/PlatformAdminPanel.tsx` (renders `WebhookManagementView` at line 629).

**Result: 1 orphan.**

| File | Suggested Fix (DELETE / RECONNECT / INVESTIGATE) |
|---|---|
| `src/modules/admin/AuditView.tsx` | DELETE — superseded by `EnhancedAuditView.tsx` (AppShell line 36 imports `EnhancedAuditView` aliased as `AuditView`). No `import … from "@/modules/admin/AuditView"` anywhere in `src/`. The file (≈230 lines, uses `useAuditLogFiltered`) is dead code. |

### Verified NON-orphans (rendered as sub-views):

| View | Rendered By | Tab Key |
|---|---|---|
| `AccountingView.tsx` | AppShell | `accounting` |
| `AccountantCollabView.tsx` | AccountingView | `collab` |
| `ArApView.tsx` | AccountingView | `ar-ap` |
| `BankingView.tsx` | AccountingView | `banking` |
| `BudgetsView.tsx` | AccountingView | `budgets` |
| `FixedAssetsView.tsx` | AccountingView | `fixed-assets` |
| `InventoryCostingView.tsx` | AccountingView | `inventory` |
| `MultiCompanyView.tsx` | AccountingView | `multi-company` |
| `PaymentRailsView.tsx` | AccountingView | `payments` |
| `PayrollWpsView.tsx` | AccountingView | `payroll` |
| `TaxComplianceView.tsx` | AccountingView | `tax` |
| `TradeFinanceView.tsx` | AccountingView | `trade` |
| `VouchersDetailView.tsx` | AccountingView | `vouchers` |
| `WebhookManagementView.tsx` | PlatformAdminPanel | `webhooks` (note: prior audit had flagged this orphan — it's now wired at line 629) |

---

## C. Orphan Hooks

Sampled 30 exported `useXxx()` functions from `src/hooks/queries/*.ts`. For each, `rg`-grepped for non-self callers (excluding `src/hooks/queries/` and `src/hooks/README.md`).

**Result: 13 orphans out of 30 sampled (43% orphan rate — high).**

| File | Hook | Suggested Fix |
|---|---|---|
| `src/hooks/queries/auth.ts` | `useUser` | DELETE — `AuthContext.tsx` implements its own `user` state via `useState` + `/api/auth/me` fetch; doesn't call this hook. |
| `src/hooks/queries/auth.ts` | `useLogin` | DELETE — `AuthContext.tsx` implements `login()` directly (lines 64+); doesn't use this hook. |
| `src/hooks/queries/auth.ts` | `useLogout` | DELETE — same as above (`logout()` in AuthContext). |
| `src/hooks/queries/auth.ts` | `useRegister` | DELETE — `src/app/signup/page.tsx` calls `authedFetch("/api/auth/register")` directly, not this hook. |
| `src/hooks/queries/auth.ts` | `useForgotPassword` | DELETE — no caller anywhere in `src/`. |
| `src/hooks/queries/auth.ts` | `useResetPassword` | DELETE — no caller anywhere in `src/`. |
| `src/hooks/queries/invoices.ts` | `useInvoice(id)` | INVESTIGATE — `useInvoices` (plural) is used by `InvoicesView` + `CommandPalette`, but the singular detail hook has zero callers. Either wire an invoice detail drawer or delete. |
| `src/hooks/queries/catalog.ts` | `useCatalogItem(id)` | INVESTIGATE — `useCatalog` (list) is used; the singular detail hook has zero callers. |
| `src/hooks/queries/ai.ts` | `useAIMemory` | INVESTIGATE — AIAgentsView exists but doesn't use this hook. |
| `src/hooks/queries/ai.ts` | `useInvoiceBrainStats` | INVESTIGATE — no caller; AI views use `useAIAgents` only. |
| `src/hooks/queries/ai.ts` | `useCreateAIAgent` | INVESTIGATE — no caller (AIAgentsView may use a different mutation). |
| `src/hooks/queries/ai.ts` | `useCreateAIMemory` | DELETE — paired with `useAIMemory` which is also orphan. |
| `src/hooks/queries/product-matching.ts` | `useProductMatchingConfig` | INVESTIGATE — sibling hooks (`useProductMatchingReview/Confirm/Undo`) are all called from `ReviewQueueModal.tsx`; only this one isn't. |

### Non-orphan sampled hooks (verified used): `useProductMatchingReview`, `useProductMatchingConfirm`, `useProductMatchingUndo`, `useInvoices`, `useCreateInvoice`, `useUpdateInvoice`, `useDeleteInvoice`, `useUpdateInvoiceStatus`, `useRecordPayment`, `useCatalog`, `useCreateCatalogItem`, `useUpdateCatalogItem`, `useDeleteCatalogItem`, `useChangePassword`, `useUpdateSaasUser`, `useAIAgents`.

> **Pattern:** The entire `auth.ts` hook module (8 hooks, 6 orphans) is shadowed by `AuthContext.tsx`'s own fetch-based implementation. Either delete `auth.ts` or refactor `AuthContext.tsx` to consume these hooks. This is the highest-leverage cleanup in the category.

---

## D. Orphan API Routes (Top 10 most suspicious — re-confirmed from `2-d-mismatches.md` Section A)

Full inventory: 35 orphan endpoints (Audit 1-D). Excluded from this top-10:
- RBAC routes resolved server-side (`/permissions/catalog`, `/permissions/check`, `/permissions/roles` — entries 26–28)
- Metrics routes scraped externally (`/metrics`, `/metrics/observability`, `/metrics/slo` — entries 23–25)
- External webhook receivers (`/saas/payments/callback`, `/webhooks/whatsapp` — entries 30, 33)
- OpenAPI docs (`/docs` — entry 17, designed for external consumers)
- Founder-validation test scaffolding (entries 18–21)

**Result: top 10 most suspicious orphans re-confirmed.**

| # | Path | File | Suggested Fix |
|---|---|---|---|
| 1 | `/` GET | `src/app/api/route.ts` | DELETE — `"Hello, world!"` placeholder. No client uses it. Blocks `/` for any future use. |
| 2 | `/ai/chat/stream` POST | `src/app/api/ai/chat/stream/route.ts` | INVESTIGATE — SSE endpoint, no `EventSource` usage in `src/`. Client only calls non-streaming `/api/ai/chat`. Either delete or wire up `EventSource` for streaming UX. |
| 3 | `/internal/ai-fabric/savings` GET | `src/app/api/internal/ai-fabric/savings/route.ts` | DELETE — named "internal" but no caller. `founder-panel/ai-fabric` page fetches from `/api/founder-panel/ai-fabric` instead. |
| 4 | `/storage/:key` GET | `src/app/api/storage/[key]/route.ts` | INVESTIGATE — `getPublicUrl()` helper exists in `src/lib/storage.ts:122` but is never called. Indicates dead code path; either wire it or remove both. |
| 5 | `/startup-check` GET | `src/app/api/startup-check/route.ts` | DELETE — only referenced from `scripts/load-test.sh`, not React. Move to a `scripts/` CLI if needed. |
| 6 | `/product-matching/match-override` GET, POST | `src/app/api/product-matching/match-override/route.ts` | INVESTIGATE — all sibling routes (`/review`, `/confirm`, `/undo`, `/config`) are called from `ReviewQueueModal.tsx`; only this one isn't. Likely a feature that was scoped out. |
| 7 | `/accounting/quotations/:id` DELETE, GET, PATCH | `src/app/api/accounting/quotations/[id]/route.ts` | INVESTIGATE — only `/convert-to-invoice` sub-route is used. Detail handlers are dead. |
| 8 | `/accounting/vouchers/:id` GET, PATCH | `src/app/api/accounting/vouchers/[id]/route.ts` | INVESTIGATE — only `/approve` and `/cancel` sub-routes are used. Detail handlers are dead. |
| 9 | `/accounting/post-dated-checks/:id` GET, PATCH | `src/app/api/accounting/post-dated-checks/[id]/route.ts` | INVESTIGATE — only `/cancel` and `/deposit` sub-routes are used (soft-matched at runtime per `2-d-mismatches.md` Section D). Detail handlers are dead. |
| 10 | `/accounting/bank-accounts/:id` DELETE, GET, PATCH | `src/app/api/accounting/bank-accounts/[id]/route.ts` | INVESTIGATE — parent `/api/accounting/bank-accounts` (list) is called; detail handlers are dead. |

> **Pattern (entries 7–10):** The accounting module ships full server-side CRUD per-id handlers, but the React client only uses list + workflow action sub-routes (`/approve`, `/cancel`, `/deposit`, `/convert-to-invoice`). ~14 accounting detail endpoints are orphans by this pattern (entries 2–15 in the original list).

---

## E. Orphan Context Providers

Walked all 2 files in `src/context/`. Verified each provider is mounted in `src/components/Providers.tsx` (the only client-side provider tree root).

**Result: 0 orphans.**

| File | Provider | Mounted At |
|---|---|---|
| `src/context/AuthContext.tsx` | `AuthProvider` | `Providers.tsx:44` (inside `ThemeProvider`) |
| `src/context/BrandContext.tsx` | `BrandProvider` | `Providers.tsx:46` (inside `QueryClientProvider`) |

> Note: `next-themes` `ThemeProvider` is also mounted in `Providers.tsx:43` but lives in `node_modules`, not `src/context/`. `CommandPaletteProvider.tsx` (in `src/components/garfix/`) is a separate concern — not a `src/context/*.tsx` file, but worth noting it's mounted inside `AppShell.tsx`.

---

## F. Orphan shadcn/ui Primitives

Sampled 15 primitives from `src/components/ui/` (excluding `toaster.tsx` per spec). For each, `rg`-grepped for `from "@/components/ui/<name>"` outside `src/components/ui/`.

**Result: 11 orphans out of 15 sampled (73% orphan rate).**

| File | Suggested Fix |
|---|---|
| `src/components/ui/aspect-ratio.tsx` | DELETE — zero external importers. |
| `src/components/ui/avatar.tsx` | DELETE — zero external importers. App uses initials in `DropdownMenu` instead. |
| `src/components/ui/breadcrumb.tsx` | DELETE — zero external importers. AppShell uses its own nav, not breadcrumbs. |
| `src/components/ui/carousel.tsx` | DELETE — zero external importers. |
| `src/components/ui/collapsible.tsx` | DELETE — zero external importers. |
| `src/components/ui/command.tsx` | INVESTIGATE — zero external importers, but `CommandPalette.tsx` exists in `src/components/garfix/`. Likely should be using this primitive instead of a custom impl. |
| `src/components/ui/context-menu.tsx` | DELETE — zero external importers. |
| `src/components/ui/drawer.tsx` | DELETE — zero external importers (sheet.tsx is used instead). |
| `src/components/ui/hover-card.tsx` | DELETE — zero external importers. |
| `src/components/ui/input-otp.tsx` | DELETE — zero external importers. OTP login was apparently scoped out. |
| `src/components/ui/menubar.tsx` | DELETE — zero external importers. |

### Non-orphans (verified used):
| File | Used By |
|---|---|
| `accordion.tsx` | 1 importer |
| `alert-dialog.tsx` | 3 importers |
| `badge.tsx` | 4 importers |
| `chart.tsx` | 1 importer (note: still has MED-004 dangerouslySetInnerHTML issue — separate audit concern) |
| `checkbox.tsx` | 1 importer |

> **Pattern:** 11 of 15 sampled shadcn primitives are dead imports. Extrapolating to the full ~45 primitives in `src/components/ui/`, the dead-code burden is likely ~30+ unused component files. A one-shot cleanup pass (delete + verify `next build`) would shrink `src/components/ui/` by ~70%.

---

## Summary

| Category | Total Candidates | Orphans | Orphan Rate |
|---|---|---|---|
| A. Next.js pages | 15 | 0 strict (6 INVESTIGATE) | 0% / 40% soft |
| B. Dashboard views | 30 | 1 | 3% |
| C. Hooks (sampled 30) | 30 | 13 | 43% |
| D. Orphan API routes (re-confirmed top 10) | 35 total | 10 re-confirmed | — |
| E. Context providers | 2 | 0 | 0% |
| F. shadcn/ui primitives (sampled 15) | 15 | 11 | 73% |

## Top 3 Most Impactful Findings

1. **`src/hooks/queries/auth.ts` is a dead module (6 of 8 hooks orphan).** `AuthContext.tsx` reimplements `login`/`logout`/`register`/`user` state with raw `fetch()` — the entire `auth.ts` hook file is shadowed. Fix: delete `auth.ts` (or refactor `AuthContext` to consume these hooks). This single change removes 6 orphan hooks.

2. **`src/modules/admin/AuditView.tsx` is a complete dead duplicate of `EnhancedAuditView.tsx`.** AppShell imports `EnhancedAuditView` (aliased as `AuditView`); the older `AuditView.tsx` is never imported anywhere. Safe to delete.

3. **~11 of 15 sampled `src/components/ui/` primitives are dead code** (aspect-ratio, avatar, breadcrumb, carousel, collapsible, command, context-menu, drawer, hover-card, input-otp, menubar). Extrapolating: ~30+ unused shadcn files in `src/components/ui/`. Bulk delete + `next build` verification would meaningfully shrink the bundle and remove `npm`-audit surface area.
