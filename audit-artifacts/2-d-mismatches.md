# Task 2-d — Orphans / Mismatches / Duplicates

## A. Server routes with ZERO client callers (orphan endpoints) — 35 entries

> "Zero callers" = no `apiGet/apiPost/apiPatch/apiPut/apiDelete/apiUpload/apiDownloadBlob/apiPostBlob` call, no `authedFetch()` call, and no raw `fetch("/api/...")` call resolves to this path. Soft-matched (runtime-resolvable) routes are listed in Section D below.

| # | Path | Methods | File | Notes |
|---|---|---|---|---|
| 1 | `/` | GET | `src/app/api/route.ts` | "Hello, world!" placeholder. No client uses it. |
| 2 | `/accounting/bank-accounts/:id` | DELETE, GET, PATCH | `src/app/api/accounting/bank-accounts/[id]/route.ts` | Detail handlers never called; client only lists (parent route). |
| 3 | `/accounting/bank-reconciliation/:id` | GET, PATCH | `src/app/api/accounting/bank-reconciliation/[id]/route.ts` | Detail handlers never called. |
| 4 | `/accounting/cost-centers/:id` | DELETE, PATCH | `src/app/api/accounting/cost-centers/[id]/route.ts` | Detail handlers never called. |
| 5 | `/accounting/fiscal-periods/:id` | DELETE, GET, PATCH | `src/app/api/accounting/fiscal-periods/[id]/route.ts` | Detail handlers never called. |
| 6 | `/accounting/fx-revaluation/:id` | GET, PATCH | `src/app/api/accounting/fx-revaluation/[id]/route.ts` | Detail handlers never called. |
| 7 | `/accounting/inter-company/:id` | GET, PATCH | `src/app/api/accounting/inter-company/[id]/route.ts` | Detail handlers never called. |
| 8 | `/accounting/landed-cost/:id` | DELETE, GET, PATCH | `src/app/api/accounting/landed-cost/[id]/route.ts` | Detail handlers never called. |
| 9 | `/accounting/letters-of-credit/:id` | GET, PATCH | `src/app/api/accounting/letters-of-credit/[id]/route.ts` | Detail handlers never called. |
| 10 | `/accounting/post-dated-checks/:id` | GET, PATCH | `src/app/api/accounting/post-dated-checks/[id]/route.ts` | Detail handlers never called (cancel/deposit sub-routes are soft-matched — see Section D). |
| 11 | `/accounting/purchase-orders/:id` | GET, PATCH | `src/app/api/accounting/purchase-orders/[id]/route.ts` | Detail handlers never called. |
| 12 | `/accounting/quotations/:id` | DELETE, GET, PATCH | `src/app/api/accounting/quotations/[id]/route.ts` | Detail handlers never called; only `/convert-to-invoice` sub-route is used. |
| 13 | `/accounting/tax-filing/:id` | GET, PATCH | `src/app/api/accounting/tax-filing/[id]/route.ts` | Detail handlers never called. |
| 14 | `/accounting/vouchers/:id` | GET, PATCH | `src/app/api/accounting/vouchers/[id]/route.ts` | Detail handlers never called; only `/approve` and `/cancel` sub-routes are used. |
| 15 | `/accounting/wps/:id` | GET, PATCH | `src/app/api/accounting/wps/[id]/route.ts` | Detail handlers never called. |
| 16 | `/ai/chat/stream` | POST | `src/app/api/ai/chat/stream/route.ts` | SSE endpoint — no `EventSource` usage anywhere in `src/`. Client only calls non-streaming `/api/ai/chat`. |
| 17 | `/docs` | GET | `src/app/api/docs/route.ts` | Public OpenAPI spec — designed for external Swagger UI / SDK generators. |
| 18 | `/founder-validation` | GET, POST | `src/app/api/founder-validation/route.ts` | Test scaffolding — used by `scripts/` and `founder-validation/__tests__/`, not React. |
| 19 | `/founder-validation/ai-test` | POST | `src/app/api/founder-validation/ai-test/route.ts` | Test scaffolding. |
| 20 | `/founder-validation/report` | POST | `src/app/api/founder-validation/report/route.ts` | Test scaffolding. |
| 21 | `/founder-validation/seed` | POST | `src/app/api/founder-validation/seed/route.ts` | Test scaffolding. |
| 22 | `/internal/ai-fabric/savings` | GET | `src/app/api/internal/ai-fabric/savings/route.ts` | Internal endpoint — no client hook calls it (founder-panel/ai-fabric GET is `/api/founder-panel/ai-fabric`, different path). |
| 23 | `/metrics` | GET | `src/app/api/metrics/route.ts` | Prometheus scraping endpoint — designed for external metrics scraper. |
| 24 | `/metrics/observability` | GET | `src/app/api/metrics/observability/route.ts` | OTLP JSON export — external. |
| 25 | `/metrics/slo` | GET | `src/app/api/metrics/slo/route.ts` | SLO compliance report — no React hook calls it. |
| 26 | `/permissions/catalog` | GET | `src/app/api/permissions/catalog/route.ts` | RBAC catalog — permissions are resolved server-side via `hasPermission()`; no client hook. |
| 27 | `/permissions/check` | POST | `src/app/api/permissions/check/route.ts` | Permission check — used server-side only. |
| 28 | `/permissions/roles` | DELETE, GET, POST, PUT | `src/app/api/permissions/roles/route.ts` | Role management UI not yet built. |
| 29 | `/product-matching/match-override` | GET, POST | `src/app/api/product-matching/match-override/route.ts` | No hook calls it (sibling `/review`, `/confirm`, `/undo`, `/config` are all called). |
| 30 | `/saas/payments/callback` | GET | `src/app/api/saas/payments/callback/route.ts` | External — MyFatoorah payment gateway redirect (CallBackUrl set in `subscription-engine.ts:553`). |
| 31 | `/startup-check` | GET | `src/app/api/startup-check/route.ts` | Founder ops check — referenced in `scripts/load-test.sh` only, not React. |
| 32 | `/storage/:key` | GET | `src/app/api/storage/[key]/route.ts` | Public file URL — `getPublicUrl()` helper exists in `src/lib/storage.ts:122` but is never called anywhere in `src/`. |
| 33 | `/webhooks/whatsapp` | GET, POST | `src/app/api/webhooks/whatsapp/route.ts` | External — Meta WhatsApp Business webhook receiver. |

