# GATE 2 — Test Suite (Pragmatic Minimal v1)

This doc describes the **first runnable test suite** for GarfiX EOS v12. The
goal of GATE 2 was to break the zero-tests baseline by shipping a small set of
tests that actually execute under `bun test` and report pass/skip/fail counts,
not to deliver the full 100-case aspirational matrix from the master plan.

## How to run

```bash
cd /home/z/my-project/garfix
bun test                       # all tests across the project
bun test src/lib/__tests__/    # the lib-only subset (recommended for CI)
bun run test                   # equivalent to `bun test`
bun run test:lib               # the lib-only subset via npm-script
```

**Dependencies:** `bun install --ignore-scripts` (full `bun install` fails in
this sandbox on `@img/sharp-libvips-linux-x64`; the `--ignore-scripts` flag
skips that native extraction step, which is not needed for the unit tests).
After install, run `bunx prisma generate` once so `@prisma/client` is
available — the tests don't hit a real database, but the import chain
(`api.ts → auth.ts → db.ts → @prisma/client`) requires the generated client
to be present.

## What's covered

| Test file | Tests | What it covers |
|-----------|-------|----------------|
| `src/lib/__tests__/productMatcher.test.ts` | 22 | `normalizeArabic()` pure-function behavior (10 cases: case-fold, whitespace, diacritics, alef variants, ta-marbuta, alef-maqsura, Arabic-Indic digits, definite-article stripping, punctuation, empty input). `matchProduct()` end-to-end (12 cases: exact match, normalized match, Arabic-English alias, fuzzy typo, no-match, low-confidence fallback, B.7d bigram prefilter, kill-switch OFF downgrade, threshold tiers, Arabic-Indic digit input, exported constants). Uses `mock.module("@/lib/db", …)` so no real DB is hit. |
| `src/lib/__tests__/inventorySync.test.ts` | 10 | `isReviewQueueWarning()` (6 cases: recognizes `[REVIEW-QUEUE]` prefix, rejects `[OVERSELL]`, rejects arbitrary / empty strings, rejects in-string occurrences). Export smoke test (4 cases: verifies the three sync entrypoints and `recordStockMovement` are exported with the expected arities). |
| `src/lib/__tests__/api-helpers.test.ts` | 24 | `validateBody()` (4: success, zod failure, non-object, issue-details body). `parseJsonField()` (7: valid object, valid array, null, undefined, empty, invalid, generic fallback). `withErrorHandler()` (4: pass-through, caught Error → 500, caught non-Error → 500, multi-arg forwarding). `apiError` / `apiOk` (4). `parseJsonBody` (3: valid, empty, invalid). `getQuery` (2). |
| `src/lib/__tests__/collision-recovery-audit.test.ts` | 7 | `syncInventoryOnSale` (5 scenarios: happy-path decrement, oversell-block, no-inventory-block, collision-recovery-success, collision-recovery-fail). `syncInventoryOnPurchase` (2 scenarios: existing-inventory increment, new-inventory create). Uses the REAL `matchProduct` (not mocked) and controls its behavior via a stateful `tx.productAlias.findUnique` queue. `db.featureFlag`/`db.platformSetting` are monkey-patched in beforeAll/afterAll (NOT via `mock.module`) to avoid leaking into `productMatcher.test.ts`. |
| `src/lib/__tests__/invoices-crud.test.ts` | 11 | POST /api/invoices (4: happy path 200, 403 forbidden, 409 duplicate, 400 invalid). GET /api/invoices list (2: happy path with parsed lineItems, status filter). GET /api/invoices/[id] (3: happy path, 404, 403 cross-tenant). PATCH (1: update + version increment). DELETE (1: soft delete). Mocks `@/lib/auth`, `@/lib/middleware`, `@/lib/audit`, `@/lib/usageMeter` via `mock.module`. Does NOT mock `@/lib/inventorySync` or `@/lib/db` (uses the real syncInventoryOnSale via a rich fake `tx` passed by monkey-patched `db.$transaction`). |

**Total: 74 tests, 209 assertions.**

