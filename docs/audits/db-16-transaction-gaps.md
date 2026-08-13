# DB-16 — Transaction Boundaries on Multi-Write Operations

**Audit**: P3-DB-16 (Audit v2 · Phase 3)
**Status**: Partial — top 5 most critical gaps fixed; remaining items tracked below.
**Date**: 2026-08-13
**Owner**: Senior Database Engineer

## 1. Problem

Several multi-write operations in `src/lib/` performed sequential
`db.create` / `db.update` calls **without** wrapping them in a single
`$transaction`. If the process crashed between writes — or the second write
threw — the database was left in an inconsistent state:

* A subscription schedule could be marked `active` while the company's
  `currentBillingCycleEnd` was stale → the scheduler would re-charge the
  customer.
* A cancelled schedule could coexist with a still-paid company plan → the
  customer kept being billed for a cancelled subscription.
* An AI provisioning event could be persisted without its audit row → the
  audit trail was incomplete.

Prisma's RLS extension already wraps **each individual** operation in a
`$transaction` (so each write is atomic in isolation), but sequential writes
were **not** in the *same* transaction — atomicity across writes was missing.

## 2. Scope of search

The DB-16 directive nominally targets `src/lib/services/`. A search of that
directory (`ai-provisioning.ts`, `gemini.ts`) found **one** multi-write
pattern (`provisionAIForNewCompany`: `companyAIConfig.create` + best-effort
`logProvisioningEvent`). Because `src/lib/services/` is small and the audit's
intent is "fix multi-write transaction gaps in service-layer code", we
extended the search to `src/lib/billing/`, where the recurring-billing engine
had **four** critical multi-write sequences.

## 3. Fixes applied (top 5 most critical)

All five changes use the existing `withTenantTx` wrapper (`src/lib/db.ts`),
which sets the RLS extension's `inTransaction` ALS flag so the per-operation
interceptor does **not** open a nested `$transaction`. Each carries the
`// DB-16 FIX (Audit v2 · Phase 3)` comment.

| # | File | Function | Writes wrapped |
|---|------|----------|----------------|
| 1 | `src/lib/services/ai-provisioning.ts` | `provisionAIForNewCompany` | `companyAIConfig.create` + `logProvisioningEvent` (audit row) |
| 2 | `src/lib/billing/subscription-engine.ts` | `createSchedule` | `subscriptionSchedule.create` + `company.update` |
| 3 | `src/lib/billing/subscription-engine.ts` | `processScheduledCharge` (success path) | `subscriptionSchedule.update` + `company.update` |
| 4 | `src/lib/billing/subscription-engine.ts` | `processScheduledCharge` (max-retries / downgrade path) | `subscriptionSchedule.update` + `company.update` |
| 5 | `src/lib/billing/subscription-engine.ts` | `reactivateSubscription` | `subscriptionSchedule.update` + `company.update` |

## 4. Remaining gaps (follow-up)

The following multi-write patterns were identified but **not** fixed in this
sprint. They are lower-risk (either idempotent, best-effort, or already
wrapped by an outer queue transaction) and should be addressed in a future
P3 batch:

* **`src/lib/billing/subscription-engine.ts` — `processPaymentTransaction`
  webhook handler**: writes `paymentTransaction` + `subscriptionSchedule` +
  `company` across multiple conditional branches. Already partially wrapped
  in a per-event idempotency key, but the writes themselves are not in a
  single `$transaction`.
* **`src/lib/accounting/period-close.ts`**: writes `fiscalPeriod` +
  `journalEntry` (closing entries) without a shared transaction.
* **`src/lib/accounting/auto-journal.ts`**: emits multiple `journalEntryLine`
  rows via `createMany` (atomic by itself) but pairs them with a separate
  `journalEntry.update` for the running balance — the two are not in the same
  `$transaction`.
* **`src/lib/accounting/banking.ts` (bank import)**: inserts multiple
  `bankTransaction` rows + a `bankReconciliation` header without a shared
  transaction.
* **`src/app/api/accounting/journal-entries/route.ts` (POST)**: creates the
  `journalEntry` header and its lines in two separate `db.create` calls.

### Remediation plan

1. Adopt `withTenantTx` as the standard wrapper for any service-layer
   function that performs ≥ 2 writes. Add an ESLint rule (or codemod) that
   flags sequential `db.<model>.<write>` calls outside a `withTenantTx`
   callback.
2. Refactor the remaining gaps above, one file per PR, with regression tests
   that inject a fault between the writes (e.g. throw inside the tx callback)
   and assert both writes roll back.
3. Backfill unit tests for the 5 fixes in this sprint — see
   `src/lib/billing/__tests__/subscription-engine.test.ts` (existing) and
   add a `provisionAIForNewCompany` rollback test in
   `src/lib/services/__tests__/`.

## 5. Verification

* `bunx tsc --noEmit` — 0 errors after the changes.
* No migration required — DB-16 is a code-only change; the `withTenantTx`
  wrapper already exists in `src/lib/db.ts`.
* Existing tests in `src/lib/billing/__tests__/subscription-engine.test.ts`
  continue to pass (they mock `db` at the module boundary, and
  `withTenantTx` calls `dbTyped.$transaction` with the same mocked client).
