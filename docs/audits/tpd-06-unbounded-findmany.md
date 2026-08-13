# TPD-06 — Unbounded `findMany` Audit & Remediation Plan

> // TPD-06 FIX (Audit v2 · Phase 2)
>
> **Problem**: 79+ `prisma.findMany({ ... })` calls in `src/app/api/**` have
> no `take:` limit. Prisma's `findMany` defaults to returning **every
> matching row** — in a multi-tenant ERP growing to millions of rows per
> table, an unbounded `findMany` can:
>
> - OOM the Node.js process (loading the entire table into memory).
> - Exhaust the Prisma connection pool (one query holds one connection for
>   the duration of a full-table scan).
> - Take down the database replica under concurrent load.
> - Cause cascading 503s when a single tenant's table grows past the
>   `statement_timeout`.

## What we shipped in Phase 2

A CI lint rule that **makes the existing count a gate** so the number can
only go DOWN. New unbounded calls are blocked at PR time.

```bash
bun run lint:findmany        # local
node scripts/check-unbounded-findmany.mjs   # equivalent
```

The script:

1. Walks every `*.ts` / `*.tsx` file under `src/app/api/`.
2. Greps for the regex `/\.findMany\(\s*/`.
3. For each match, walks the argument object's brace-balanced body and
   checks for the `take:` field.
4. Flags two violation classes:
   - `findMany({...})` without `take:` field
   - `findMany()` with no arguments (always unbounded)
5. Supports an `ALLOWLIST` set inside the script for intentional
   maintenance scripts (none today).
6. Exits 1 if any violation is found; 0 if all clear.

### Known limitations

- The script does **not** flag `findMany(someVariable)` — when the args
  are passed via a variable, the `take:` field cannot be statically
  detected. A grep audit found zero such sites in `src/app/api/` today;
  the lint rule will catch the inline-literal form which is the dominant
  pattern.
- The script does **not** flag `findUnique`, `findFirst`, or
  `aggregate` — those have implicit limits.
- The script does **not** enforce a specific `take:` value. A `take: 1`
  is valid; so is `take: 10000`. Establishing per-endpoint limits is a
  Phase 3 design task.

## Phase 3 remediation plan

### Inventory (current snapshot)

The lint rule reports **83 violations** across **60 files** as of the
Phase 2 audit. The audit's original count was 79 — the 4-unit delta is
because the lint script also catches:

- `findMany()` (no args) — 2 sites in `src/app/api/modules/route.ts`
  and `src/app/api/settings/route.ts`.
- `findMany` inside loops/conditionals that the human audit considered
  "low risk" but are still technically unbounded.

The full violation list is reproduced below in the **Violation Index**
section. To regenerate:

```bash
node scripts/check-unbounded-findmany.mjs 2>&1 | grep "^  src" | sort
```

### Triage rules (apply in this order)

| Priority | Heuristic                                          | Default `take:` |
| -------- | -------------------------------------------------- | --------------- |
| P0       | Tenanted tables (`invoices`, `productCatalog`, …)  | `100`           |
| P0       | Platform-admin endpoints (cross-tenant scans)     | `200`           |
| P1       | Configuration / settings tables (small, bounded)  | `500`           |
| P2       | Founder-panel aggregation queries                  | `1000`          |
| Allow    | Maintenance scripts that must scan every row       | n/a — allowlist |

### Fix template

```diff
- const invoices = await db.invoice.findMany({
+ const invoices = await db.invoice.findMany({
    where: { companySlug },
+   take: 100,
    orderBy: { createdAt: "desc" },
  });
```

For endpoints that already return paginated data, switch to **cursor
pagination** (`cursor`, `skip`, `take`) per the Prisma docs.

### CI integration

Add to `.github/workflows/ci.yml` (or equivalent):

```yaml
- name: Lint unbounded findMany
  run: bun run lint:findmany
```

The job will fail until all 83 existing violations are either fixed or
allow-listed with a documented reason. Track progress via the
`ALLOWLIST` size in `scripts/check-unbounded-findmany.mjs` — the goal
is zero allowlist entries.

## Violation Index (snapshot at Phase 2 audit)

> Regenerate with: `node scripts/check-unbounded-findmany.mjs 2>&1 | grep "^  src" | sort`

