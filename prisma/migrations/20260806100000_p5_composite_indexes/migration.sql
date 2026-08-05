-- P5: Add composite indexes for tenant+time-range queries on high-traffic models.
-- These indexes backfill the (companySlug, createdAt/date) access pattern that
-- list endpoints use for ordering + filtering. Without them, Postgres was doing
-- an index intersection or picking the more selective single-column index.

-- 1. Invoice: list endpoint orders by createdAt desc, filters by companySlug
CREATE INDEX IF NOT EXISTS "invoices_companySlug_createdAt_idx"
  ON "invoices" ("companySlug", "createdAt");

-- 2. JournalEntry: list endpoint orders by date desc, filters by companySlug
CREATE INDEX IF NOT EXISTS "journal_entries_companySlug_date_idx"
  ON "journal_entries" ("companySlug", "date");

-- 3. BankTransaction: reconciliation + bank-import filter by date range
CREATE INDEX IF NOT EXISTS "bank_transactions_companySlug_date_idx"
  ON "bank_transactions" ("companySlug", "date");

-- 4. AuditLog: audit list orders by createdAt desc, filters by companySlug
CREATE INDEX IF NOT EXISTS "audit_logs_companySlug_createdAt_idx"
  ON "audit_logs" ("companySlug", "createdAt");

-- 5. PaymentTransaction: payments list orders by createdAt desc, filters by companySlug
CREATE INDEX IF NOT EXISTS "payment_transactions_companySlug_createdAt_idx"
  ON "payment_transactions" ("companySlug", "createdAt");
