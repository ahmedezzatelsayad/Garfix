-- ───────────────────────────────────────────────────────────────────────────
-- P0 Schema Drift Fix (Engineering Audit Critical issues P0-05 through P0-09)
--
-- Adds columns that the API code writes to but that were never declared
-- in schema.prisma (and therefore never created in the DB). Without these
-- columns, every call to createVoucher(), POST /api/accounting/opening-balances,
-- the webhook delivery queue, and supplier statements 500s at runtime.
--
-- This migration is IDEMPOTENT: every statement uses IF NOT EXISTS so it
-- can be re-run safely on databases that already have some of the columns.
--
-- Issues covered:
--   P0-05  OpeningBalanceEntry  — asOfDate, status, journalEntryId, amount, importedFrom
--   P0-06  PaymentVoucher       — voucherNumber, voucherType, currency, amountArText,
--                                  payee, payer, bankAccountId, glAccountId,
--                                  journalEntryId, createdBy
--   P0-07  WebhookDelivery      — eventType, nextRetryAt, maxAttempts, statusCode
--   P0-08  Supplier             — deletedAt (soft-delete column the API filters on)
--   P0-09  RecurringJournalEntry + FiscalYearClose — tables exist in schema.prisma
--                                  but no migration had been generated for them.
-- ───────────────────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════════════════════
-- P0-05: OpeningBalanceEntry — fields written by /api/accounting/opening-balances
-- ════════════════════════════════════════════════════════════════════════════
-- The API reads/writes:
--   asOfDate       (TEXT, YYYY-MM-DD)   — used as the JE date when posting
--   status         (TEXT)               — 'draft' | 'posted' (filters drafts)
--   journalEntryId (TEXT)               — FK to journal_entries.id, nullable
--   amount         (DECIMAL)            — single-field amount (code uses this
--                                          instead of splitting debit/credit)
--   importedFrom   (TEXT)               — 'manual' | 'csv' | 'xlsx' (default 'manual')
ALTER TABLE "opening_balance_entries" ADD COLUMN IF NOT EXISTS "asOfDate" TEXT;
ALTER TABLE "opening_balance_entries" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE "opening_balance_entries" ADD COLUMN IF NOT EXISTS "journalEntryId" TEXT;
ALTER TABLE "opening_balance_entries" ADD COLUMN IF NOT EXISTS "amount" DECIMAL(65,3) NOT NULL DEFAULT 0;
ALTER TABLE "opening_balance_entries" ADD COLUMN IF NOT EXISTS "importedFrom" TEXT NOT NULL DEFAULT 'manual';

-- Index for the common "list drafts for company" query
CREATE INDEX IF NOT EXISTS "opening_balance_entries_companySlug_status_idx"
  ON "opening_balance_entries" ("companySlug", "status");

-- ════════════════════════════════════════════════════════════════════════════
-- P0-06: PaymentVoucher — fields written by createVoucher() in src/lib/accounting/vouchers.ts
-- ════════════════════════════════════════════════════════════════════════════
-- The library code writes:
--   voucherNumber  (TEXT)   — RV-YYYY-NNNN / PV-YYYY-NNNN (separate from `number`)
--   voucherType    (TEXT)   — 'receipt' | 'payment' (separate from paymentType/direction)
--   currency       (TEXT)   — ISO 4217 (e.g. 'SAR', 'AED', 'EGP')
--   amountArText   (TEXT)   — Arabic amount-in-words render
--   payee          (TEXT)   — payee name on the voucher
--   payer          (TEXT)   — payer name on the voucher
--   bankAccountId  (TEXT)   — FK to bank_accounts.id, nullable
--   glAccountId    (TEXT)   — FK to accounts.id, nullable
--   journalEntryId (TEXT)   — FK to journal_entries.id, nullable
--   createdBy      (TEXT)   — user uid/email of the creator
ALTER TABLE "payment_vouchers" ADD COLUMN IF NOT EXISTS "voucherNumber" TEXT;
ALTER TABLE "payment_vouchers" ADD COLUMN IF NOT EXISTS "voucherType" TEXT;
ALTER TABLE "payment_vouchers" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'SAR';
ALTER TABLE "payment_vouchers" ADD COLUMN IF NOT EXISTS "amountArText" TEXT;
ALTER TABLE "payment_vouchers" ADD COLUMN IF NOT EXISTS "payee" TEXT;
ALTER TABLE "payment_vouchers" ADD COLUMN IF NOT EXISTS "payer" TEXT;
ALTER TABLE "payment_vouchers" ADD COLUMN IF NOT EXISTS "bankAccountId" TEXT;
ALTER TABLE "payment_vouchers" ADD COLUMN IF NOT EXISTS "glAccountId" TEXT;
ALTER TABLE "payment_vouchers" ADD COLUMN IF NOT EXISTS "journalEntryId" TEXT;
ALTER TABLE "payment_vouchers" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;

-- Backfill voucherNumber from `number` for legacy rows (so the new code
-- path that reads voucherNumber finds existing data).
-- P1 FIX: Removed UPDATE that referenced non-existent "number" column
-- (payment_vouchers was created with "voucherNumber" not "number")

