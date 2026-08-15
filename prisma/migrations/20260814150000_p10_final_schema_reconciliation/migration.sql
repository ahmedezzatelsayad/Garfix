-- ──────────────────────────────────────────────────────────────────────────
-- P10: Final Schema Reconciliation (REVISED — fixes 6 application failures)
--
-- Root cause analysis (verified against real Postgres 18 using embedded-postgres):
--   1. Section 1 had 3 `ALTER COLUMN ... DROP NOT NULL` on PRIMARY KEY columns.
--      Postgres rejects this with `column "X" is in a primary key` — PK columns
--      are implicitly NOT NULL and cannot be made nullable. These 3 statements
--      aborted the entire `BEGIN; ... COMMIT;` transaction and caused every
--      subsequent statement to fail with `current transaction is aborted`.
--   2. Section 1 also tried `DROP NOT NULL` on `company_runtimes.companySlug`
--      — a column that does not exist in the table. Schema drift script false
--      positive.
--   3. Section 2 added `id INTEGER NOT NULL DEFAULT 0` to the 4 natural-key
--      tables — but Section 5 then needs to add `id SERIAL` which is a no-op
--      (column already exists), leaving the column as INTEGER (not SERIAL) and
--      `ADD CONSTRAINT PRIMARY KEY (id)` would fail on populated DBs where all
--      rows would share id=0.
--   4. Section 2 declared `ai_model_registry.capabilities` as `TEXT NOT NULL
--      DEFAULT NULL` — wrong type (should be TEXT[] to match schema.prisma
--      `String[]`) and contradictory `NOT NULL DEFAULT NULL`.
--   5. Section 3 `inventory_items.reorderQty` type change failed because the
--      column has `DEFAULT '0'::text` which Postgres cannot auto-cast to
--      NUMERIC. P9 already solved this pattern with DROP DEFAULT → ALTER TYPE
--      → SET DEFAULT; we apply the same fix here.
--   6. Section 5 `landing_content_section_key` UNIQUE constraint failed with
--      `relation already exists` because P4 already created a UNIQUE INDEX
--      with that exact name. The IF NOT EXISTS check only queried
--      `pg_constraint`, missing `pg_class` entries for indexes.
--
-- After this migration, the DB schema matches schema.prisma for all
-- columns that Prisma client reads/writes. This eliminates the
-- P2018 / P2002 / 23505 errors that were breaking E2E tests.
-- ──────────────────────────────────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────────────────
-- SECTION 1: Make blocking phantom columns nullable
--   (columns exist in DB but not in schema.prisma; NOT NULL blocks INSERTs)
--
--   NOTE: PK columns are EXCLUDED — Postgres rejects DROP NOT NULL on PK
--   columns (they're implicitly NOT NULL). After Section 5 demotes them
--   to UNIQUE, they'll still be NOT NULL which is the correct behavior
--   for a UNIQUE constraint.
-- ────────────────────────────────────────────────────────────────────────

ALTER TABLE "stock_movements" ALTER COLUMN "qty" DROP NOT NULL;
ALTER TABLE "announcements" ALTER COLUMN "createdBy" DROP NOT NULL;
ALTER TABLE "ai_processing_logs" ALTER COLUMN "endpoint" DROP NOT NULL;
ALTER TABLE "idempotency_keys" ALTER COLUMN "requestHash" DROP NOT NULL;
ALTER TABLE "ai_usage_logs" ALTER COLUMN "endpoint" DROP NOT NULL;
-- landing_content.key: SKIPPED — column is PRIMARY KEY (cannot DROP NOT NULL)
ALTER TABLE "landing_content" ALTER COLUMN "value" DROP NOT NULL;
ALTER TABLE "ai_memory_notes" ALTER COLUMN "entityType" DROP NOT NULL;
ALTER TABLE "ai_memory_notes" ALTER COLUMN "entityId" DROP NOT NULL;
ALTER TABLE "ai_memory_notes" ALTER COLUMN "note" DROP NOT NULL;
ALTER TABLE "ai_memory_notes" ALTER COLUMN "createdBy" DROP NOT NULL;
-- invoice_brain_templates.fingerprint: SKIPPED — column is PRIMARY KEY
ALTER TABLE "invoice_brain_templates" ALTER COLUMN "fields" DROP NOT NULL;
ALTER TABLE "invoice_brain_templates" ALTER COLUMN "lastUsedAt" DROP NOT NULL;
-- invoice_brain_header_maps.headerFingerprint: SKIPPED — column is PRIMARY KEY
ALTER TABLE "invoice_brain_header_maps" ALTER COLUMN "mapping" DROP NOT NULL;
ALTER TABLE "invoice_brain_header_maps" ALTER COLUMN "lastUsedAt" DROP NOT NULL;
ALTER TABLE "ai_model_registry" ALTER COLUMN "displayName" DROP NOT NULL;
ALTER TABLE "ai_benchmark_results" ALTER COLUMN "modelRegistryId" DROP NOT NULL;
ALTER TABLE "ai_benchmark_results" ALTER COLUMN "capability" DROP NOT NULL;
ALTER TABLE "ai_benchmark_results" ALTER COLUMN "success" DROP NOT NULL;
-- company_runtimes.companySlug: SKIPPED — column does not exist in DB (false positive from drift script)
ALTER TABLE "global_patterns" ALTER COLUMN "lastUpdated" DROP NOT NULL;
ALTER TABLE "ai_score_snapshots" ALTER COLUMN "snapshotDate" DROP NOT NULL;
ALTER TABLE "ai_score_snapshots" ALTER COLUMN "aiScore" DROP NOT NULL;
ALTER TABLE "accounting_audit_logs" ALTER COLUMN "userEmail" DROP NOT NULL;
ALTER TABLE "installment_schedules" ALTER COLUMN "installmentNumber" DROP NOT NULL;
ALTER TABLE "profit_distributions" ALTER COLUMN "fiscalYear" DROP NOT NULL;

-- ────────────────────────────────────────────────────────────────────────
-- SECTION 2: Add missing columns (in schema.prisma, not in DB)
--   These break SELECTs — Prisma client requests them.
--
--   NOTE: The 4 natural-key tables (platform_settings, landing_content,
--   invoice_brain_templates, invoice_brain_header_maps) get their `id` SERIAL
--   column added in SECTION 5 below, where we also handle PK demotion and
--   UNIQUE constraint creation. We MUST NOT add `id INTEGER NOT NULL
--   DEFAULT 0` here — that would conflict with the SERIAL add in Section 5.
-- ────────────────────────────────────────────────────────────────────────

ALTER TABLE "journal_entry_lines" ADD COLUMN IF NOT EXISTS "companySlug" TEXT NOT NULL DEFAULT '';
-- ai_model_registry.capabilities: column ALREADY EXISTS in DB as TEXT[] NOT NULL DEFAULT '{}'::text[]
-- (added by earlier migration). This statement is intentionally corrected to
-- TEXT[] to match schema.prisma `String[] @default([])`. The IF NOT EXISTS
-- guard makes it a safe no-op when the column already exists.
ALTER TABLE "ai_model_registry" ADD COLUMN IF NOT EXISTS "capabilities" TEXT[] NOT NULL DEFAULT '{}'::text[];
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
--
--   NOTE: For columns with a non-castable DEFAULT (e.g. text default on a
--   column being converted to NUMERIC), we DROP DEFAULT → ALTER TYPE →
--   SET DEFAULT. This mirrors the proven pattern from P9.
-- ────────────────────────────────────────────────────────────────────────

-- inventory_items.reorderQty: text → NUMERIC(10,2), has DEFAULT '0'::text
ALTER TABLE "inventory_items" ALTER COLUMN "reorderQty" DROP DEFAULT;
ALTER TABLE "inventory_items" ALTER COLUMN "reorderQty" TYPE NUMERIC(10,2) USING "reorderQty"::NUMERIC(10,2);
ALTER TABLE "inventory_items" ALTER COLUMN "reorderQty" SET DEFAULT 0;

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

-- Re-add FK constraints (now INTEGER → INTEGER) — use DO $$ to skip if already exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'e_invoices_invoiceId_fkey') THEN
    ALTER TABLE "e_invoices" ADD CONSTRAINT "e_invoices_invoiceId_fkey"
      FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_transactions_invoiceId_fkey') THEN
    ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_invoiceId_fkey"
      FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'e_invoice_receipts_invoiceId_fkey') THEN
    ALTER TABLE "e_invoice_receipts" ADD CONSTRAINT "e_invoice_receipts_invoiceId_fkey"
      FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quotations_convertedInvoiceId_fkey') THEN
    ALTER TABLE "quotations" ADD CONSTRAINT "quotations_convertedInvoiceId_fkey"
      FOREIGN KEY ("convertedInvoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_match_audit_invoiceId_fkey') THEN
    ALTER TABLE "product_match_audit" ADD CONSTRAINT "product_match_audit_invoiceId_fkey"
      FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL;
  END IF;
END$$;

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 5: Add `id` SERIAL PK to natural-key tables
--   4 tables (platform_settings, landing_content, invoice_brain_templates,
--   invoice_brain_header_maps) were originally created with a natural-key PK
--   (key/section/fingerprint/headerFingerprint). The schema.prisma declares
--   `id Int @id @default(autoincrement())` for these, but the DB has no `id`
--   column. We add `id` as a new SERIAL column and promote it to PK; the
--   existing natural key stays as a UNIQUE constraint.
--
--   ORDER MATTERS: This section runs BEFORE the natural-key column becomes
--   non-PK. The DO $$ block drops the existing PK constraint on the natural
--   key, then we add `id SERIAL` + PK, then we add UNIQUE on the natural key.
-- ────────────────────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════════════════
-- platform_settings: existing PK is `key`
-- ════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  EXECUTE format('ALTER TABLE "platform_settings" DROP CONSTRAINT IF EXISTS %I',
    (SELECT conname FROM pg_constraint WHERE conrelid = '"platform_settings"'::regclass AND contype = 'p' LIMIT 1));
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "id" SERIAL;
-- Add PK on id only if no PK exists yet
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = '"platform_settings"'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id");
  END IF;
END$$;
-- Add UNIQUE on key only if neither constraint NOR index with that name exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'platform_settings_key_key'
      AND conrelid = '"platform_settings"'::regclass
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'platform_settings_key_key' AND n.nspname = 'public'
  ) THEN
    ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_key_key" UNIQUE ("key");
  END IF;
