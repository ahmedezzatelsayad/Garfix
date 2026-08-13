-- ═══════════════════════════════════════════════════════════════════════════
-- DB-07 FIX (Audit v2 · Phase 2)
-- String → Decimal monetary field migration (schema reconciliation)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Problem
-- -------
-- 36 monetary fields are declared as `String` in prisma/schema.prisma but were
-- either:
--   (a) already migrated to DECIMAL(65,30) in the DB by the prior migration
--       20260801000000_decimal_migration_monetary_fields (schema drift), OR
--   (b) still String in BOTH schema and DB (never migrated at all).
--
-- Type-coercion bugs surface in financial APIs when Prisma reads DECIMAL
-- columns into `string` typed JS values: callers do `Number(paid)` which
-- works for "0.000" but throws on null, and write paths pass string values
-- like `"150.500"` to a DECIMAL column (Prisma accepts it but the typed
-- client errors).
--
-- Scope (36 fields across 14 tables)
-- ----------------------------------
--   companies.defaultTaxRate
--   bank_reconciliations.statementBalance
--   bank_reconciliations.bookBalance
--   bank_reconciliations.adjustedBalance
--   bank_reconciliations.difference
--   fixed_assets.acquisitionCost
--   fixed_assets.salvageValue
--   fixed_assets.decliningRate
--   fixed_assets.currentBookValue
--   fixed_assets.disposalAmount  (nullable)
--   depreciation_entries.depreciationAmount
--   depreciation_entries.bookValueAfter
--   budgets.plannedAmount
--   budgets.actualAmount
--   budgets.variance
--   fx_revaluations.exchangeRate           (NEW — was not in prior migration)
--   fx_revaluations.totalGainLoss          (NEW — was not in prior migration)
--   landed_cost_allocations.amount         (NEW — was not in prior migration)
--   hr_employees.baseSalary
--   purchase_invoices.subtotal             (NEW — was not in prior migration)
--   purchase_invoices.taxRate              (NEW — was not in prior migration)
--   purchase_invoices.taxAmount            (NEW — was not in prior migration)
--   purchase_invoices.paid                 (NEW — was not in prior migration)
--   quotations.subtotal
--   quotations.taxRate
--   quotations.taxAmount
--   purchase_orders.subtotal
--   purchase_orders.taxRate
--   purchase_orders.taxAmount
--   tax_filings.totalSales
--   tax_filings.totalPurchases
--   tax_filings.outputVat                   (NEW — was not in prior migration)
--   tax_filings.inputVat                    (NEW — was not in prior migration)
--   tax_filings.vatDue
--   subscription_schedules.amount
--   wps_files.totalAmount
--
-- Idempotency
-- -----------
-- For fields already migrated to DECIMAL by the prior migration, the
-- ALTER COLUMN ... TYPE DECIMAL(65,30) is a no-op (Postgres detects the
-- type is already DECIMAL(65,30) and skips the rewrite when possible).
-- For fields still String, the USING "<col>"::numeric clause casts existing
-- data. NULL values are preserved (column nullability unchanged).
--
-- The DROP DEFAULT / SET DEFAULT pattern is used because Postgres requires
-- defaults to be dropped before TYPE alteration if the default has a cast
-- dependency on the old type (e.g. default "0" string).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. companies.defaultTaxRate ─────────────────────────────────────────
ALTER TABLE "companies" ALTER COLUMN "defaultTaxRate" DROP DEFAULT;
ALTER TABLE "companies" ALTER COLUMN "defaultTaxRate" TYPE DECIMAL(65,30) USING "defaultTaxRate"::numeric;
ALTER TABLE "companies" ALTER COLUMN "defaultTaxRate" SET DEFAULT 0;

-- ─── 2. bank_reconciliations (4 fields) ──────────────────────────────────
ALTER TABLE "bank_reconciliations" ALTER COLUMN "statementBalance" DROP DEFAULT;
ALTER TABLE "bank_reconciliations" ALTER COLUMN "statementBalance" TYPE DECIMAL(65,30) USING "statementBalance"::numeric;
ALTER TABLE "bank_reconciliations" ALTER COLUMN "statementBalance" SET DEFAULT 0;