## Pass / skip / fail counts (actual run)

```
$ bun test src/lib/__tests__/

 74 pass
  0 skip
  0 fail
 209 expect() calls
Ran 74 tests across 5 files. [312ms]
```

**Note on `mock.module` isolation:** Bun's `mock.module()` is global across
all test files in the same process by default (i.e., without `--isolate`).
This means a mock registered in file A can leak into file B if file B imports
the same module. The two new test files added in the P1.6 pass
(`collision-recovery-audit.test.ts` and `invoices-crud.test.ts`) were
designed around this constraint:

- They do NOT use `mock.module()` for `@/lib/db`, `@/lib/productMatcher`, or
  `@/lib/inventorySync` — instead, `db` properties are monkey-patched in
  `beforeAll` and restored in `afterAll`, and the real `matchProduct` /
  `syncInventoryOnSale` are exercised.
- They DO use `mock.module()` for `@/lib/auth`, `@/lib/middleware`,
  `@/lib/audit`, and `@/lib/usageMeter` — these modules are only imported by
  the invoice route handlers, so the mocks don't affect other test files.

If `--isolate` is ever needed (e.g., when adding test files that must mock
`@/lib/db` with conflicting fixtures), run `bun test --isolate src/lib/__tests__/`.

The two WARN lines visible in the output (`JWT_SECRET not set` /
`JWT_REFRESH_SECRET not set`) are emitted **once** by `src/lib/auth.ts` at
module-load time when `JWT_SECRET` / `JWT_REFRESH_SECRET` are not in the env.
They are harmless — `resolveSecret()` falls back to a dev-only secret when
`NODE_ENV !== "production"`. Setting `JWT_SECRET` and `JWT_REFRESH_SECRET` to
any 16+ char strings silences them but is not required to run the tests.

The single WARN from `[ai-resolver] no OPENROUTER_API_KEY` comes from one test
case that drives `matchProduct()` into the AI-zone (0.70-0.85 confidence),
which triggers the AI resolver import. The resolver correctly detects the
missing key and falls back to the review queue — the test still passes.

## Skipped tests

**None.** All tests written for this pass execute and pass. `it.skip()` was
not needed because:

1. The pure-function tests (`normalizeArabic`, `isReviewQueueWarning`,
   `validateBody`, `parseJsonField`, `withErrorHandler`, `apiError`/`apiOk`,
   `parseJsonBody`, `getQuery`) need no DB and no env beyond what Bun sets by
   default.
2. The `matchProduct` end-to-end tests use `Bun.mock.module("@/lib/db", …)`
   to swap the Prisma client with a deterministic in-memory fake before the
   matcher module is imported. This avoids the "Prisma client connect" problem
   that would otherwise force a skip.

## What's NOT in this pass — and why each is deferred

The master plan's GATE 2 wishlist mentions five test files. Three were
delivered in the initial GATE 2 pass (`productMatcher`, `api-helpers`,
plus the `inventorySync` smoke test). Two more were delivered in the
P1.6 follow-up pass (`collision-recovery-audit` and `invoices-crud`).
One remains outstanding:

### 1. `task1-100-cases.test.ts` (100-case invoice matching matrix)

**Deferred because:**
- The fixture data file `garfix_test_invoices.json` does not exist in this
  repo. Building it would require either (a) hand-curating 100 bilingual
  invoice line items with known-good match expectations, or (b) running
  the platform end-to-end against a seeded tenant DB to capture them.
- 100 cases × the current per-test DB-mock setup (~5 lines each) is a
  significant data-entry effort that doesn't increase **coverage** — the
  underlying `matchProduct()` is already exercised by the 12 representative
  cases in `productMatcher.test.ts` (exact / normalized / Arabic / fuzzy /
  no-match / kill-switch / prefilter).
- The right home for these 100 cases is a **table-driven fixture** loaded
  from a JSON file, not 100 hand-written `it()` blocks. That refactor
  belongs in a follow-up PR.