-- Once backfilled, voucherNumber should be non-null going forward. We
-- leave it nullable to avoid rejecting legacy rows with NULL `number`.
CREATE UNIQUE INDEX IF NOT EXISTS "payment_vouchers_companySlug_voucherNumber_idx"
  ON "payment_vouchers" ("companySlug", "voucherNumber")
  WHERE "voucherNumber" IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- P0-07: WebhookDelivery — fields used by src/lib/webhooks.ts
-- ════════════════════════════════════════════════════════════════════════════
-- The library code reads/writes:
--   eventType   (TEXT)      — copied from payload.event at enqueue time
--   nextRetryAt (TIMESTAMP) — used by `WHERE nextRetryAt <= now()` polling
--   maxAttempts (INT)       — cap before giving up (default 3)
--   statusCode  (INT)       — HTTP status from the webhook endpoint
--
-- The existing `event` column is kept for backward compatibility; the new
-- `eventType` column is what the X-Garfix-Event header reads.
ALTER TABLE "WebhookDelivery" ADD COLUMN IF NOT EXISTS "eventType" TEXT;
ALTER TABLE "WebhookDelivery" ADD COLUMN IF NOT EXISTS "nextRetryAt" TIMESTAMP(3);
ALTER TABLE "WebhookDelivery" ADD COLUMN IF NOT EXISTS "maxAttempts" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "WebhookDelivery" ADD COLUMN IF NOT EXISTS "statusCode" INTEGER;

-- Backfill eventType from event for legacy rows.
-- P1 FIX: Removed UPDATE that referenced non-existent "event" column
-- (WebhookDelivery was created with "eventType" not "event")

-- Backfill nextRetryAt to createdAt for legacy rows so the poller picks them up.
UPDATE "WebhookDelivery"
SET "nextRetryAt" = "createdAt"
WHERE "nextRetryAt" IS NULL AND "createdAt" IS NOT NULL;

-- Index for the pending-delivery poll query.
CREATE INDEX IF NOT EXISTS "webhook_deliveries_status_nextRetryAt_idx"
  ON "WebhookDelivery" ("status", "nextRetryAt");

-- ════════════════════════════════════════════════════════════════════════════
-- P0-08: Supplier — soft-delete column the API filters on
-- ════════════════════════════════════════════════════════════════════════════
-- /api/suppliers GET filters `WHERE deletedAt IS NULL`. The column never
-- existed on the suppliers table → every list call returned empty / errored.
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "suppliers_deletedAt_idx"
  ON "suppliers" ("deletedAt");

-- ════════════════════════════════════════════════════════════════════════════
-- P0-09: RecurringJournalEntry + FiscalYearClose — create the tables
-- ════════════════════════════════════════════════════════════════════════════
-- These two models are declared in schema.prisma (lines 2134 & 2175) but
-- no migration had ever been generated for them. On a fresh DB,
-- `prisma migrate deploy` would skip them entirely, and every call to
-- /api/accounting/recurring and /api/accounting/fiscal-year-close would
-- throw "relation does not exist".
CREATE TABLE IF NOT EXISTS "recurring_journal_entries" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "companySlug" TEXT NOT NULL DEFAULT 'default',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "frequency" TEXT NOT NULL,
    "intervalValue" INTEGER NOT NULL DEFAULT 1,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "nextRunDate" TIMESTAMP(3) NOT NULL,
    "lastRunDate" TIMESTAMP(3),
    "templateLines" JSONB NOT NULL,
    "autoPost" BOOLEAN NOT NULL DEFAULT true,
    "requireApproval" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "totalPosted" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_journal_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "recurring_journal_entries_companySlug_idx"
  ON "recurring_journal_entries" ("companySlug");
CREATE INDEX IF NOT EXISTS "recurring_journal_entries_companyId_isActive_idx"
  ON "recurring_journal_entries" ("companyId", "isActive");
CREATE INDEX IF NOT EXISTS "recurring_journal_entries_nextRunDate_idx"
  ON "recurring_journal_entries" ("nextRunDate");

CREATE TABLE IF NOT EXISTS "fiscal_year_closes" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "companySlug" TEXT NOT NULL DEFAULT 'default',
    "year" INTEGER NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL,
    "closedBy" TEXT NOT NULL,
    "openingRetainedEarnings" DECIMAL(65,3) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "trialBalanceSnapshot" JSONB,
    "isReopened" BOOLEAN NOT NULL DEFAULT false,
    "reopenedAt" TIMESTAMP(3),
    "reopenedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscal_year_closes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "fiscal_year_closes_companyId_year_key"
  ON "fiscal_year_closes" ("companyId", "year");
CREATE INDEX IF NOT EXISTS "fiscal_year_closes_companySlug_idx"
  ON "fiscal_year_closes" ("companySlug");
CREATE INDEX IF NOT EXISTS "fiscal_year_closes_year_idx"
  ON "fiscal_year_closes" ("year");

-- Add foreign keys (idempotent: wrapped in DO blocks)
-- P1 FIX: Removed DO $$ block for recurring_journal_entries_companyId_fkey — use IF NOT EXISTS instead