ALTER TABLE "bank_reconciliations" ALTER COLUMN "bookBalance" DROP DEFAULT;
ALTER TABLE "bank_reconciliations" ALTER COLUMN "bookBalance" TYPE DECIMAL(65,30) USING "bookBalance"::numeric;
ALTER TABLE "bank_reconciliations" ALTER COLUMN "bookBalance" SET DEFAULT 0;

ALTER TABLE "bank_reconciliations" ALTER COLUMN "adjustedBalance" DROP DEFAULT;
ALTER TABLE "bank_reconciliations" ALTER COLUMN "adjustedBalance" TYPE DECIMAL(65,30) USING "adjustedBalance"::numeric;
ALTER TABLE "bank_reconciliations" ALTER COLUMN "adjustedBalance" SET DEFAULT 0;

ALTER TABLE "bank_reconciliations" ALTER COLUMN "difference" DROP DEFAULT;
ALTER TABLE "bank_reconciliations" ALTER COLUMN "difference" TYPE DECIMAL(65,30) USING "difference"::numeric;
ALTER TABLE "bank_reconciliations" ALTER COLUMN "difference" SET DEFAULT 0;

-- ─── 3. fixed_assets (5 fields; disposalAmount is nullable) ──────────────
ALTER TABLE "fixed_assets" ALTER COLUMN "acquisitionCost" DROP DEFAULT;
ALTER TABLE "fixed_assets" ALTER COLUMN "acquisitionCost" TYPE DECIMAL(65,30) USING "acquisitionCost"::numeric;
ALTER TABLE "fixed_assets" ALTER COLUMN "acquisitionCost" SET DEFAULT 0;

ALTER TABLE "fixed_assets" ALTER COLUMN "salvageValue" DROP DEFAULT;
ALTER TABLE "fixed_assets" ALTER COLUMN "salvageValue" TYPE DECIMAL(65,30) USING "salvageValue"::numeric;
ALTER TABLE "fixed_assets" ALTER COLUMN "salvageValue" SET DEFAULT 0;

ALTER TABLE "fixed_assets" ALTER COLUMN "decliningRate" DROP DEFAULT;
ALTER TABLE "fixed_assets" ALTER COLUMN "decliningRate" TYPE DECIMAL(65,30) USING "decliningRate"::numeric;
ALTER TABLE "fixed_assets" ALTER COLUMN "decliningRate" SET DEFAULT 0;

ALTER TABLE "fixed_assets" ALTER COLUMN "currentBookValue" DROP DEFAULT;
ALTER TABLE "fixed_assets" ALTER COLUMN "currentBookValue" TYPE DECIMAL(65,30) USING "currentBookValue"::numeric;
ALTER TABLE "fixed_assets" ALTER COLUMN "currentBookValue" SET DEFAULT 0;

-- disposalAmount is nullable — preserve NULL values, no SET DEFAULT.
ALTER TABLE "fixed_assets" ALTER COLUMN "disposalAmount" TYPE DECIMAL(65,30) USING "disposalAmount"::numeric;

-- ─── 4. depreciation_entries (2 fields) ──────────────────────────────────
ALTER TABLE "depreciation_entries" ALTER COLUMN "depreciationAmount" DROP DEFAULT;
ALTER TABLE "depreciation_entries" ALTER COLUMN "depreciationAmount" TYPE DECIMAL(65,30) USING "depreciationAmount"::numeric;
ALTER TABLE "depreciation_entries" ALTER COLUMN "depreciationAmount" SET DEFAULT 0;

ALTER TABLE "depreciation_entries" ALTER COLUMN "bookValueAfter" DROP DEFAULT;
ALTER TABLE "depreciation_entries" ALTER COLUMN "bookValueAfter" TYPE DECIMAL(65,30) USING "bookValueAfter"::numeric;
ALTER TABLE "depreciation_entries" ALTER COLUMN "bookValueAfter" SET DEFAULT 0;

