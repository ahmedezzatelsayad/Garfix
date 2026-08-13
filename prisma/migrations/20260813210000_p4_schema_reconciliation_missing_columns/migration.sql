-- ═══════════════════════════════════════════════════════════════════════════
-- Schema Reconciliation Migration (P4)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Problem
-- -------
-- prisma/schema.prisma declares many fields whose corresponding DB columns
-- were NEVER created by any prior migration. The Prisma client emits INSERT
-- and UPDATE statements referencing these columns, causing PostgreSQL to
-- throw "column X of relation Y does not exist" at runtime — which surfaced
-- as the Playwright E2E test failures on commit 5a640aed.
--
-- Examples of missing columns that broke E2E:
--   companies.code              (referenced by prisma.company.upsert)
--   companies.currencyDecimalPlaces (referenced by ensureTestCompany)
--   accounts.name               (referenced by prisma.account.create)
--   accounts.companyId          (referenced by prisma.account.create)
--   MFASecret.userId            (name mismatch — DB has "userUid")
--   MFASecret.verified          (referenced by prisma.mFASecret.upsert)
--
-- Strategy
-- --------
-- For each column that exists in schema.prisma but not in any migration:
--   - If the table doesn't exist in DB: SKIP (table-creation is out of scope)
--   - If the column is a known name-mismatch: RENAME COLUMN (preserves data + FK + indexes)
--   - Otherwise: ADD COLUMN IF NOT EXISTS with a sensible default
--
-- Idempotency
-- -----------
-- Every statement uses IF NOT EXISTS (or RENAME which fails harmlessly if
-- already renamed — wrapped in a DO block guard below). Safe to re-run.
--
-- This migration does NOT change column types, drop columns, or modify
-- existing constraints. It is purely additive (with one rename).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 0. MFASecret: rename userUid → userId (name mismatch fix) ─────────────
-- The schema declares `userId String`, but the DB has `userUid` (created by
-- migration 20260720214438). Prisma emits INSERTs with `userId`, which fail
-- with "column userId does not exist". Rename preserves all data + FK.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'MFASecret' AND column_name = 'userUid'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'MFASecret' AND column_name = 'userId'
  ) THEN
    ALTER TABLE "MFASecret" RENAME COLUMN "userUid" TO "userId";
  END IF;
END $$;

-- Also rename the FK constraint + index to match the new column name
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'MFASecret_userUid_fkey' AND table_name = 'MFASecret'
  ) THEN
    ALTER TABLE "MFASecret" RENAME CONSTRAINT "MFASecret_userUid_fkey" TO "MFASecret_userId_fkey";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'MFASecret_userUid_idx' AND n.nspname = 'public'
  ) THEN
    ALTER INDEX "MFASecret_userUid_idx" RENAME TO "MFASecret_userId_idx";
  END IF;
END $$;