END$$;

-- ════════════════════════════════════════════════════════════════════════
-- landing_content: existing PK is `key` (NOTE: also has UNIQUE INDEX
-- `landing_content_section_key` on `section` from P4 migration — must NOT
-- try to recreate it as a constraint)
-- ════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  EXECUTE format('ALTER TABLE "landing_content" DROP CONSTRAINT IF EXISTS %I',
    (SELECT conname FROM pg_constraint WHERE conrelid = '"landing_content"'::regclass AND contype = 'p' LIMIT 1));
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

ALTER TABLE "landing_content" ADD COLUMN IF NOT EXISTS "id" SERIAL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = '"landing_content"'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE "landing_content" ADD CONSTRAINT "landing_content_pkey" PRIMARY KEY ("id");
  END IF;
END$$;
-- landing_content_section_key UNIQUE INDEX already exists from P4 — skip recreating
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'landing_content_section_key'
      AND conrelid = '"landing_content"'::regclass
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'landing_content_section_key' AND n.nspname = 'public'
  ) THEN
    ALTER TABLE "landing_content" ADD CONSTRAINT "landing_content_section_key" UNIQUE ("section");
  END IF;
END$$;

-- ════════════════════════════════════════════════════════════════════════
-- invoice_brain_templates: existing PK is `fingerprint`
-- ════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  EXECUTE format('ALTER TABLE "invoice_brain_templates" DROP CONSTRAINT IF EXISTS %I',
    (SELECT conname FROM pg_constraint WHERE conrelid = '"invoice_brain_templates"'::regclass AND contype = 'p' LIMIT 1));
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

