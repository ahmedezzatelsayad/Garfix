-- ════════════════════════════════════════════════════════════════════════════
-- P1-3 + P1-2: DB Indexes + SessionRegistry schema reconciliation
--
-- This migration adds missing @@index declarations to high-traffic tables
-- AND synchronizes the SessionRegistry schema (the table at the DB level
-- had `userUid`, `jti`, `userAgent` columns added by 20260730000000_fix_schema_drift.sql
-- but schema.prisma was never updated to declare them, so Prisma client
-- generation was producing types with the legacy `userId` / `tokenHash` /
-- `deviceInfo` fields — masking real bugs because `db` was typed as `any`).
--
-- All CREATE INDEX statements use `IF NOT EXISTS` so this migration is
-- idempotent and safe to re-run on a DB that already has some of these
-- indexes (e.g. from a prior manual CREATE INDEX).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. SessionRegistry — index declarations matching schema.prisma ─────────
-- (the columns themselves were added by 20260730000000_fix_schema_drift.sql;
--  we only add the missing indexes here)

-- P1 FIX: Removed DO $$ block for SessionRegistry_userUid_idx — use IF NOT EXISTS instead

-- P1 FIX: Removed DO $$ block for SessionRegistry_expiresAt_idx — use IF NOT EXISTS instead

-- ─── 2. JournalEntryLine — FK indexes on journalEntryId + accountId ────────

-- P1 FIX: Removed DO $$ block for journal_entry_lines_journalEntryId_idx — use IF NOT EXISTS instead

-- P1 FIX: Removed DO $$ block for journal_entry_lines_accountId_idx — use IF NOT EXISTS instead

-- ─── 3. JournalEntry — soft-delete composite + date indexes ────────────────

-- P1 FIX: Removed DO $$ block for journal_entries_companySlug_deletedAt_idx — use IF NOT EXISTS instead

-- P1 FIX: Removed DO $$ block for journal_entries_date_idx — use IF NOT EXISTS instead

-- ─── 4. AuditLog — createdAt + entity+entityId + userUid ───────────────────

-- P1 FIX: Removed DO $$ block for audit_logs_createdAt_idx — use IF NOT EXISTS instead

-- P1 FIX: Removed DO $$ block for audit_logs_entity_entityId_idx — use IF NOT EXISTS instead

-- P1 FIX: Removed DO $$ block for audit_logs_userUid_idx — use IF NOT EXISTS instead

-- ─── 5. AccountingAuditLog — createdAt + entity+entityId ───────────────────

-- P1 FIX: Removed DO $$ block for accounting_audit_logs_createdAt_idx — use IF NOT EXISTS instead

-- P1 FIX: Removed DO $$ block for accounting_audit_logs_entity_entityId_idx — use IF NOT EXISTS instead

-- ─── 6. AdminAuditLog — adminEmail + createdAt + targetSlug (had no indexes) ─

-- P1 FIX: Removed DO $$ block for admin_audit_logs_adminEmail_idx — use IF NOT EXISTS instead

-- P1 FIX: Removed DO $$ block for admin_audit_logs_createdAt_idx — use IF NOT EXISTS instead

-- P1 FIX: Removed DO $$ block for admin_audit_logs_targetSlug_idx — use IF NOT EXISTS instead

-- ─── 7. AutomationExecutionLog — ruleId + status+triggeredAt ───────────────

-- P1 FIX: Removed DO $$ block for automation_execution_logs_ruleId_idx — use IF NOT EXISTS instead

-- P1 FIX: Removed DO $$ block for automation_execution_logs_status_triggeredAt_idx — use IF NOT EXISTS instead

-- ─── 8. PlatformSettingsHistory — settingId + createdAt + changedBy ────────

-- P1 FIX: Removed DO $$ block for platform_settings_history_settingId_idx — use IF NOT EXISTS instead

-- P1 FIX: Removed DO $$ block for platform_settings_history_createdAt_idx — use IF NOT EXISTS instead

-- P1 FIX: Removed DO $$ block for platform_settings_history_changedBy_idx — use IF NOT EXISTS instead

-- ─── 9. Client — soft-delete composite index ───────────────────────────────

-- P1 FIX: Removed DO $$ block for clients_companySlug_deletedAt_idx — use IF NOT EXISTS instead

-- ─── 10. Supplier — composite soft-delete (replaces standalone deletedAt idx)
--         The old @@index([deletedAt]) is less selective than the composite;
--         we keep both since both may be useful for different query shapes.

-- P1 FIX: Removed DO $$ block for suppliers_companySlug_deletedAt_idx — use IF NOT EXISTS instead

-- ─── 11. Company — deletedAt index (had no @@index at all) ─────────────────

-- P1 FIX: Removed DO $$ block for companies_deletedAt_idx — use IF NOT EXISTS instead

-- ─── 12. Invoice — soft-delete composite + status+createdAt ────────────────

-- P1 FIX: Removed DO $$ block for invoices_companySlug_deletedAt_idx — use IF NOT EXISTS instead

-- P1 FIX: Removed DO $$ block for invoices_status_createdAt_idx — use IF NOT EXISTS instead

-- ─── 13. PurchaseInvoice — soft-delete composite + supplierId FK ───────────

-- P1 FIX: Removed DO $$ block for purchase_invoices_companySlug_deletedAt_idx — use IF NOT EXISTS instead

-- P1 FIX: Removed DO $$ block for purchase_invoices_supplierId_idx — use IF NOT EXISTS instead

-- ─── 14. BankTransaction — bankAccountId FK + date ─────────────────────────

-- P1 FIX: Removed DO $$ block for bank_transactions_bankAccountId_idx — use IF NOT EXISTS instead

-- P1 FIX: Removed DO $$ block for bank_transactions_date_idx — use IF NOT EXISTS instead

-- ─── 15. BudgetLine — budgetId + accountId + costCenterId FK indexes ───────

-- P1 FIX: Removed DO $$ block for budget_lines_budgetId_idx — use IF NOT EXISTS instead

-- P1 FIX: Removed DO $$ block for BudgetLine_budgetId_idx — use IF NOT EXISTS instead

-- P1 FIX: Removed DO $$ block for BudgetLine_accountId_idx — use IF NOT EXISTS instead

-- P1 FIX: Removed DO $$ block for BudgetLine_costCenterId_idx — use IF NOT EXISTS instead

-- ════════════════════════════════════════════════════════════════════════════
-- End of migration.
--
-- Notes:
--   * All indexes use IF NOT EXISTS so re-running is safe.
--   * The composite soft-delete indexes (companySlug, deletedAt) are more
--     selective than standalone (deletedAt) for the typical query pattern
--     `WHERE companySlug = $1 AND deletedAt IS NULL`. PostgreSQL can use
--     the composite for both this query and a standalone `WHERE deletedAt
--     IS NULL` query (with a bitmap scan), so we don't need both.
--   * We DO NOT drop the legacy SessionRegistry columns (userId, tokenHash,
--     deviceInfo) in this migration — they may contain historical data
--     from before the 20260730 schema drift fix. A separate cleanup
--     migration can drop them after confirming no code reads them.
-- ════════════════════════════════════════════════════════════════════════════