-- ─── 5. budgets (3 fields: plannedAmount, actualAmount, variance) ───────
ALTER TABLE "budgets" ALTER COLUMN "plannedAmount" DROP DEFAULT;
ALTER TABLE "budgets" ALTER COLUMN "plannedAmount" TYPE DECIMAL(65,30) USING "plannedAmount"::numeric;
ALTER TABLE "budgets" ALTER COLUMN "plannedAmount" SET DEFAULT 0;

ALTER TABLE "budgets" ALTER COLUMN "actualAmount" DROP DEFAULT;
ALTER TABLE "budgets" ALTER COLUMN "actualAmount" TYPE DECIMAL(65,30) USING "actualAmount"::numeric;
ALTER TABLE "budgets" ALTER COLUMN "actualAmount" SET DEFAULT 0;

ALTER TABLE "budgets" ALTER COLUMN "variance" DROP DEFAULT;
ALTER TABLE "budgets" ALTER COLUMN "variance" TYPE DECIMAL(65,30) USING "variance"::numeric;
ALTER TABLE "budgets" ALTER COLUMN "variance" SET DEFAULT 0;

-- ─── 6. fx_revaluations (2 NEW fields) ───────────────────────────────────
-- FIX (P3018): These columns were NEVER created by any prior migration.
-- The original migration here used ALTER COLUMN on non-existent columns,
-- causing P3018 "column ... does not exist" during `prisma migrate deploy`
-- on a fresh DB. We now ADD them as DECIMAL directly; the subsequent
-- ALTER COLUMN TYPE is a no-op when the column is already DECIMAL,
-- and stays as a safety net for any drifted DB that still has them as TEXT.
ALTER TABLE "fx_revaluations" ADD COLUMN IF NOT EXISTS "exchangeRate" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "fx_revaluations" ALTER COLUMN "exchangeRate" DROP DEFAULT;
ALTER TABLE "fx_revaluations" ALTER COLUMN "exchangeRate" TYPE DECIMAL(65,30) USING "exchangeRate"::numeric;
ALTER TABLE "fx_revaluations" ALTER COLUMN "exchangeRate" SET DEFAULT 0;

ALTER TABLE "fx_revaluations" ADD COLUMN IF NOT EXISTS "totalGainLoss" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "fx_revaluations" ALTER COLUMN "totalGainLoss" DROP DEFAULT;
ALTER TABLE "fx_revaluations" ALTER COLUMN "totalGainLoss" TYPE DECIMAL(65,30) USING "totalGainLoss"::numeric;
ALTER TABLE "fx_revaluations" ALTER COLUMN "totalGainLoss" SET DEFAULT 0;

-- ─── 7. landed_cost_allocations.amount (NEW field) ───────────────────────
-- FIX (P3018): amount was never created by any prior migration
-- (only totalCost exists on this table). ADD first, then ALTER is a no-op.
ALTER TABLE "landed_cost_allocations" ADD COLUMN IF NOT EXISTS "amount" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "landed_cost_allocations" ALTER COLUMN "amount" DROP DEFAULT;
ALTER TABLE "landed_cost_allocations" ALTER COLUMN "amount" TYPE DECIMAL(65,30) USING "amount"::numeric;
ALTER TABLE "landed_cost_allocations" ALTER COLUMN "amount" SET DEFAULT 0;

-- ─── 8. hr_employees.baseSalary ──────────────────────────────────────────
ALTER TABLE "hr_employees" ALTER COLUMN "baseSalary" DROP DEFAULT;
ALTER TABLE "hr_employees" ALTER COLUMN "baseSalary" TYPE DECIMAL(65,30) USING "baseSalary"::numeric;
ALTER TABLE "hr_employees" ALTER COLUMN "baseSalary" SET DEFAULT 0;

