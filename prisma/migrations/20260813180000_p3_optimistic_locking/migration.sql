-- DB-13 FIX (Audit v2 · Phase 3)
-- Extend optimistic locking (`version` column) to remaining financial models.
--
-- Previously only 7 models had a `version` column (see migration
-- 20260809100000_add_optimistic_locking_version.sql). The Phase 3 audit
-- (DB-13) identified 4 additional financial models that participate in
-- concurrent edits but lacked the guard:
--
--   * bank_transactions  (BankTransaction)  — reconciliation, import, manual edit
--   * fixed_assets       (FixedAsset)       — depreciation run, disposal, revaluation
--   * quotations         (Quotation)        — send, accept, reject, convert-to-invoice
--   * tax_filings        (TaxFiling)        — draft → filed → approved/rejected
--
-- The audit also names `PayrollRun` in its target list, but no such Prisma
-- model exists in the current schema. The closest payroll-related table is
-- `wps_files` (WPSFile — Wages Protection System upload records). A separate
-- follow-up task should decide whether WPSFile warrants optimistic locking
-- (it's an idempotent file-import record, not a financial aggregate) and
-- add `version` there if needed.
--
-- Idempotent: `ADD COLUMN IF NOT EXISTS` so re-running the migration on a
-- database that already has the column is a no-op. Backfill is unnecessary
-- because the column has a server-side DEFAULT 0 — existing rows get 0.
-- Each model's Prisma type now exposes `version: Int` with @default(0).
--
-- NB: We intentionally do NOT add a B-tree index on `version`. The existing
-- optimistic-locking pattern (`UPDATE ... WHERE id = $1 AND version = $2`)
-- is served by the primary-key index on `id`; a separate `version` index
-- would add write overhead without improving the lookup.

ALTER TABLE "bank_transactions" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "fixed_assets"    ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "quotations"      ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "tax_filings"     ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;