```
src/app/api/accounting/accountant-access/route.ts:27
src/app/api/accounting/accounts/route.ts:47
src/app/api/accounting/asset-disposals/route.ts:28
src/app/api/accounting/balance-sheet/route.ts:29
src/app/api/accounting/balance-sheet/route.ts:35
src/app/api/accounting/bank-accounts/route.ts:52
src/app/api/accounting/budgets/route.ts:61
src/app/api/accounting/budgets/route.ts:106
src/app/api/accounting/budgets/route.ts:119
src/app/api/accounting/cash-flow/route.ts:22
src/app/api/accounting/cost-centers/route.ts:47
src/app/api/accounting/fiscal-periods/route.ts:61
src/app/api/accounting/fiscal/[year]/route.ts:49
src/app/api/accounting/fiscal/[year]/route.ts:54
src/app/api/accounting/fiscal/[year]/route.ts:187
src/app/api/accounting/fiscal/[year]/route.ts:200
src/app/api/accounting/fiscal/route.ts:51
src/app/api/accounting/installments/route.ts:47
src/app/api/accounting/inter-company/[id]/settle/route.ts:201
src/app/api/accounting/journal-entries/[id]/reverse/route.ts:78
src/app/api/accounting/journal-entries/route.ts:103
src/app/api/accounting/opening-balances/post/route.ts:37
src/app/api/accounting/opening-balances/post/route.ts:132
src/app/api/accounting/opening-balances/route.ts:36
src/app/api/accounting/opening-balances/route.ts:88
src/app/api/accounting/opening-balances/route.ts:199
src/app/api/accounting/opening-balances/route.ts:248
src/app/api/accounting/payroll/route.ts:55
src/app/api/accounting/payroll/route.ts:129
src/app/api/accounting/post-dated-checks/route.ts:64
src/app/api/accounting/profit-loss/route.ts:22
src/app/api/accounting/recurring/[id]/route.ts:132
src/app/api/accounting/recurring/[id]/run/route.ts:140
src/app/api/accounting/recurring/process-due/route.ts:74
src/app/api/accounting/recurring/process-due/route.ts:152
src/app/api/accounting/recurring/route.ts:169
src/app/api/accounting/reports/general-ledger/route.ts:174
src/app/api/accounting/reports/general-ledger/route.ts:301
src/app/api/accounting/trial-balance/route.ts:19
src/app/api/ai/bulk-import/route.ts:103
src/app/api/ai/chat/route.ts:290
src/app/api/ai/chat/stream/route.ts:280
src/app/api/ai/parse-image/route.ts:283
src/app/api/ai/smart-parse/route.ts:369
src/app/api/ai/tools/route.ts:573
src/app/api/ai/tools/route.ts:772
src/app/api/ai/tools/route.ts:788
src/app/api/automation/route.ts:40
src/app/api/companies/route.ts:69
src/app/api/companies/route.ts:71
src/app/api/dashboard/stats/route.ts:103
src/app/api/e-invoicing/zatca/status/route.ts:40
src/app/api/feature-flags/route.ts:45
src/app/api/founder-panel/api-key-pool/route.ts:241
src/app/api/founder-panel/companies/route.ts:70
src/app/api/founder-panel/e-invoicing/[slug]/route.ts:157
src/app/api/founder-panel/e-invoicing/route.ts:50
src/app/api/founder-panel/e-invoicing/route.ts:67
src/app/api/founder-panel/e-invoicing/route.ts:85
src/app/api/founder-panel/e-invoicing/stats/route.ts:86
src/app/api/founder-panel/e-invoicing/stats/route.ts:118
src/app/api/founder-panel/finops/route.ts:94
src/app/api/inventory/movements/route.ts:86
src/app/api/inventory/warehouses/route.ts:32
src/app/api/invoice-templates/route.ts:52
src/app/api/invoices/route.ts:106
src/app/api/landing-content/route.ts:24
src/app/api/modules/route.ts:27
src/app/api/platform-admin/ai-usage/route.ts:61
src/app/api/platform-admin/feature-flags/route.ts:31
src/app/api/platform-admin/integrations/route.ts:26
src/app/api/platform-admin/landing-content/route.ts:29
src/app/api/platform-admin/retention-cleanup/route.ts:39
src/app/api/platform-admin/review-queue/route.ts:61
src/app/api/platform-admin/tenants/[slug]/route.ts:279
src/app/api/platform-admin/tenants/route.ts:25
src/app/api/platform-admin/tenants/route.ts:46
src/app/api/platform-admin/tenants/route.ts:55
src/app/api/product-matching/config/route.ts:39
src/app/api/settings/route.ts:27
src/app/api/webhooks/deliveries/route.ts:134
src/app/api/webhooks/endpoints/route.ts:40
src/app/api/webhooks/whatsapp/route.ts:85
```