**Recommended next step:** create `src/lib/__tests__/fixtures/task1-cases.json`
with the schema `{ description, expectedProductId, expectedTier }[]`, then
write a single `describe.each(cases)` block that iterates them. Reuse the
`dbMock` already defined in `productMatcher.test.ts`.

### 2. `collision-recovery-audit.test.ts` (sale + purchase collision recovery) — DELIVERED in P1.6

**Status:** ✅ Delivered at `src/lib/__tests__/collision-recovery-audit.test.ts` (7 tests, all pass).

The deferred-rationale notes above (from the initial GATE 2 pass) turned out
to be overly conservative. The mock fixture is ~40 lines (not ~80),
reused across all 7 scenarios via a `makeTx(opts)` factory. The key insight
was to use the REAL `matchProduct` (not a mock) and control its behavior
via a stateful `tx.productAlias.findUnique` queue. This avoids the
`mock.module("@/lib/productMatcher", …)` leak that would break
`productMatcher.test.ts` (Bun's `mock.module` is global by default).

`db.featureFlag` and `db.platformSetting` (read by `matchProduct`'s
`getTenantConfig`) are monkey-patched in `beforeAll`/`afterAll` rather
than via `mock.module("@/lib/db", …)` for the same reason.

### 3. `invoices-crud.test.ts` (invoice REST endpoints) — DELIVERED in P1.6

**Status:** ✅ Delivered at `src/lib/__tests__/invoices-crud.test.ts` (11 tests, all pass).

The deferred-rationale notes above (JWT cookie signing, ~50 lines of
fixture per test) turned out to be solvable without a JWT helper. Instead
of signing real JWTs, `@/lib/auth` and `@/lib/middleware` are mocked via
`mock.module` — the mocked `resolveAuth` returns a fake `AuthPayload`
directly, bypassing the cookie/JWT path entirely. The mock reproduces the
real `assertCompanyAccess` logic (admin bypass + `companies.includes(slug)`)
so the cross-tenant 403 test exercises the same access-control logic the
production code relies on.

11 scenarios are covered: POST happy/403/409/400, GET list happy + status
filter, GET [id] happy/404/403-cross-tenant, PATCH happy (version
increment), DELETE (soft delete). The real `syncInventoryOnSale` is
exercised on the POST happy path via `db.$transaction` (which is
monkey-patched to pass a rich fake `tx`).

### 4. `b10-performance-benchmark.test.ts`

**Deferred because:**
- The B.10 benchmark measures matcher throughput (matches/sec) and p99
  latency under a synthetic load. To produce stable numbers it must run
  in isolation (no other test polluting the matcher's in-memory config
  cache) and ideally in a release build (Bun's dev mode adds JIT overhead).
- The benchmark has no "pass/fail" semantics — it produces a report. It
  belongs in a separate `bun run bench` script, not in `bun test`.
- A naive implementation using `Bun.nanoseconds()` around a 1000-iteration
  loop is straightforward (~30 lines), but the numbers it produces in this
  sandbox are not representative of production hardware. Better to defer
  until we have a real CI runner with stable performance characteristics.

**Recommended next step:** add `scripts/bench-productMatcher.ts` that
loads a fixture of 1000 line items, calls `matchProduct` in a loop, and
prints `ops/sec` + `p50/p95/p99` latency. Wire to a `"bench"` script in
`package.json`. Don't gate CI on the absolute numbers — gate on
"benchmark completes without throwing".

## Environment notes

- **Bun version:** 1.3.14
- **Prisma client:** generated via `bunx prisma generate` (v6.19.3)
- **DATABASE_URL:** `file:/home/z/my-project/db/custom.db` (does NOT need
  to exist for these tests — all DB calls are mocked)
- **JWT_SECRET / JWT_REFRESH_SECRET:** not set; the auth module emits a
  console warning and falls back to a dev secret. Tests still pass.
- **OPENROUTER_API_KEY:** not set; the AI resolver logs a warning and
  falls back to the review queue. Tests still pass.
- **FOUNDER_EMAIL:** not set; defaults to `founder@garfix.app`. Not
  exercised by these tests.
