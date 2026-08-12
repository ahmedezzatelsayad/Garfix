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

CREATE INDEX IF NOT EXISTS "SessionRegistry_userUid_idx" ON "SessionRegistry"("userUid");

CREATE INDEX IF NOT EXISTS "SessionRegistry_expiresAt_idx" ON "SessionRegistry"("expiresAt");

-- ─── 2. JournalEntryLine — FK indexes on journalEntryId + accountId ────────

CREATE INDEX IF NOT EXISTS "journal_entry_lines_journalEntryId_idx" ON "journal_entry_lines"("journalEntryId");

CREATE INDEX IF NOT EXISTS "journal_entry_lines_accountId_idx" ON "journal_entry_lines"("accountId");

-- ─── 3. JournalEntry — soft-delete composite + date indexes ────────────────

CREATE INDEX IF NOT EXISTS "journal_entries_companySlug_deletedAt_idx" ON "journal_entries"("companySlug", "deletedAt");

CREATE INDEX IF NOT EXISTS "journal_entries_date_idx" ON "journal_entries"("date");

-- ─── 4. AuditLog — createdAt + entity+entityId + userUid ───────────────────

CREATE INDEX IF NOT EXISTS "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

CREATE INDEX IF NOT EXISTS "audit_logs_entity_entityId_idx" ON "audit_logs"("entity", "entityId");

CREATE INDEX IF NOT EXISTS "audit_logs_userUid_idx" ON "audit_logs"("userUid");

-- ─── 5. AccountingAuditLog — createdAt + entity+entityId ───────────────────

CREATE INDEX IF NOT EXISTS "accounting_audit_logs_createdAt_idx" ON "accounting_audit_logs"("createdAt");

CREATE INDEX IF NOT EXISTS "accounting_audit_logs_entity_entityId_idx" ON "accounting_audit_logs"("entity", "entityId");

-- ─── 6. AdminAuditLog — adminEmail + createdAt + targetSlug (had no indexes) ─

CREATE INDEX IF NOT EXISTS "admin_audit_logs_adminEmail_idx" ON "admin_audit_logs"("adminEmail");

CREATE INDEX IF NOT EXISTS "admin_audit_logs_createdAt_idx" ON "admin_audit_logs"("createdAt");

CREATE INDEX IF NOT EXISTS "admin_audit_logs_targetSlug_idx" ON "admin_audit_logs"("targetSlug");

-- ─── 7. AutomationExecutionLog — ruleId + status+triggeredAt ───────────────

CREATE INDEX IF NOT EXISTS "automation_execution_logs_ruleId_idx" ON "automation_execution_logs"("ruleId");

CREATE INDEX IF NOT EXISTS "automation_execution_logs_status_triggeredAt_idx" ON "automation_execution_logs"("status", "triggeredAt");

-- ─── 8. PlatformSettingsHistory — settingId + createdAt + changedBy ────────

CREATE INDEX IF NOT EXISTS "platform_settings_history_settingId_idx" ON "platform_settings_history"("settingId");

CREATE INDEX IF NOT EXISTS "platform_settings_history_createdAt_idx" ON "platform_settings_history"("createdAt");

CREATE INDEX IF NOT EXISTS "platform_settings_history_changedBy_idx" ON "platform_settings_history"("changedBy");

-- ─── 9. Client — soft-delete composite index ───────────────────────────────

CREATE INDEX IF NOT EXISTS "clients_companySlug_deletedAt_idx" ON "clients"("companySlug", "deletedAt");

-- ─── 10. Supplier — composite soft-delete (replaces standalone deletedAt idx)
--         The old @@index([deletedAt]) is less selective than the composite;
--         we keep both since both may be useful for different query shapes.

CREATE INDEX IF NOT EXISTS "suppliers_companySlug_deletedAt_idx" ON "suppliers"("companySlug", "deletedAt");

-- ─── 11. Company — deletedAt index (had no @@index at all) ─────────────────

CREATE INDEX IF NOT EXISTS "companies_deletedAt_idx" ON "companies"("deletedAt");

-- ─── 12. Invoice — soft-delete composite + status+createdAt ────────────────

CREATE INDEX IF NOT EXISTS "invoices_companySlug_deletedAt_idx" ON "invoices"("companySlug_deletedAt");

CREATE INDEX IF NOT EXISTS "invoices_status_createdAt_idx" ON "invoices"("status", "createdAt");

-- ─── 13. PurchaseInvoice — soft-delete composite + supplierId FK ───────────

CREATE INDEX IF NOT EXISTS "purchase_invoices_companySlug_deletedAt_idx" ON "purchase_invoices"("companySlug", "deletedAt");

CREATE INDEX IF NOT EXISTS "purchase_invoices_supplierId_idx" ON "purchase_invoices"("supplierId");

-- ─── 14. BankTransaction — bankAccountId FK + date ─────────────────────────

CREATE INDEX IF NOT EXISTS "bank_transactions_bankAccountId_idx" ON "bank_transactions"("bankAccountId");

CREATE INDEX IF NOT EXISTS "bank_transactions_date_idx" ON "bank_transactions"("date");

-- ─── 15. BudgetLine — budgetId + accountId + costCenterId FK indexes ───────

CREATE INDEX IF NOT EXISTS "budget_lines_budgetId_idx" ON "budget"("lines_budgetId");

CREATE INDEX IF NOT EXISTS "BudgetLine_budgetId_idx" ON "BudgetLine"("budgetId");

CREATE INDEX IF NOT EXISTS "BudgetLine_accountId_idx" ON "BudgetLine"("accountId");

CREATE INDEX IF NOT EXISTS "BudgetLine_costCenterId_idx" ON "BudgetLine"("costCenterId");

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