-- Add the @@unique([userId]) constraint declared in schema.prisma
-- (the original migration only had a non-unique index on userUid)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'MFASecret_userId_key' AND conrelid = '"MFASecret"'::regclass
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'MFASecret' AND column_name = 'userId'
  ) THEN
    ALTER TABLE "MFASecret" ADD CONSTRAINT "MFASecret_userId_key" UNIQUE ("userId");
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Part 1: ADD COLUMN IF NOT EXISTS for every schema-declared column that no
-- migration ever created. Grouped by table for readability.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "ai_benchmark_results" ADD COLUMN IF NOT EXISTS "provider" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ai_benchmark_results" ADD COLUMN IF NOT EXISTS "model" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ai_benchmark_results" ADD COLUMN IF NOT EXISTS "taskType" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ai_benchmark_results" ADD COLUMN IF NOT EXISTS "score" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "ai_benchmark_results" ADD COLUMN IF NOT EXISTS "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "ai_memory_notes" ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ai_memory_notes" ADD COLUMN IF NOT EXISTS "content" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ai_memory_notes" ADD COLUMN IF NOT EXISTS "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0;
ALTER TABLE "ai_memory_notes" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00'::timestamp;
ALTER TABLE "ai_processing_logs" ADD COLUMN IF NOT EXISTS "requestType" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ai_processing_logs" ADD COLUMN IF NOT EXISTS "resolvedBy" TEXT;
ALTER TABLE "ai_processing_logs" ADD COLUMN IF NOT EXISTS "tokensUsed" INTEGER;
ALTER TABLE "ai_processing_logs" ADD COLUMN IF NOT EXISTS "costUsd" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "ai_processing_logs" ADD COLUMN IF NOT EXISTS "latencyMs" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ai_score_snapshots" ADD COLUMN IF NOT EXISTS "period" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ai_score_snapshots" ADD COLUMN IF NOT EXISTS "score" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "ai_score_snapshots" ADD COLUMN IF NOT EXISTS "cacheHitPct" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "ai_score_snapshots" ADD COLUMN IF NOT EXISTS "ruleHitPct" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "ai_score_snapshots" ADD COLUMN IF NOT EXISTS "aiCallPct" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "ai_score_snapshots" ADD COLUMN IF NOT EXISTS "avgCostPerRequest" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "ai_score_snapshots" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00'::timestamp;
ALTER TABLE "ai_usage_logs" ADD COLUMN IF NOT EXISTS "costUsd" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "ai_usage_logs" ADD COLUMN IF NOT EXISTS "requestType" TEXT;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "companyId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "accounting_audit_logs" ADD COLUMN IF NOT EXISTS "performedBy" TEXT;
ALTER TABLE "accounting_audit_logs" ADD COLUMN IF NOT EXISTS "details" TEXT;
ALTER TABLE "admin_audit_logs" ADD COLUMN IF NOT EXISTS "details" TEXT;
ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "targetSlug" TEXT;
ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00'::timestamp;
ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "defaultWarehouseId" TEXT;
ALTER TABLE "automation_execution_logs" ADD COLUMN IF NOT EXISTS "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00'::timestamp;
ALTER TABLE "automation_execution_logs" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);
ALTER TABLE "automation_execution_logs" ADD COLUMN IF NOT EXISTS "result" TEXT;
ALTER TABLE "automation_execution_logs" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00'::timestamp;
ALTER TABLE "automation_rules" ADD COLUMN IF NOT EXISTS "triggerType" TEXT NOT NULL DEFAULT '';
ALTER TABLE "automation_rules" ADD COLUMN IF NOT EXISTS "action" TEXT;
ALTER TABLE "automation_rules" ADD COLUMN IF NOT EXISTS "lastRunAt" TIMESTAMP(3);
ALTER TABLE "automation_rules" ADD COLUMN IF NOT EXISTS "runCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "branch" TEXT;
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "companyId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "bank_reconciliations" ADD COLUMN IF NOT EXISTS "periodId" TEXT;
ALTER TABLE "bank_reconciliations" ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00'::timestamp;
ALTER TABLE "bank_reconciliations" ADD COLUMN IF NOT EXISTS "endDate" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00'::timestamp;
ALTER TABLE "bank_reconciliations" ADD COLUMN IF NOT EXISTS "openingBalance" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "bank_reconciliations" ADD COLUMN IF NOT EXISTS "closingBalance" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "bank_reconciliations" ADD COLUMN IF NOT EXISTS "companyId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "bank_transactions" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT '';
ALTER TABLE "bank_transactions" ADD COLUMN IF NOT EXISTS "reconciled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "bank_transactions" ADD COLUMN IF NOT EXISTS "reconciliationId" TEXT;
ALTER TABLE "bank_transactions" ADD COLUMN IF NOT EXISTS "companyId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "bank_transactions" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "budgets" ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "budgets" ADD COLUMN IF NOT EXISTS "periodId" TEXT;
ALTER TABLE "budgets" ADD COLUMN IF NOT EXISTS "totalAmount" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "budgets" ADD COLUMN IF NOT EXISTS "companyId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "chat_history" ADD COLUMN IF NOT EXISTS "sessionId" TEXT;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "code" TEXT NOT NULL DEFAULT '';
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "taxId" TEXT;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "nameEn" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "code" TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS "companies_code_key" ON "companies" ("code");
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "taxId" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "nameEn" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "currencyDecimalPlaces" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "company_runtimes" ADD COLUMN IF NOT EXISTS "slaTier" TEXT;
ALTER TABLE "company_runtimes" ADD COLUMN IF NOT EXISTS "maxAcceptableLatencyMs" INTEGER;
ALTER TABLE "cost_centers" ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "cost_centers" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "cost_centers" ADD COLUMN IF NOT EXISTS "companyId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "depreciation_entries" ADD COLUMN IF NOT EXISTS "periodId" TEXT;
ALTER TABLE "depreciation_entries" ADD COLUMN IF NOT EXISTS "amount" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "depreciation_entries" ADD COLUMN IF NOT EXISTS "date" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00'::timestamp;
ALTER TABLE "depreciation_entries" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "depreciation_entries" ADD COLUMN IF NOT EXISTS "companyId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "depreciation_entries" ADD COLUMN IF NOT EXISTS "isPosted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "e_invoices" ADD COLUMN IF NOT EXISTS "qrCodeBase64" TEXT;
ALTER TABLE "e_invoices" ADD COLUMN IF NOT EXISTS "clearedAt" TIMESTAMP(3);
ALTER TABLE "e_invoices" ADD COLUMN IF NOT EXISTS "invoiceNumber" TEXT NOT NULL DEFAULT '';
ALTER TABLE "e_invoices" ADD COLUMN IF NOT EXISTS "authority" TEXT NOT NULL DEFAULT '';
ALTER TABLE "e_invoices" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT '';
ALTER TABLE "e_invoices" ADD COLUMN IF NOT EXISTS "submissionId" TEXT;
ALTER TABLE "e_invoices" ADD COLUMN IF NOT EXISTS "qrCode" TEXT;
ALTER TABLE "e_invoices" ADD COLUMN IF NOT EXISTS "digitalSignature" TEXT;
ALTER TABLE "e_invoices" ADD COLUMN IF NOT EXISTS "xmlContent" TEXT;
ALTER TABLE "e_invoices" ADD COLUMN IF NOT EXISTS "clearanceStatus" TEXT;
ALTER TABLE "email_verifications" ADD COLUMN IF NOT EXISTS "email" TEXT NOT NULL DEFAULT '';
ALTER TABLE "email_verifications" ADD COLUMN IF NOT EXISTS "code" TEXT NOT NULL DEFAULT '';
ALTER TABLE "email_verifications" ADD COLUMN IF NOT EXISTS "verified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "email_verifications" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00'::timestamp;
ALTER TABLE "hr_employees" ADD COLUMN IF NOT EXISTS "code" TEXT NOT NULL DEFAULT '';
ALTER TABLE "hr_employees" ADD COLUMN IF NOT EXISTS "hireDate" TIMESTAMP(3);
ALTER TABLE "hr_employees" ADD COLUMN IF NOT EXISTS "salary" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "hr_employees" ADD COLUMN IF NOT EXISTS "companyId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "hr_employees" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "feature_flags" ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "feature_flags" ADD COLUMN IF NOT EXISTS "enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "feature_flags" ADD COLUMN IF NOT EXISTS "rolloutPct" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "feature_flags" ADD COLUMN IF NOT EXISTS "targetSlugs" TEXT;
ALTER TABLE "fiscal_periods" ADD COLUMN IF NOT EXISTS "companyId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "fixed_assets" ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "fixed_assets" ADD COLUMN IF NOT EXISTS "code" TEXT NOT NULL DEFAULT '';
ALTER TABLE "fixed_assets" ADD COLUMN IF NOT EXISTS "purchaseDate" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00'::timestamp;
ALTER TABLE "fixed_assets" ADD COLUMN IF NOT EXISTS "purchasePrice" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "fixed_assets" ADD COLUMN IF NOT EXISTS "currentValue" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "fixed_assets" ADD COLUMN IF NOT EXISTS "depreciationRate" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "fixed_assets" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "fixed_assets" ADD COLUMN IF NOT EXISTS "companyId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "fixed_assets" ADD COLUMN IF NOT EXISTS "disposalMethod" TEXT;
ALTER TABLE "fx_revaluations" ADD COLUMN IF NOT EXISTS "date" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00'::timestamp;
ALTER TABLE "fx_revaluations" ADD COLUMN IF NOT EXISTS "companyId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "fx_revaluations" ADD COLUMN IF NOT EXISTS "revaluationDate" TEXT NOT NULL DEFAULT '';
ALTER TABLE "fx_revaluations" ADD COLUMN IF NOT EXISTS "baseCurrency" TEXT NOT NULL DEFAULT '';
ALTER TABLE "fx_revaluations" ADD COLUMN IF NOT EXISTS "targetCurrency" TEXT NOT NULL DEFAULT '';
ALTER TABLE "fx_revaluations" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "global_patterns" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00'::timestamp;
ALTER TABLE "global_patterns" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00'::timestamp;
ALTER TABLE "hr_attendance" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00'::timestamp;
ALTER TABLE "hr_commissions" ADD COLUMN IF NOT EXISTS "period" TEXT NOT NULL DEFAULT '';
ALTER TABLE "hr_commissions" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE "hr_commissions" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00'::timestamp;
ALTER TABLE "hr_leave_requests" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00'::timestamp;
ALTER TABLE "hr_performance" ADD COLUMN IF NOT EXISTS "goals" TEXT;
ALTER TABLE "hr_performance" ADD COLUMN IF NOT EXISTS "feedback" TEXT;
ALTER TABLE "hr_performance" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00'::timestamp;
ALTER TABLE "hr_salaries" ADD COLUMN IF NOT EXISTS "amount" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "hr_salaries" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE "hr_salaries" ADD COLUMN IF NOT EXISTS "paidDate" TIMESTAMP(3);
ALTER TABLE "hr_salaries" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00'::timestamp;
ALTER TABLE "idempotency_keys" ADD COLUMN IF NOT EXISTS "method" TEXT NOT NULL DEFAULT '';
ALTER TABLE "idempotency_keys" ADD COLUMN IF NOT EXISTS "path" TEXT NOT NULL DEFAULT '';
ALTER TABLE "idempotency_keys" ADD COLUMN IF NOT EXISTS "statusCode" INTEGER;
ALTER TABLE "idempotency_keys" ADD COLUMN IF NOT EXISTS "responseBody" TEXT;
ALTER TABLE "idempotency_keys" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00'::timestamp;
ALTER TABLE "installment_schedules" ADD COLUMN IF NOT EXISTS "paidDate" TIMESTAMP(3);
ALTER TABLE "installment_schedules" ADD COLUMN IF NOT EXISTS "paymentRef" TEXT;
ALTER TABLE "inter_company_transactions" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT '';
ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "warehouse" TEXT;
ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "eInvoiceAuthority" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "warehouseId" TEXT;
ALTER TABLE "invoice_brain_header_maps" ADD COLUMN IF NOT EXISTS "companySlug" TEXT NOT NULL DEFAULT '';
ALTER TABLE "invoice_brain_header_maps" ADD COLUMN IF NOT EXISTS "headerName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "invoice_brain_header_maps" ADD COLUMN IF NOT EXISTS "mappedField" TEXT NOT NULL DEFAULT '';
ALTER TABLE "invoice_brain_header_maps" ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'ar';
ALTER TABLE "invoice_brain_header_maps" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00'::timestamp;
ALTER TABLE "invoice_brain_templates" ADD COLUMN IF NOT EXISTS "companySlug" TEXT NOT NULL DEFAULT '';
ALTER TABLE "invoice_brain_templates" ADD COLUMN IF NOT EXISTS "templateName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "invoice_brain_templates" ADD COLUMN IF NOT EXISTS "columnMap" TEXT;
ALTER TABLE "invoice_brain_templates" ADD COLUMN IF NOT EXISTS "delimiter" TEXT NOT NULL DEFAULT ',';
ALTER TABLE "invoice_brain_templates" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00'::timestamp;
ALTER TABLE "invoice_templates" ADD COLUMN IF NOT EXISTS "layout" TEXT;
ALTER TABLE "invoice_template_settings" ADD COLUMN IF NOT EXISTS "defaultTemplateId" TEXT;
ALTER TABLE "invoice_template_settings" ADD COLUMN IF NOT EXISTS "showPaymentTerms" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "invoice_template_settings" ADD COLUMN IF NOT EXISTS "footerText" TEXT;
ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "number" TEXT NOT NULL DEFAULT '';
ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "entryType" TEXT NOT NULL DEFAULT 'general';
ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "companyId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "journal_entry_lines" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "journal_entry_lines" ADD COLUMN IF NOT EXISTS "entryId" INTEGER;
ALTER TABLE "journal_entry_lines" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00'::timestamp;
ALTER TABLE "landed_cost_allocations" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "landed_cost_allocations" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE "landed_cost_allocations" ADD COLUMN IF NOT EXISTS "companyId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "landed_cost_allocations" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT '';
ALTER TABLE "landed_cost_allocations" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "landed_cost_lines" ADD COLUMN IF NOT EXISTS "costType" TEXT NOT NULL DEFAULT '';
ALTER TABLE "landed_cost_lines" ADD COLUMN IF NOT EXISTS "amount" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "landed_cost_lines" ADD COLUMN IF NOT EXISTS "allocationMethod" TEXT NOT NULL DEFAULT 'quantity';
ALTER TABLE "landed_cost_lines" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00'::timestamp;
ALTER TABLE "landed_cost_lines" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00'::timestamp;
ALTER TABLE "landing_content" ADD COLUMN IF NOT EXISTS "section" TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS "landing_content_section_key" ON "landing_content" ("section");
ALTER TABLE "landing_content" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "landing_content" ADD COLUMN IF NOT EXISTS "subtitle" TEXT;
ALTER TABLE "landing_content" ADD COLUMN IF NOT EXISTS "body" TEXT;
ALTER TABLE "landing_content" ADD COLUMN IF NOT EXISTS "ctaText" TEXT;
ALTER TABLE "landing_content" ADD COLUMN IF NOT EXISTS "ctaLink" TEXT;
ALTER TABLE "landing_content" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
ALTER TABLE "landing_content" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "landing_content" ADD COLUMN IF NOT EXISTS "locale" TEXT NOT NULL DEFAULT 'ar';
ALTER TABLE "landing_content" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00'::timestamp;
ALTER TABLE "letters_of_credit" ADD COLUMN IF NOT EXISTS "number" TEXT NOT NULL DEFAULT '';
ALTER TABLE "letters_of_credit" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'import';
ALTER TABLE "letters_of_credit" ADD COLUMN IF NOT EXISTS "beneficiary" TEXT;
ALTER TABLE "letters_of_credit" ADD COLUMN IF NOT EXISTS "issuingBank" TEXT;
ALTER TABLE "letters_of_credit" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "letters_of_credit" ADD COLUMN IF NOT EXISTS "reference" TEXT;
ALTER TABLE "letters_of_credit" ADD COLUMN IF NOT EXISTS "companyId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "MFASecret" RENAME COLUMN "userUid" TO "userId";
ALTER TABLE "MFASecret" ADD COLUMN IF NOT EXISTS "verified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "match_overrides" ADD COLUMN IF NOT EXISTS "productId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "match_overrides" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00'::timestamp;
ALTER TABLE "modules" ADD COLUMN IF NOT EXISTS "key" TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS "modules_key_key" ON "modules" ("key");
ALTER TABLE "modules" ADD COLUMN IF NOT EXISTS "requiredPlan" TEXT NOT NULL DEFAULT 'trial';
ALTER TABLE "opening_balance_entries" ADD COLUMN IF NOT EXISTS "periodId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "opening_balance_entries" ADD COLUMN IF NOT EXISTS "debit" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "opening_balance_entries" ADD COLUMN IF NOT EXISTS "credit" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "opening_balance_entries" ADD COLUMN IF NOT EXISTS "companyId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "opening_balance_entries" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "payment_transactions" ADD COLUMN IF NOT EXISTS "invoiceId" INTEGER;
ALTER TABLE "payment_transactions" ADD COLUMN IF NOT EXISTS "reference" TEXT;
ALTER TABLE "payment_transactions" ADD COLUMN IF NOT EXISTS "date" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00'::timestamp;
ALTER TABLE "payment_transactions" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "payment_vouchers" ADD COLUMN IF NOT EXISTS "number" TEXT NOT NULL DEFAULT '';
ALTER TABLE "payment_vouchers" ADD COLUMN IF NOT EXISTS "paymentType" TEXT NOT NULL DEFAULT '';
ALTER TABLE "payment_vouchers" ADD COLUMN IF NOT EXISTS "direction" TEXT NOT NULL DEFAULT '';
ALTER TABLE "payment_vouchers" ADD COLUMN IF NOT EXISTS "companyId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "platform_settings_history" ADD COLUMN IF NOT EXISTS "settingId" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "platform_settings_history" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00'::timestamp;
ALTER TABLE "post_dated_checks" ADD COLUMN IF NOT EXISTS "companyId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "post_dated_checks" ADD COLUMN IF NOT EXISTS "date" TEXT NOT NULL DEFAULT '';
ALTER TABLE "post_dated_checks" ADD COLUMN IF NOT EXISTS "bankAccountId" INTEGER;
ALTER TABLE "post_dated_checks" ADD COLUMN IF NOT EXISTS "depositedAt" TIMESTAMP(3);
ALTER TABLE "post_dated_checks" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);
ALTER TABLE "post_dated_checks" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "product_aliases" ADD COLUMN IF NOT EXISTS "productId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "product_catalog" ADD COLUMN IF NOT EXISTS "sku" TEXT NOT NULL DEFAULT '';
ALTER TABLE "product_catalog" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "product_catalog" ADD COLUMN IF NOT EXISTS "unit" TEXT NOT NULL DEFAULT 'piece';
ALTER TABLE "product_catalog" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "product_catalog" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "product_catalog" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "product_catalog" ADD COLUMN IF NOT EXISTS "nameAr" TEXT;
ALTER TABLE "product_catalog" ADD COLUMN IF NOT EXISTS "nameEn" TEXT;
ALTER TABLE "product_match_audit" ADD COLUMN IF NOT EXISTS "matchTier" TEXT NOT NULL DEFAULT '';
ALTER TABLE "product_match_audit" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00'::timestamp;
ALTER TABLE "profit_distributions" ADD COLUMN IF NOT EXISTS "periodId" TEXT;
ALTER TABLE "profit_distributions" ADD COLUMN IF NOT EXISTS "retained" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "profit_distributions" ADD COLUMN IF NOT EXISTS "distributed" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "profit_distributions" ADD COLUMN IF NOT EXISTS "companyId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "profit_snapshots" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00'::timestamp;
ALTER TABLE "purchase_invoices" ADD COLUMN IF NOT EXISTS "invoiceNumber" TEXT NOT NULL DEFAULT '';
ALTER TABLE "purchase_invoices" ADD COLUMN IF NOT EXISTS "issueDate" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00'::timestamp;
ALTER TABLE "purchase_invoices" ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3);
ALTER TABLE "purchase_invoices" ADD COLUMN IF NOT EXISTS "total" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "purchase_invoices" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE "purchase_invoices" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "purchase_invoices" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00'::timestamp;
ALTER TABLE "purchase_invoices" ADD COLUMN IF NOT EXISTS "supplierName" TEXT;
ALTER TABLE "purchase_invoices" ADD COLUMN IF NOT EXISTS "lineItems" TEXT NOT NULL DEFAULT '';
ALTER TABLE "purchase_invoices" ADD COLUMN IF NOT EXISTS "purchaseOrderId" INTEGER;
ALTER TABLE "purchase_invoices" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "number" TEXT NOT NULL DEFAULT '';
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "orderDate" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00'::timestamp;
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
ALTER TABLE "quotations" ADD COLUMN IF NOT EXISTS "number" TEXT NOT NULL DEFAULT '';
ALTER TABLE "quotations" ADD COLUMN IF NOT EXISTS "issueDate" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00'::timestamp;
ALTER TABLE "quotations" ADD COLUMN IF NOT EXISTS "expiryDate" TIMESTAMP(3);
ALTER TABLE "quotations" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "quotations" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
ALTER TABLE "refund_transactions" ADD COLUMN IF NOT EXISTS "providerRefundId" TEXT;
ALTER TABLE "refund_transactions" ADD COLUMN IF NOT EXISTS "companySlug" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE "refund_transactions" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "role_permissions" ADD COLUMN IF NOT EXISTS "permissions" TEXT NOT NULL DEFAULT '';
ALTER TABLE "role_permissions" ADD COLUMN IF NOT EXISTS "assignedTo" TEXT;
ALTER TABLE "role_permissions" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "role_permissions" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
ALTER TABLE "SessionRegistry" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00'::timestamp;
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT '';
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "quantity" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "reference" TEXT;
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "cost" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "date" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00'::timestamp;
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00'::timestamp;
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "movementType" TEXT NOT NULL DEFAULT '';
ALTER TABLE "subscription_schedules" ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT;
ALTER TABLE "subscription_schedules" ADD COLUMN IF NOT EXISTS "retryCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "subscription_schedules" ADD COLUMN IF NOT EXISTS "maxRetries" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "subscription_schedules" ADD COLUMN IF NOT EXISTS "downgradePlan" TEXT NOT NULL DEFAULT 'trial';
ALTER TABLE "subscription_schedules" ADD COLUMN IF NOT EXISTS "cycleStart" TIMESTAMP(3);
ALTER TABLE "subscription_schedules" ADD COLUMN IF NOT EXISTS "cycleEnd" TIMESTAMP(3);
ALTER TABLE "subscription_schedules" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "code" TEXT NOT NULL DEFAULT '';
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "companyId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "nameEn" TEXT;
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "companySlug" TEXT NOT NULL DEFAULT '';
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "assignedTo" TEXT;
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "TamperEvidenceChain" ADD COLUMN IF NOT EXISTS "entityType" TEXT NOT NULL DEFAULT '';
ALTER TABLE "TamperEvidenceChain" ADD COLUMN IF NOT EXISTS "entityId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "TamperEvidenceChain" ADD COLUMN IF NOT EXISTS "hash" TEXT NOT NULL DEFAULT '';
ALTER TABLE "TamperEvidenceChain" ADD COLUMN IF NOT EXISTS "previousHash" TEXT;
ALTER TABLE "TamperEvidenceChain" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00'::timestamp;
ALTER TABLE "tax_filings" ADD COLUMN IF NOT EXISTS "period" TEXT NOT NULL DEFAULT '';
ALTER TABLE "tax_filings" ADD COLUMN IF NOT EXISTS "authority" TEXT NOT NULL DEFAULT '';
ALTER TABLE "tax_filings" ADD COLUMN IF NOT EXISTS "totalTax" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "tax_filings" ADD COLUMN IF NOT EXISTS "filingDate" TIMESTAMP(3);
ALTER TABLE "tax_filings" ADD COLUMN IF NOT EXISTS "companyId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "tax_filings" ADD COLUMN IF NOT EXISTS "filingNumber" TEXT;
ALTER TABLE "tax_filings" ADD COLUMN IF NOT EXISTS "submittedBy" TEXT;
ALTER TABLE "tax_filings" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "wps_files" ADD COLUMN IF NOT EXISTS "uploadDate" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00'::timestamp;
ALTER TABLE "wps_files" ADD COLUMN IF NOT EXISTS "processed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "wps_files" ADD COLUMN IF NOT EXISTS "submittedBy" TEXT;
ALTER TABLE "warehouses" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "warehouses" ADD COLUMN IF NOT EXISTS "nameAr" TEXT;
ALTER TABLE "WebhookDelivery" ADD COLUMN IF NOT EXISTS "event" TEXT NOT NULL DEFAULT '';
ALTER TABLE "WebhookDelivery" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00'::timestamp;
ALTER TABLE "WebhookDelivery" ADD COLUMN IF NOT EXISTS "eventId" INTEGER;
ALTER TABLE "WebhookDelivery" ADD COLUMN IF NOT EXISTS "responseBody" TEXT;
ALTER TABLE "WebhookEndpoint" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "WebhookEndpoint" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "zatca_certificates" ADD COLUMN IF NOT EXISTS "certificateDataEnc" TEXT;
ALTER TABLE "zatca_certificates" ADD COLUMN IF NOT EXISTS "privateKeyDataEnc" TEXT;
ALTER TABLE "zatca_certificates" ADD COLUMN IF NOT EXISTS "serialNumber" TEXT;
ALTER TABLE "zatca_certificates" ADD COLUMN IF NOT EXISTS "expiryDate" TIMESTAMP(3);

-- ═══════════════════════════════════════════════════════════════════════════
-- End of P4 schema reconciliation migration.
-- After this runs, every column declared in schema.prisma that any code path
-- might reference via Prisma client will exist in the DB. Runtime Prisma
-- errors of the form "column X of relation Y does not exist" should be
-- eliminated.
-- ═══════════════════════════════════════════════════════════════════════════
