-- ════════════════════════════════════════════════════════════════════════════
-- Add missing FK indexes + columns required by schema.prisma
--
-- Failing tests identified 5 missing indexes:
--   1. purchase_invoices(supplierId)  — FK for supplier filtering
--   2. BudgetLine(budgetId)           — already exists as budget_lines_budgetId_idx
--   3. BudgetLine(accountId)          — FK for chart-of-accounts filtering
--   4. BudgetLine(costCenterId)       — FK for cost-center filtering
--   5. AdminAuditLog(targetSlug)      — FK for admin audit filtering
--
-- Additionally, two columns declared in schema.prisma were never created in
-- the DB by any prior migration:
--   - purchase_invoices.supplierId  (String?, nullable FK to suppliers)
--   - admin_audit_logs.targetSlug   (String?, nullable filter column)
--
-- All statements are idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. purchase_invoices: add supplierId column + index ─────────────────────
-- The schema declares supplierId String? with a relation to Supplier.
-- No prior migration created this column (the P1 index migration was neutered
-- because the column didn't exist yet).

ALTER TABLE "purchase_invoices" ADD COLUMN IF NOT EXISTS "supplierId" TEXT;

-- Add FK constraint idempotently
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'purchase_invoices_supplierId_fkey'
      AND table_name = 'purchase_invoices'
  ) THEN
    ALTER TABLE "purchase_invoices"
      ADD CONSTRAINT "purchase_invoices_supplierId_fkey"
      FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "purchase_invoices_supplierId_idx"
  ON "purchase_invoices"("supplierId");

-- ─── 2. budget_lines: add accountId + costCenterId indexes ──────────────────
-- budgetId index already exists (budget_lines_budgetId_idx from init migration).
-- accountId and costCenterId columns exist but had no indexes.

CREATE INDEX IF NOT EXISTS "budget_lines_accountId_idx"
  ON "budget_lines"("accountId");

CREATE INDEX IF NOT EXISTS "budget_lines_costCenterId_idx"
  ON "budget_lines"("costCenterId");

-- ─── 3. admin_audit_logs: add targetSlug column + index ─────────────────────
-- The schema declares targetSlug String? but no prior migration created it
-- (the P1 index migration was neutered because the column didn't exist yet).

ALTER TABLE "admin_audit_logs" ADD COLUMN IF NOT EXISTS "targetSlug" TEXT;

CREATE INDEX IF NOT EXISTS "admin_audit_logs_targetSlug_idx"
  ON "admin_audit_logs"("targetSlug");
