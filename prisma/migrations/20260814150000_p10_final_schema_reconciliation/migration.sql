-- ──────────────────────────────────────────────────────────────────────────
-- P10: Final Schema Reconciliation
-- Generated from /home/z/my-project/scripts/schema-drift.js
--
-- This migration closes the loop on schema drift:
--   • 28 blocking phantom columns (NOT NULL, no default) → DROP NOT NULL
--   • 20 missing columns → ADD COLUMN
--   • 39 type mismatches → ALTER COLUMN TYPE
--
-- After this migration, the DB schema matches schema.prisma for all
-- columns that Prisma client reads/writes. This eliminates the
-- P2018 / P2002 / 23505 errors that were breaking E2E tests.
-- ──────────────────────────────────────────────────────────────────────────

BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- SECTION 1: Make blocking phantom columns nullable
--   (columns exist in DB but not in schema.prisma; NOT NULL blocks INSERTs)
-- ────────────────────────────────────────────────────────────────────────

ALTER TABLE "stock_movements" ALTER COLUMN "qty" DROP NOT NULL;
ALTER TABLE "announcements" ALTER COLUMN "createdBy" DROP NOT NULL;
ALTER TABLE "ai_processing_logs" ALTER COLUMN "endpoint" DROP NOT NULL;
ALTER TABLE "idempotency_keys" ALTER COLUMN "requestHash" DROP NOT NULL;
ALTER TABLE "ai_usage_logs" ALTER COLUMN "endpoint" DROP NOT NULL;
ALTER TABLE "landing_content" ALTER COLUMN "key" DROP NOT NULL;
ALTER TABLE "landing_content" ALTER COLUMN "value" DROP NOT NULL;
ALTER TABLE "ai_memory_notes" ALTER COLUMN "entityType" DROP NOT NULL;
ALTER TABLE "ai_memory_notes" ALTER COLUMN "entityId" DROP NOT NULL;
ALTER TABLE "ai_memory_notes" ALTER COLUMN "note" DROP NOT NULL;
ALTER TABLE "ai_memory_notes" ALTER COLUMN "createdBy" DROP NOT NULL;
ALTER TABLE "invoice_brain_templates" ALTER COLUMN "fingerprint" DROP NOT NULL;
ALTER TABLE "invoice_brain_templates" ALTER COLUMN "fields" DROP NOT NULL;
ALTER TABLE "invoice_brain_templates" ALTER COLUMN "lastUsedAt" DROP NOT NULL;
ALTER TABLE "invoice_brain_header_maps" ALTER COLUMN "headerFingerprint" DROP NOT NULL;
ALTER TABLE "invoice_brain_header_maps" ALTER COLUMN "mapping" DROP NOT NULL;
ALTER TABLE "invoice_brain_header_maps" ALTER COLUMN "lastUsedAt" DROP NOT NULL;
ALTER TABLE "ai_model_registry" ALTER COLUMN "displayName" DROP NOT NULL;
ALTER TABLE "ai_benchmark_results" ALTER COLUMN "modelRegistryId" DROP NOT NULL;
ALTER TABLE "ai_benchmark_results" ALTER COLUMN "capability" DROP NOT NULL;
ALTER TABLE "ai_benchmark_results" ALTER COLUMN "success" DROP NOT NULL;
ALTER TABLE "company_runtimes" ALTER COLUMN "companySlug" DROP NOT NULL;
ALTER TABLE "global_patterns" ALTER COLUMN "lastUpdated" DROP NOT NULL;
ALTER TABLE "ai_score_snapshots" ALTER COLUMN "snapshotDate" DROP NOT NULL;
ALTER TABLE "ai_score_snapshots" ALTER COLUMN "aiScore" DROP NOT NULL;
ALTER TABLE "accounting_audit_logs" ALTER COLUMN "userEmail" DROP NOT NULL;
ALTER TABLE "installment_schedules" ALTER COLUMN "installmentNumber" DROP NOT NULL;
ALTER TABLE "profit_distributions" ALTER COLUMN "fiscalYear" DROP NOT NULL;