-- ─── 9. purchase_invoices (4 NEW fields: subtotal, taxRate, taxAmount, paid)
-- FIX (P3018): None of these 4 columns were ever created by a prior migration.
-- ADD COLUMN IF NOT EXISTS first; the ALTER COLUMN TYPE is then a no-op on
-- fresh DBs and a real conversion on any drifted DB that still has TEXT.
ALTER TABLE "purchase_invoices" ADD COLUMN IF NOT EXISTS "subtotal" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "purchase_invoices" ALTER COLUMN "subtotal" DROP DEFAULT;
ALTER TABLE "purchase_invoices" ALTER COLUMN "subtotal" TYPE DECIMAL(65,30) USING "subtotal"::numeric;
ALTER TABLE "purchase_invoices" ALTER COLUMN "subtotal" SET DEFAULT 0;

ALTER TABLE "purchase_invoices" ADD COLUMN IF NOT EXISTS "taxRate" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "purchase_invoices" ALTER COLUMN "taxRate" DROP DEFAULT;
ALTER TABLE "purchase_invoices" ALTER COLUMN "taxRate" TYPE DECIMAL(65,30) USING "taxRate"::numeric;
ALTER TABLE "purchase_invoices" ALTER COLUMN "taxRate" SET DEFAULT 0;

ALTER TABLE "purchase_invoices" ADD COLUMN IF NOT EXISTS "taxAmount" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "purchase_invoices" ALTER COLUMN "taxAmount" DROP DEFAULT;
ALTER TABLE "purchase_invoices" ALTER COLUMN "taxAmount" TYPE DECIMAL(65,30) USING "taxAmount"::numeric;
ALTER TABLE "purchase_invoices" ALTER COLUMN "taxAmount" SET DEFAULT 0;

ALTER TABLE "purchase_invoices" ADD COLUMN IF NOT EXISTS "paid" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "purchase_invoices" ALTER COLUMN "paid" DROP DEFAULT;
ALTER TABLE "purchase_invoices" ALTER COLUMN "paid" TYPE DECIMAL(65,30) USING "paid"::numeric;
ALTER TABLE "purchase_invoices" ALTER COLUMN "paid" SET DEFAULT 0;

-- ─── 10. quotations (3 fields) ───────────────────────────────────────────
ALTER TABLE "quotations" ALTER COLUMN "subtotal" DROP DEFAULT;
ALTER TABLE "quotations" ALTER COLUMN "subtotal" TYPE DECIMAL(65,30) USING "subtotal"::numeric;
ALTER TABLE "quotations" ALTER COLUMN "subtotal" SET DEFAULT 0;

ALTER TABLE "quotations" ALTER COLUMN "taxRate" DROP DEFAULT;
ALTER TABLE "quotations" ALTER COLUMN "taxRate" TYPE DECIMAL(65,30) USING "taxRate"::numeric;
ALTER TABLE "quotations" ALTER COLUMN "taxRate" SET DEFAULT 0;

ALTER TABLE "quotations" ALTER COLUMN "taxAmount" DROP DEFAULT;
ALTER TABLE "quotations" ALTER COLUMN "taxAmount" TYPE DECIMAL(65,30) USING "taxAmount"::numeric;
ALTER TABLE "quotations" ALTER COLUMN "taxAmount" SET DEFAULT 0;

-- ─── 11. purchase_orders (3 fields) ──────────────────────────────────────
ALTER TABLE "purchase_orders" ALTER COLUMN "subtotal" DROP DEFAULT;
ALTER TABLE "purchase_orders" ALTER COLUMN "subtotal" TYPE DECIMAL(65,30) USING "subtotal"::numeric;
ALTER TABLE "purchase_orders" ALTER COLUMN "subtotal" SET DEFAULT 0;

ALTER TABLE "purchase_orders" ALTER COLUMN "taxRate" DROP DEFAULT;
ALTER TABLE "purchase_orders" ALTER COLUMN "taxRate" TYPE DECIMAL(65,30) USING "taxRate"::numeric;
ALTER TABLE "purchase_orders" ALTER COLUMN "taxRate" SET DEFAULT 0;

