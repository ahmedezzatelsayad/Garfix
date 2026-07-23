# Phase 6-8 — Inventory Costing, Tax Compliance, Multi-Company Consolidation

## Task Summary

Created business logic and API routes for three phases of the GarfiX ERP accounting module.

## Files Created

### Phase 6 — Inventory Costing

1. **`/src/lib/accounting/inventory-costing.ts`** — Business logic engine
   - `calculateCOGS()` — FIFO, Weighted Average, Standard Cost methods
   - `runInventoryValuation()` — Company-wide inventory valuation report
   - `calculateLandedCost()` — Distribute landed costs (shipping, customs, clearance, insurance) by quantity/value/weight/volume
   - `recordInventoryAdjustment()` — Journal entries for inventory discrepancy (shortfall/excess)

2. **`/src/app/api/accounting/inventory-valuation/route.ts`** — GET (valuation report) + POST (COGS calculation)
3. **`/src/app/api/accounting/landed-cost/route.ts`** — GET (list allocations) + POST (create allocation)
4. **`/src/app/api/accounting/landed-cost/[id]/route.ts`** — GET/PATCH/DELETE single allocation

### Phase 7 — Tax & Compliance

5. **`/src/lib/accounting/tax-compliance.ts`** — Business logic engine
   - `generateVATReturn()` — VAT return with sales/purchases/VAT due, uses `getCountryConfig()` for country-specific rates
   - `calculateZakat()` — Saudi-only: 2.5% of zakat base (equity + LT liabilities + fixed assets - LT investments)
   - `getFilingReminders()` — Per-country filing deadlines (KW: quarterly, SA: monthly/quarterly, AE: quarterly)
   - `checkRetentionCompliance()` — Uses `getRetentionYears()` per country, checks records older than retention

6. **`/src/app/api/accounting/tax-filing/route.ts`** — GET (list filings) + POST (VAT return/Zakat via discriminated union)
7. **`/src/app/api/accounting/tax-filing/[id]/route.ts`** — GET/PATCH (status transitions: draft→submitted→accepted/rejected)
8. **`/src/app/api/accounting/filing-reminders/route.ts`** — GET filing reminders
9. **`/src/app/api/accounting/retention-check/route.ts`** — GET retention compliance

### Phase 8 — Multi-Company Consolidation

10. **`/src/lib/accounting/consolidation.ts`** — Business logic engine
    - `consolidateGroup()` — Aggregates BS/P&L across companies, eliminates inter-company transactions
    - `eliminateInterCompanyTransactions()` — Creates elimination JEs in both companies
    - `createInterCompanySettlement()` — Creates InterCompanyTransaction + JEs in both companies

11. **`/src/app/api/accounting/consolidation/route.ts`** — GET (consolidated reports) + POST (consolidate group)
12. **`/src/app/api/accounting/inter-company/route.ts`** — GET (list transactions) + POST (create settlement)
13. **`/src/app/api/accounting/inter-company/[id]/route.ts`** — GET/PATCH (settle/cancel with status transitions)

## Critical Rules Followed

- **ALL monetary values as String** — use `num()`, `addNums()`, `mulNums()`, `subNums()`, `toNum()` from `money.ts`
- **ALL endpoints use `requirePermissionForCompany` + `withErrorHandler`** — consistent auth/permission pattern
- **ALL mutations log audit via `logAudit`** — audit trail for every create/update/delete
- **ALL validations use Zod schemas** — request body validation before processing
- **Used `getCountryConfig` from `gulfConfig.ts`** — no hardcoded VAT rates; country-specific config used dynamically
- **Followed existing journal-entries route pattern** — same auth flow, validation, transaction handling

## Lint Status

All new files pass ESLint. The only pre-existing lint error is in `src/app/status/page.tsx` (unrelated to this task).

## Prisma Models Used

- `LandedCostAllocation` + `LandedCostLine` (existing)
- `InterCompanyTransaction` (existing)
- `TaxFiling` (existing)
- `InventoryItem`, `StockMovement`, `ProductCatalog` (existing)
- `JournalEntry`, `JournalEntryLine`, `Account` (existing)
- `Invoice`, `PurchaseInvoice` (existing)
- `Company` (existing)

No schema changes were needed — all required models already exist in the Prisma schema.