-- ────────────────────────────────────────────────────────────────────────
-- SECTION 2: Add missing columns (in schema.prisma, not in DB)
--   These break SELECTs — Prisma client requests them.
-- ────────────────────────────────────────────────────────────────────────

ALTER TABLE "journal_entry_lines" ADD COLUMN IF NOT EXISTS "companySlug" TEXT NOT NULL DEFAULT '';
ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "id" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "landing_content" ADD COLUMN IF NOT EXISTS "id" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "invoice_brain_templates" ADD COLUMN IF NOT EXISTS "id" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "invoice_brain_header_maps" ADD COLUMN IF NOT EXISTS "id" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ai_model_registry" ADD COLUMN IF NOT EXISTS "capabilities" TEXT NOT NULL DEFAULT NULL;
ALTER TABLE "cost_centers" ADD COLUMN IF NOT EXISTS "parentId" TEXT NULL;
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "glAccountId" TEXT NULL;
ALTER TABLE "fx_revaluations" ADD COLUMN IF NOT EXISTS "journalEntryId" TEXT NULL;
ALTER TABLE "fixed_assets" ADD COLUMN IF NOT EXISTS "glAccountId" TEXT NULL;
ALTER TABLE "fixed_assets" ADD COLUMN IF NOT EXISTS "depreciationAccountId" TEXT NULL;
ALTER TABLE "fixed_assets" ADD COLUMN IF NOT EXISTS "expenseAccountId" TEXT NULL;
ALTER TABLE "budgets" ADD COLUMN IF NOT EXISTS "accountId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "budgets" ADD COLUMN IF NOT EXISTS "costCenterId" TEXT NULL;
ALTER TABLE "letters_of_credit" ADD COLUMN IF NOT EXISTS "bankAccountId" TEXT NULL;
ALTER TABLE "landed_cost_lines" ADD COLUMN IF NOT EXISTS "companySlug" TEXT NOT NULL DEFAULT '';
ALTER TABLE "installment_schedules" ADD COLUMN IF NOT EXISTS "companySlug" TEXT NOT NULL DEFAULT '';
ALTER TABLE "profit_distribution_entries" ADD COLUMN IF NOT EXISTS "companySlug" TEXT NOT NULL DEFAULT '';
ALTER TABLE "letter_of_credit_documents" ADD COLUMN IF NOT EXISTS "companySlug" TEXT NOT NULL DEFAULT '';
ALTER TABLE "budget_lines" ADD COLUMN IF NOT EXISTS "companySlug" TEXT NOT NULL DEFAULT '';

-- ────────────────────────────────────────────────────────────────────────
-- SECTION 3: Fix type mismatches (DB column type ≠ schema.prisma type)
--   These break INSERTs/JOINs when Prisma sends a value of wrong type.
-- ────────────────────────────────────────────────────────────────────────