---

## B. Client callers with NO matching server route (broken calls) — 5 entries

| File | Line | Method | URL Template | Why broken |
|---|---|---|---|---|
| `src/hooks/queries/clients.ts` | 263 | GET | `/api/suppliers?{params.toString()}` | No `/api/suppliers` route exists. The `useSuppliers` hook is calling a non-existent endpoint. Should likely be `/api/clients?type=supplier` (clients route supports listing, supplier is a client type). |
| `src/hooks/queries/platform-admin.ts` | 531 | POST | `/api/platform-admin/ai-providers/test` | No `/test` sub-route exists. Only `/api/platform-admin/ai-providers` (GET) is defined. Either add the `/test` route or change the client to POST to the parent with a `{ action: "test" }` body. |
| `src/hooks/queries/platform-admin.ts` | 750 | POST | `/api/platform-admin/integrations/test` | No `/test` sub-route exists. Only `/api/platform-admin/integrations` (GET) is defined. Same fix pattern as above. |
| `src/hooks/queries/webhooks.ts` | 186 | POST | `/api/webhooks/deliveries/{deliveryId}/retry` | No `/:id/retry` sub-route exists. The `/api/webhooks/deliveries` route has a POST handler documented as "Retry a failed delivery" — the client should POST to `/api/webhooks/deliveries` with `{ deliveryId }` in the body. |
| `src/hooks/queries/webhooks.ts` | 209 | POST | `/api/webhooks/endpoints/{endpointId}/test` | No `/endpoints/:id/test` sub-route exists. The `/api/webhooks/events` route has a POST handler documented as "Trigger a test event (ping)" — the client should POST to `/api/webhooks/events` with `{ endpointId }` in the body. |

---

## C. Method mismatches (client calls a route that exists but uses wrong HTTP method) — 4 entries

| File | Line | Client Method | URL Template | Server Methods | Fix |
|---|---|---|---|---|---|
| `src/hooks/queries/ai.ts` | 451 | GET | `/api/ai/tools?companySlug=...` | POST only | Either (a) add a GET handler to `/api/ai/tools/route.ts` for listing tools, or (b) change the `useAITools` hook to POST. Server-side `export const POST = withErrorHandler(...)` is the only handler. |
| `src/hooks/queries/catalog.ts` | 74 | GET | `/api/catalog/{id}` | DELETE, PATCH | No GET handler exists on `/api/catalog/[id]/route.ts`. Either add a GET handler for fetching a single catalog item, or change `useCatalogItem` to fetch from `/api/catalog` list and filter by id client-side. |
| `src/hooks/queries/platform-admin.ts` | 420 | POST | `/api/platform-admin/queue-failures?clear=1` | GET only | `useClearQueueFailures` mutation POSTs but server only exports GET. Either add a DELETE/POST handler with `?clear=1` semantics, or change the client to call a different endpoint. |
| `src/hooks/queries/webhooks.ts` | 142 | PATCH | `/api/webhooks/endpoints/{id}` | DELETE, GET, PUT | `useUpdateWebhookEndpoint` uses PATCH but server only accepts PUT. Change `apiPatch` → `apiPut` in the hook. |

