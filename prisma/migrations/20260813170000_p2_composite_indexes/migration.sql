-- ═══════════════════════════════════════════════════════════════════════════
-- DB-11 FIX (Audit v2 · Phase 2)
-- Composite indexes for hot tenant + status + date queries
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Problem
-- -------
-- Every tenant-scoped list view (invoices, payments, journal entries,
-- purchase invoices, bank transactions, audit logs) filters by
-- `companySlug + status + <date>` and orders by the date desc. Without a
-- composite index, Postgres does a per-tenant index scan + filter + sort,
-- which on the largest tenants (50k+ rows per table) hits 200-400ms p99.
--
-- Fix
-- ---
-- Six composite indexes covering the canonical hot query shape:
--   (companySlug, status, <date>)
--
-- The column order matches equality-first (companySlug, status) then range
-- (date) so Postgres can do an index-only scan with a stable sort.
--
-- All indexes use `CREATE INDEX IF NOT EXISTS` so the migration is
-- idempotent and safe to re-run.
--
-- Tables covered
-- --------------
--   invoices             — (companySlug, status, issueDate)
--   payment_transactions — (companySlug, status, createdAt)
--   journal_entries      — (companySlug, status, date)
--   purchase_invoices    — (companySlug, status, issueDate)
--   bank_transactions    — (companySlug, status, transactionDate)
--   audit_logs           — (companySlug, action, createdAt)
-- ═══════════════════════════════════════════════════════════════════════════

-- DB-11 FIX: 6 composite indexes for hot queries
--
-- FIX (P3018): Two of the indexes referenced columns that don't exist in
-- the DB OR the Prisma schema:
--   - purchase_invoices.{status, issueDate}  — never created by any prior
--     migration (schema.prisma declares them, but no ADD COLUMN migration
--     ever added them to the table).
--   - bank_transactions.{status, transactionDate}  — NOT in schema.prisma
--     at all. The migration author likely intended different column names
--     (e.g. isReconciled / transactionType / date).
--
-- On a fresh DB, the unconditional CREATE INDEX failed with P3018
-- "column \"status\" does not exist" (Postgres error 42703 in
-- indexcmds.c:ComputeIndexAttrs). This blocked Playwright E2E CI.
--
-- Fix: wrap those 2 indexes in conditional DO blocks that check the
-- columns exist before creating the index. On a fresh DB, the indexes
-- are skipped (matching the absence of their columns). On any drifted
-- DB that happens to have the columns, the index is created normally.
-- The 4 other indexes are unchanged (their columns exist).

CREATE INDEX IF NOT EXISTS "invoices_companySlug_status_issueDate_idx"
  ON "invoices" ("companySlug", "status", "issueDate");
CREATE INDEX IF NOT EXISTS "payment_transactions_companySlug_status_createdAt_idx"
  ON "payment_transactions" ("companySlug", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "journal_entries_companySlug_status_date_idx"
  ON "journal_entries" ("companySlug", "status", "date");

-- purchase_invoices: skip index if status or issueDate column is missing
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_invoices' AND column_name = 'status'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_invoices' AND column_name = 'issueDate'
  ) THEN
    CREATE INDEX IF NOT EXISTS "purchase_invoices_companySlug_status_issueDate_idx"
      ON "purchase_invoices" ("companySlug", "status", "issueDate");
  END IF;
END $$;

-- bank_transactions: skip index if status or transactionDate column is missing
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bank_transactions' AND column_name = 'status'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bank_transactions' AND column_name = 'transactionDate'
  ) THEN
    CREATE INDEX IF NOT EXISTS "bank_transactions_companySlug_status_transactionDate_idx"
      ON "bank_transactions" ("companySlug", "status", "transactionDate");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "audit_logs_companySlug_action_createdAt_idx"
  ON "audit_logs" ("companySlug", "action", "createdAt");