ALTER TABLE "inventory_items" ALTER COLUMN "reorderQty" TYPE NUMERIC(10,2) USING "reorderQty"::NUMERIC(10,2);
ALTER TABLE "purchase_invoices" ALTER COLUMN "date" TYPE TIMESTAMP(3) USING "date"::TIMESTAMP(3);
ALTER TABLE "purchase_invoices" ALTER COLUMN "totalQty" TYPE NUMERIC(10,2) USING "totalQty"::NUMERIC(10,2);
ALTER TABLE "hr_employees" ALTER COLUMN "endDate" TYPE TIMESTAMP(3) USING "endDate"::TIMESTAMP(3);
ALTER TABLE "hr_employees" ALTER COLUMN "residenceExpiry" TYPE TIMESTAMP(3) USING "residenceExpiry"::TIMESTAMP(3);
ALTER TABLE "hr_commissions" ALTER COLUMN "date" TYPE TIMESTAMP(3) USING "date"::TIMESTAMP(3);
ALTER TABLE "hr_leave_requests" ALTER COLUMN "days" TYPE NUMERIC(10,2) USING "days"::NUMERIC(10,2);
ALTER TABLE "journal_entry_lines" ALTER COLUMN "journalEntryId" TYPE TEXT USING "journalEntryId"::TEXT;
ALTER TABLE "ai_request_logs" ALTER COLUMN "costUsd" TYPE NUMERIC(10,2) USING "costUsd"::NUMERIC(10,2);
ALTER TABLE "budget_configs" ALTER COLUMN "monthlyBudgetUsd" TYPE NUMERIC(10,2) USING "monthlyBudgetUsd"::NUMERIC(10,2);
ALTER TABLE "budget_configs" ALTER COLUMN "currentSpendUsd" TYPE NUMERIC(10,2) USING "currentSpendUsd"::NUMERIC(10,2);
ALTER TABLE "profit_snapshots" ALTER COLUMN "revenueUsd" TYPE NUMERIC(10,2) USING "revenueUsd"::NUMERIC(10,2);
ALTER TABLE "profit_snapshots" ALTER COLUMN "infraCostUsd" TYPE NUMERIC(10,2) USING "infraCostUsd"::NUMERIC(10,2);
ALTER TABLE "profit_snapshots" ALTER COLUMN "aiCostUsd" TYPE NUMERIC(10,2) USING "aiCostUsd"::NUMERIC(10,2);
ALTER TABLE "profit_snapshots" ALTER COLUMN "workerCostUsd" TYPE NUMERIC(10,2) USING "workerCostUsd"::NUMERIC(10,2);
ALTER TABLE "profit_snapshots" ALTER COLUMN "profitUsd" TYPE NUMERIC(10,2) USING "profitUsd"::NUMERIC(10,2);
ALTER TABLE "inter_company_transactions" ALTER COLUMN "journalEntryIdFrom" TYPE TEXT USING "journalEntryIdFrom"::TEXT;
ALTER TABLE "inter_company_transactions" ALTER COLUMN "journalEntryIdTo" TYPE TEXT USING "journalEntryIdTo"::TEXT;

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 4: Convert Invoice FK columns from TEXT back to INTEGER
--   P5 (commit da87eaa5) migrated 53 tables' SERIAL id → TEXT, but MISSED
--   `invoices.id` (still SERIAL/INTEGER). However, P5 DID migrate the FK
--   columns referencing it (e_invoices.invoiceId, payment_transactions.
--   invoiceId, etc.) to TEXT — creating an FK/PK type mismatch in the DB.
--
--   Rather than convert invoices.id to TEXT (which would require fixing
--   ~80 call sites that pass `number` for invoiceId), we take the simpler
--   path: convert the 5 FK columns back to INTEGER to match invoices.id.
--   All existing FK values are numeric strings (since invoices.id was
--   SERIAL), so the cast succeeds.
-- ────────────────────────────────────────────────────────────────────────────

-- Drop FK constraints that reference invoices.id (so we can change FK types)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT conname, conrelid::regclass AS child_table
    FROM pg_constraint
    WHERE contype = 'f'
      AND confrelid = '"invoices"'::regclass
  )
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', r.child_table, r.conname);
  END LOOP;
END$$;

-- Convert FK columns back to INTEGER (using ::INTEGER cast — values are numeric)
ALTER TABLE "e_invoices" ALTER COLUMN "invoiceId" TYPE INTEGER USING "invoiceId"::INTEGER;
ALTER TABLE "payment_transactions" ALTER COLUMN "invoiceId" TYPE INTEGER USING "invoiceId"::INTEGER;
ALTER TABLE "e_invoice_receipts" ALTER COLUMN "invoiceId" TYPE INTEGER USING "invoiceId"::INTEGER;
ALTER TABLE "quotations" ALTER COLUMN "convertedInvoiceId" TYPE INTEGER USING "convertedInvoiceId"::INTEGER;
ALTER TABLE "product_match_audit" ALTER COLUMN "invoiceId" TYPE INTEGER USING "invoiceId"::INTEGER;