---

## D. Soft-matched callers (runtime-resolvable, not static-matchable) — 1 entry

| File | Line | Method | URL Template | Resolves to server route | Notes |
|---|---|---|---|---|---|
| `src/hooks/queries/accounting.ts` | 679 | POST | `/api/accounting/post-dated-checks/{id}/{action}?companySlug=...` | `/accounting/post-dated-checks/:id/cancel` OR `/accounting/post-dated-checks/:id/deposit` | The `{action}` path segment is a runtime variable that resolves to `cancel` or `deposit`. Both target routes exist on the server. Working as designed — just not statically provable. |

This means `/accounting/post-dated-checks/:id/cancel` and `/accounting/post-dated-checks/:id/deposit` are **soft-called** (not true orphans), reached at runtime depending on the `action` value.

---

## E. Duplicate route declarations — 0 entries

Walked all 208 `route.ts` files under `src/app/api/**`. Next.js framework guarantees one route file per directory, and the file-system router enforces uniqueness. Verified programmatically:

- `find src/app/api -name "route.ts" -type f | xargs dirname | sort | uniq -d` → empty (no duplicate directories).
- `find src/app/api -name "route.tsx" -type f` → empty (no alternate route file extensions shadowing the `.ts` versions).
- After normalizing `[xxx]` → `:xxx` and parameter names, all 208 normalized paths are unique (Python `Counter` returned no duplicates).

---

## F. `api-types.ts` duplicate-path verification — CLEAN

The worklog (Task P3) mentioned that `src/lib/openapi/api-types.ts` previously contained a duplicate `"/api/accounting/cash-flow"` key that was breaking `next build`. Verified the file is now clean:

- File: `src/lib/openapi/api-types.ts` (565 lines)
- `APIContractMap` interface (lines 449-561) contains **111 path keys**, all unique.
- `grep -E '^\s*"/api/' src/lib/openapi/api-types.ts | sort | uniq -d` → empty.
- The `/api/accounting/cash-flow` key appears exactly once (line 467).

Also verified the related OpenAPI artifacts have no duplicate path keys:
- `src/lib/openapi/openapi.json` — 208 paths, 0 duplicates.
- `src/lib/openapi/contract-test-helpers.ts` — 205 path declarations, 0 duplicates.
- `src/lib/openapi/sdk-client.ts` — 38 path references, 0 duplicates.

**Note:** `src/app/api-docs/page.tsx` has 21 duplicate path entries in its embedded metadata array (e.g. `"/api/invoices/{id}"` appears 3 times). This is intentional — the page lists each path once per HTTP method it supports (GET, POST, PATCH...) for the API docs UI. It is a UI display concern, not a route-declaration concern, and does not affect runtime routing.

---

## G. Summary statistics

| Metric | Count |
|---|---|
| Server route files (`src/app/api/**/route.ts`) | **208** |
| Server route paths (after `[xxx]` → `:xxx` normalization) | **208** (all unique) |
| Total HTTP method handlers across all routes | **328** (GET=148, POST=108, PATCH=34, DELETE=23, PUT=8, plus 7 raw `fetch()` callers + 1 `authedFetch` caller) |
| Client caller sites (React hooks + AuthContext + OnboardingScreen + signup page + sdk-client.ts) | **327** |
| Unique client URL templates | **213** |
| Callers that match a server route (exact path + method) | **318** |
| Callers that match a server route by path but wrong method (method mismatch) | **4** |
| Callers that soft-match a server route via dynamic path segment | **1** |
| Callers with NO matching server route (broken) | **5** |
| Server routes with ZERO callers (orphan endpoints) | **35** (33 truly orphan + 2 soft-called via runtime variable) |
| Duplicate route declarations | **0** |
| `api-types.ts` duplicate keys | **0** (verified clean) |
| `axios` usage | **0** (project does not use axios) |
| Server Actions (`"use server"` directives) | **0** (project does not use Next.js Server Actions) |
| SWR usage | **0** (project uses TanStack React Query only) |