ALTER TABLE "purchase_orders" ALTER COLUMN "taxAmount" DROP DEFAULT;
ALTER TABLE "purchase_orders" ALTER COLUMN "taxAmount" TYPE DECIMAL(65,30) USING "taxAmount"::numeric;
ALTER TABLE "purchase_orders" ALTER COLUMN "taxAmount" SET DEFAULT 0;

-- ─── 12. tax_filings (5 fields: 2 + 3 NEW) ───────────────────────────────
ALTER TABLE "tax_filings" ALTER COLUMN "totalSales" DROP DEFAULT;
ALTER TABLE "tax_filings" ALTER COLUMN "totalSales" TYPE DECIMAL(65,30) USING "totalSales"::numeric;
ALTER TABLE "tax_filings" ALTER COLUMN "totalSales" SET DEFAULT 0;

ALTER TABLE "tax_filings" ALTER COLUMN "totalPurchases" DROP DEFAULT;
ALTER TABLE "tax_filings" ALTER COLUMN "totalPurchases" TYPE DECIMAL(65,30) USING "totalPurchases"::numeric;
ALTER TABLE "tax_filings" ALTER COLUMN "totalPurchases" SET DEFAULT 0;

-- outputVat / inputVat were NEVER created by any prior migration.
-- FIX (P3018): ADD COLUMN IF NOT EXISTS first; subsequent ALTER is a no-op
-- on fresh DBs and a real conversion on drifted DBs that still have TEXT.
ALTER TABLE "tax_filings" ADD COLUMN IF NOT EXISTS "outputVat" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "tax_filings" ALTER COLUMN "outputVat" DROP DEFAULT;
ALTER TABLE "tax_filings" ALTER COLUMN "outputVat" TYPE DECIMAL(65,30) USING "outputVat"::numeric;
ALTER TABLE "tax_filings" ALTER COLUMN "outputVat" SET DEFAULT 0;

ALTER TABLE "tax_filings" ADD COLUMN IF NOT EXISTS "inputVat" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "tax_filings" ALTER COLUMN "inputVat" DROP DEFAULT;
ALTER TABLE "tax_filings" ALTER COLUMN "inputVat" TYPE DECIMAL(65,30) USING "inputVat"::numeric;
ALTER TABLE "tax_filings" ALTER COLUMN "inputVat" SET DEFAULT 0;

ALTER TABLE "tax_filings" ALTER COLUMN "vatDue" DROP DEFAULT;
ALTER TABLE "tax_filings" ALTER COLUMN "vatDue" TYPE DECIMAL(65,30) USING "vatDue"::numeric;
ALTER TABLE "tax_filings" ALTER COLUMN "vatDue" SET DEFAULT 0;

-- ─── 13. subscription_schedules.amount ───────────────────────────────────
ALTER TABLE "subscription_schedules" ALTER COLUMN "amount" DROP DEFAULT;
ALTER TABLE "subscription_schedules" ALTER COLUMN "amount" TYPE DECIMAL(65,30) USING "amount"::numeric;
ALTER TABLE "subscription_schedules" ALTER COLUMN "amount" SET DEFAULT 0;

-- ─── 14. wps_files.totalAmount ───────────────────────────────────────────
ALTER TABLE "wps_files" ALTER COLUMN "totalAmount" DROP DEFAULT;
ALTER TABLE "wps_files" ALTER COLUMN "totalAmount" TYPE DECIMAL(65,30) USING "totalAmount"::numeric;
ALTER TABLE "wps_files" ALTER COLUMN "totalAmount" SET DEFAULT 0;

-- ═══════════════════════════════════════════════════════════════════════════
-- End of DB-07 FIX migration.
-- After running `prisma migrate deploy`, regenerate the Prisma client with
-- `bunx prisma generate` so typed call sites see Decimal instead of string.
-- ═══════════════════════════════════════════════════════════════════════════