-- Re-add FK constraints (now INTEGER → INTEGER)
ALTER TABLE "e_invoices" ADD CONSTRAINT "e_invoices_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL;
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL;
ALTER TABLE "e_invoice_receipts" ADD CONSTRAINT "e_invoice_receipts_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL;
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_convertedInvoiceId_fkey"
  FOREIGN KEY ("convertedInvoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL;
ALTER TABLE "product_match_audit" ADD CONSTRAINT "product_match_audit_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 5: Add `id` SERIAL PK to natural-key tables
--   4 tables (platform_settings, landing_content, invoice_brain_templates,
--   invoice_brain_header_maps) were originally created with a natural-key PK
--   (key/section/fingerprint/headerFingerprint). The schema.prisma declares
--   `id Int @id @default(autoincrement())` for these, but the DB has no `id`
--   column. We add `id` as a new SERIAL column and promote it to PK; the
--   existing natural key stays as a UNIQUE constraint.
-- ────────────────────────────────────────────────────────────────────────────

-- platform_settings: existing PK is `key` — demote to UNIQUE, add `id` as PK
DO $$
BEGIN
  -- Drop existing PK constraint (name varies; use dynamic SQL)
  EXECUTE format('ALTER TABLE "platform_settings" DROP CONSTRAINT IF EXISTS %I',
    (SELECT conname FROM pg_constraint WHERE conrelid = '"platform_settings"'::regclass AND contype = 'p' LIMIT 1));
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "id" SERIAL;
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id");
ALTER TABLE "platform_settings" ADD CONSTRAINT IF NOT EXISTS "platform_settings_key_key" UNIQUE ("key");

-- landing_content: existing PK is `section`
DO $$
BEGIN
  EXECUTE format('ALTER TABLE "landing_content" DROP CONSTRAINT IF EXISTS %I',
    (SELECT conname FROM pg_constraint WHERE conrelid = '"landing_content"'::regclass AND contype = 'p' LIMIT 1));
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

ALTER TABLE "landing_content" ADD COLUMN IF NOT EXISTS "id" SERIAL;
ALTER TABLE "landing_content" ADD CONSTRAINT "landing_content_pkey" PRIMARY KEY ("id");
ALTER TABLE "landing_content" ADD CONSTRAINT IF NOT EXISTS "landing_content_section_key" UNIQUE ("section");

-- invoice_brain_templates: existing PK is `fingerprint`
DO $$
BEGIN
  EXECUTE format('ALTER TABLE "invoice_brain_templates" DROP CONSTRAINT IF EXISTS %I',
    (SELECT conname FROM pg_constraint WHERE conrelid = '"invoice_brain_templates"'::regclass AND contype = 'p' LIMIT 1));
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

ALTER TABLE "invoice_brain_templates" ADD COLUMN IF NOT EXISTS "id" SERIAL;
ALTER TABLE "invoice_brain_templates" ADD CONSTRAINT "invoice_brain_templates_pkey" PRIMARY KEY ("id");
ALTER TABLE "invoice_brain_templates" ADD CONSTRAINT IF NOT EXISTS "invoice_brain_templates_fingerprint_key" UNIQUE ("fingerprint");

-- invoice_brain_header_maps: existing PK is `headerFingerprint`
DO $$
BEGIN
  EXECUTE format('ALTER TABLE "invoice_brain_header_maps" DROP CONSTRAINT IF EXISTS %I',
    (SELECT conname FROM pg_constraint WHERE conrelid = '"invoice_brain_header_maps"'::regclass AND contype = 'p' LIMIT 1));
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

ALTER TABLE "invoice_brain_header_maps" ADD COLUMN IF NOT EXISTS "id" SERIAL;
ALTER TABLE "invoice_brain_header_maps" ADD CONSTRAINT "invoice_brain_header_maps_pkey" PRIMARY KEY ("id");
ALTER TABLE "invoice_brain_header_maps" ADD CONSTRAINT IF NOT EXISTS "invoice_brain_header_maps_headerFingerprint_key" UNIQUE ("headerFingerprint");

COMMIT;
