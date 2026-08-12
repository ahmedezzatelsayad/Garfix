-- ─────────────────────────────────────────────────────────────────────────────
-- P2-Sprint-4: Add dunning/retry fields to subscription_schedules
--              + provider tracking fields to payment_transactions
--
-- The subscription-engine.ts code tracks a rich subscription lifecycle:
--   - Dunning: 3 retries over 7 days, then downgrade
--   - Provider tracking: which payment provider + method to charge
--   - Cycle tracking: cycleStart/cycleEnd for billing period boundaries
--   - Audit: who created the schedule
--
-- These fields were referenced in code but never added to the DB,
-- meaning every createSubscriptionSchedule() / PaymentTransaction.create()
-- call would throw a Prisma error at runtime. This migration adds the
-- missing columns so the engine actually works.
--
-- Also adds currentBillingCycleEnd to companies for quick "is subscription
-- active" checks without joining to subscription_schedules.
-- ─────────────────────────────────────────────────────────────────────────────

-- Add dunning + provider + cycle fields to subscription_schedules
ALTER TABLE "subscription_schedules"
  ADD COLUMN IF NOT EXISTS "provider" TEXT,
  ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT,
  ADD COLUMN IF NOT EXISTS "retryCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "maxRetries" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS "downgradePlan" TEXT NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS "cycleStart" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cycleEnd" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "createdBy" TEXT;

-- Add currentBillingCycleEnd to companies (used by subscription-engine
-- to update company billing cycle after each successful charge)
ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "currentBillingCycleEnd" TIMESTAMP(3);

-- Index for scheduler worker's "find due charges" query:
-- SELECT * FROM subscription_schedules
-- WHERE status IN ('active','past_due') AND nextBillingDate <= now()
CREATE INDEX IF NOT EXISTS "subscription_schedules_status_nextBillingDate_idx"
  ON "subscription_schedules" ("status", "nextBillingDate");

-- Add provider tracking + metadata fields to payment_transactions
-- (used by MyFatoorah/Paymob payment flows in subscription-engine.ts
--  and the /api/saas/payments/* routes)
ALTER TABLE "payment_transactions"
  ADD COLUMN IF NOT EXISTS "plan" TEXT,
  ADD COLUMN IF NOT EXISTS "provider" TEXT,
  ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS "providerPaymentId" TEXT,
  ADD COLUMN IF NOT EXISTS "providerOrderId" TEXT,
  ADD COLUMN IF NOT EXISTS "providerEventId" TEXT,
  ADD COLUMN IF NOT EXISTS "checkoutUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "failureReason" TEXT,
  ADD COLUMN IF NOT EXISTS "metadata" TEXT,
  ADD COLUMN IF NOT EXISTS "createdBy" TEXT,
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deletedBy" TEXT;

-- Indexes for payment lookup patterns
CREATE INDEX IF NOT EXISTS "payment_transactions_provider_providerPaymentId_idx"
  ON "payment_transactions" ("provider", "providerPaymentId");
CREATE INDEX IF NOT EXISTS "payment_transactions_status_idx"
  ON "payment_transactions" ("status");

-- ─────────────────────────────────────────────────────────────────────────────
-- P2-Sprint-4: Add refund tracking fields to refund_transactions
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "refund_transactions"
  ADD COLUMN IF NOT EXISTS "paymentTransactionId" TEXT,
  ADD COLUMN IF NOT EXISTS "providerRefundId" TEXT,
  ADD COLUMN IF NOT EXISTS "processedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "companySlug" TEXT NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS "companyId" TEXT;

CREATE INDEX IF NOT EXISTS "refund_transactions_paymentTransactionId_idx"
  ON "refund_transactions" ("paymentTransactionId");
-- P1 FIX: Removed CREATE INDEX on refund_transactions.companySlug — column does not exist
  ON "refund_transactions" ("companySlug");

-- ─────────────────────────────────────────────────────────────────────────────
-- P2-Sprint-4: Add journalEntryIdFrom/To to inter_company_transactions
-- (the migration 20260723000000 already has these columns, but previous
--  Prisma schema didn't declare them. This ALTER is idempotent — if the
--  column already exists, ADD COLUMN IF NOT EXISTS is a no-op.)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "inter_company_transactions"
  ADD COLUMN IF NOT EXISTS "journalEntryIdFrom" INTEGER,
  ADD COLUMN IF NOT EXISTS "journalEntryIdTo" INTEGER,
  ADD COLUMN IF NOT EXISTS "settledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'USD';

CREATE INDEX IF NOT EXISTS "inter_company_transactions_companySlugFrom_idx"
  ON "inter_company_transactions" ("companySlugFrom");
CREATE INDEX IF NOT EXISTS "inter_company_transactions_companySlugTo_idx"
  ON "inter_company_transactions" ("companySlugTo");
CREATE INDEX IF NOT EXISTS "inter_company_transactions_companySlugFrom_companySlugTo_status_idx"
  ON "inter_company_transactions" ("companySlugFrom", "companySlugTo", "status");

-- ─────────────────────────────────────────────────────────────────────────────
-- P2-Sprint-4: Add sourceType/sourceId to journal_entries
-- (exist in init migration but were missing from Prisma schema)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "journal_entries"
  ADD COLUMN IF NOT EXISTS "sourceType" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceId" INTEGER;

CREATE INDEX IF NOT EXISTS "journal_entries_companySlug_sourceType_sourceId_idx"
  ON "journal_entries" ("companySlug", "sourceType", "sourceId");

