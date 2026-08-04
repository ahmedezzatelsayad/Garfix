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

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'SessionRegistry_userUid_idx'
  ) THEN
    CREATE INDEX "SessionRegistry_userUid_idx" ON "SessionRegistry"("userUid");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'SessionRegistry_expiresAt_idx'
  ) THEN
    CREATE INDEX "SessionRegistry_expiresAt_idx" ON "SessionRegistry"("expiresAt");
  END IF;
END $$;

-- ─── 2. JournalEntryLine — FK indexes on journalEntryId + accountId ────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'journal_entry_lines_journalEntryId_idx'
  ) THEN
    CREATE INDEX "journal_entry_lines_journalEntryId_idx" ON "journal_entry_lines"("journalEntryId");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'journal_entry_lines_accountId_idx'
  ) THEN
    CREATE INDEX "journal_entry_lines_accountId_idx" ON "journal_entry_lines"("accountId");
  END IF;
END $$;

-- ─── 3. JournalEntry — soft-delete composite + date indexes ────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'journal_entries_companySlug_deletedAt_idx'
  ) THEN
    CREATE INDEX "journal_entries_companySlug_deletedAt_idx" ON "journal_entries"("companySlug", "deletedAt");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'journal_entries_date_idx'
  ) THEN
    CREATE INDEX "journal_entries_date_idx" ON "journal_entries"("date");
  END IF;
END $$;

-- ─── 4. AuditLog — createdAt + entity+entityId + userUid ───────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'audit_logs_createdAt_idx'
  ) THEN
    CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'audit_logs_entity_entityId_idx'
  ) THEN
    CREATE INDEX "audit_logs_entity_entityId_idx" ON "audit_logs"("entity", "entityId");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'audit_logs_userUid_idx'
  ) THEN
    CREATE INDEX "audit_logs_userUid_idx" ON "audit_logs"("userUid");
  END IF;
END $$;

-- ─── 5. AccountingAuditLog — createdAt + entity+entityId ───────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'accounting_audit_logs_createdAt_idx'
  ) THEN
    CREATE INDEX "accounting_audit_logs_createdAt_idx" ON "accounting_audit_logs"("createdAt");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'accounting_audit_logs_entity_entityId_idx'
  ) THEN
    CREATE INDEX "accounting_audit_logs_entity_entityId_idx" ON "accounting_audit_logs"("entity", "entityId");
  END IF;
END $$;

-- ─── 6. AdminAuditLog — adminEmail + createdAt + targetSlug (had no indexes) ─

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'admin_audit_logs_adminEmail_idx'
  ) THEN
    CREATE INDEX "admin_audit_logs_adminEmail_idx" ON "admin_audit_logs"("adminEmail");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'admin_audit_logs_createdAt_idx'
  ) THEN
    CREATE INDEX "admin_audit_logs_createdAt_idx" ON "admin_audit_logs"("createdAt");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'admin_audit_logs_targetSlug_idx'
  ) THEN
    CREATE INDEX "admin_audit_logs_targetSlug_idx" ON "admin_audit_logs"("targetSlug");
  END IF;
END $$;

-- ─── 7. AutomationExecutionLog — ruleId + status+triggeredAt ───────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'automation_execution_logs_ruleId_idx'
  ) THEN
    CREATE INDEX "automation_execution_logs_ruleId_idx" ON "automation_execution_logs"("ruleId");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'automation_execution_logs_status_triggeredAt_idx'
  ) THEN
    CREATE INDEX "automation_execution_logs_status_triggeredAt_idx" ON "automation_execution_logs"("status", "triggeredAt");
  END IF;
END $$;

-- ─── 8. PlatformSettingsHistory — settingId + createdAt + changedBy ────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'platform_settings_history_settingId_idx'
  ) THEN
    CREATE INDEX "platform_settings_history_settingId_idx" ON "platform_settings_history"("settingId");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'platform_settings_history_createdAt_idx'
  ) THEN
    CREATE INDEX "platform_settings_history_createdAt_idx" ON "platform_settings_history"("createdAt");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'platform_settings_history_changedBy_idx'
  ) THEN
    CREATE INDEX "platform_settings_history_changedBy_idx" ON "platform_settings_history"("changedBy");
  END IF;
END $$;

-- ─── 9. Client — soft-delete composite index ───────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'clients_companySlug_deletedAt_idx'
  ) THEN
    CREATE INDEX "clients_companySlug_deletedAt_idx" ON "clients"("companySlug", "deletedAt");
  END IF;
END $$;

-- ─── 10. Supplier — composite soft-delete (replaces standalone deletedAt idx)
--         The old @@index([deletedAt]) is less selective than the composite;
--         we keep both since both may be useful for different query shapes.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'suppliers_companySlug_deletedAt_idx'
  ) THEN
    CREATE INDEX "suppliers_companySlug_deletedAt_idx" ON "suppliers"("companySlug", "deletedAt");
  END IF;
END $$;

-- ─── 11. Company — deletedAt index (had no @@index at all) ─────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'companies_deletedAt_idx'
  ) THEN
    CREATE INDEX "companies_deletedAt_idx" ON "companies"("deletedAt");
  END IF;
END $$;

-- ─── 12. Invoice — soft-delete composite + status+createdAt ────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'invoices_companySlug_deletedAt_idx'
  ) THEN
    CREATE INDEX "invoices_companySlug_deletedAt_idx" ON "invoices"("companySlug", "deletedAt");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'invoices_status_createdAt_idx'
  ) THEN
    CREATE INDEX "invoices_status_createdAt_idx" ON "invoices"("status", "createdAt");
  END IF;
END $$;

-- ─── 13. PurchaseInvoice — soft-delete composite + supplierId FK ───────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'purchase_invoices_companySlug_deletedAt_idx'
  ) THEN
    CREATE INDEX "purchase_invoices_companySlug_deletedAt_idx" ON "purchase_invoices"("companySlug", "deletedAt");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'purchase_invoices_supplierId_idx'
  ) THEN
    CREATE INDEX "purchase_invoices_supplierId_idx" ON "purchase_invoices"("supplierId");
  END IF;
END $$;

-- ─── 14. BankTransaction — bankAccountId FK + date ─────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'bank_transactions_bankAccountId_idx'
  ) THEN
    CREATE INDEX "bank_transactions_bankAccountId_idx" ON "bank_transactions"("bankAccountId");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'bank_transactions_date_idx'
  ) THEN
    CREATE INDEX "bank_transactions_date_idx" ON "bank_transactions"("date");
  END IF;
END $$;

-- ─── 15. BudgetLine — budgetId + accountId + costCenterId FK indexes ───────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'budget_lines_budgetId_idx'
  ) THEN
    -- Prisma maps BudgetLine to "BudgetLine" by default — check both names
    CREATE INDEX IF NOT EXISTS "BudgetLine_budgetId_idx" ON "BudgetLine"("budgetId");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'BudgetLine_budgetId_idx'
  ) THEN
    CREATE INDEX IF NOT EXISTS "BudgetLine_budgetId_idx" ON "BudgetLine"("budgetId");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'BudgetLine_accountId_idx'
  ) THEN
    CREATE INDEX IF NOT EXISTS "BudgetLine_accountId_idx" ON "BudgetLine"("accountId");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'BudgetLine_costCenterId_idx'
  ) THEN
    CREATE INDEX IF NOT EXISTS "BudgetLine_costCenterId_idx" ON "BudgetLine"("costCenterId");
  END IF;
END $$;

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
