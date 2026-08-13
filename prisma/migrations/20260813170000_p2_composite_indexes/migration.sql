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
CREATE INDEX IF NOT EXISTS "invoices_companySlug_status_issueDate_idx"
  ON "invoices" ("companySlug", "status", "issueDate");
CREATE INDEX IF NOT EXISTS "payment_transactions_companySlug_status_createdAt_idx"
  ON "payment_transactions" ("companySlug", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "journal_entries_companySlug_status_date_idx"
  ON "journal_entries" ("companySlug", "status", "date");
CREATE INDEX IF NOT EXISTS "purchase_invoices_companySlug_status_issueDate_idx"
  ON "purchase_invoices" ("companySlug", "status", "issueDate");
CREATE INDEX IF NOT EXISTS "bank_transactions_companySlug_status_transactionDate_idx"
  ON "bank_transactions" ("companySlug", "status", "transactionDate");
CREATE INDEX IF NOT EXISTS "audit_logs_companySlug_action_createdAt_idx"
  ON "audit_logs" ("companySlug", "action", "createdAt");