ALTER TABLE "invoice_brain_templates" ADD COLUMN IF NOT EXISTS "id" SERIAL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = '"invoice_brain_templates"'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE "invoice_brain_templates" ADD CONSTRAINT "invoice_brain_templates_pkey" PRIMARY KEY ("id");
  END IF;
END$$;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'invoice_brain_templates_fingerprint_key'
      AND conrelid = '"invoice_brain_templates"'::regclass
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'invoice_brain_templates_fingerprint_key' AND n.nspname = 'public'
  ) THEN
    ALTER TABLE "invoice_brain_templates" ADD CONSTRAINT "invoice_brain_templates_fingerprint_key" UNIQUE ("fingerprint");
  END IF;
END$$;

-- ════════════════════════════════════════════════════════════════════════
-- invoice_brain_header_maps: existing PK is `headerFingerprint`
-- ════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  EXECUTE format('ALTER TABLE "invoice_brain_header_maps" DROP CONSTRAINT IF EXISTS %I',
    (SELECT conname FROM pg_constraint WHERE conrelid = '"invoice_brain_header_maps"'::regclass AND contype = 'p' LIMIT 1));
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

ALTER TABLE "invoice_brain_header_maps" ADD COLUMN IF NOT EXISTS "id" SERIAL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = '"invoice_brain_header_maps"'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE "invoice_brain_header_maps" ADD CONSTRAINT "invoice_brain_header_maps_pkey" PRIMARY KEY ("id");
  END IF;
END$$;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'invoice_brain_header_maps_headerFingerprint_key'
      AND conrelid = '"invoice_brain_header_maps"'::regclass
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'invoice_brain_header_maps_headerFingerprint_key' AND n.nspname = 'public'
  ) THEN
    ALTER TABLE "invoice_brain_header_maps" ADD CONSTRAINT "invoice_brain_header_maps_headerFingerprint_key" UNIQUE ("headerFingerprint");
  END IF;
END$$;
