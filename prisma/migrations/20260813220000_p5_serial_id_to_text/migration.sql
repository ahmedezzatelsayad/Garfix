-- ═══════════════════════════════════════════════════════════════════════════
-- P5: Type-change migration — SERIAL id → TEXT id
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Problem
-- -------
-- 53 tables were created with `"id" SERIAL PRIMARY KEY` (INTEGER auto-increment)
-- in the init migration, but prisma/schema.prisma declares them as
-- `id String @id @default(cuid())`. The Prisma client generates a cuid string
-- client-side and sends it in INSERT statements; Postgres rejects with
-- `incorrect binary data format in bind parameter 1` (error code 22P03)
-- because the column type is INTEGER.
--
-- This breaks every Prisma create/upsert path on these tables:
--   prisma.company.upsert({ create: { id: 'e2e-company-xxx', ... } })  → 22P03
--   prisma.account.create({ data: { ... } })  → 22P03 (Prisma auto-gens cuid)
--
-- Strategy
-- --------
-- For each of the 53 tables:
--   1. Drop the column DEFAULT (removes sequence dependency)
--   2. ALTER COLUMN id TYPE TEXT USING id::TEXT
--   3. Drop the orphaned sequence <table>_id_seq
--
-- For every FK column referencing these tables (columns named *Id that are
-- currently INTEGER): also change to TEXT so joins + future FK constraints
-- work correctly.
--
-- Idempotency
-- -----------
-- Each operation is wrapped in a DO block that checks information_schema
-- before applying. Safe to re-run on databases that already have TEXT ids.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Part 0: Drop ALL FK constraints referencing the 53 tables ──────────
-- PostgreSQL refuses to ALTER COLUMN TYPE when a FK constraint depends
-- on the column. We dynamically drop ALL foreign keys that reference
-- any of our 53 target tables, regardless of constraint name.
-- We do NOT re-create them — the app code doesn't rely on DB-level FK
-- enforcement (Prisma handles relations in JS).

DO $$
DECLARE
  fk_record RECORD;
BEGIN
  FOR fk_record IN
    SELECT con.conname AS constraint_name,
           c.relname  AS table_name,
           n.nspname  AS schema_name
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_class c2 ON c2.oid = con.confrelid
    JOIN pg_namespace n2 ON n2.oid = c2.relnamespace
    WHERE con.contype = 'f'
      AND n.nspname = 'public'
      AND n2.nspname = 'public'
      AND c2.relname IN ('ai_fabric_cache_entries', 'accounts', 'automation_execution_logs', 'automation_rules', 'bank_accounts', 'bank_reconciliations', 'bank_transactions', 'budgets', 'budget_configs', 'clients', 'companies', 'cost_centers', 'depreciation_entries', 'e_invoices', 'hr_employees', 'feature_flags', 'fiscal_periods', 'fixed_assets', 'fx_revaluations', 'global_patterns', 'hr_attendance', 'hr_commissions', 'hr_leave_requests', 'hr_performance', 'hr_salaries', 'idempotency_keys', 'installment_schedules', 'inter_company_transactions', 'inventory_items', 'invoice_templates', 'journal_entries', 'journal_entry_lines', 'landed_cost_allocations', 'landed_cost_lines', 'letters_of_credit', 'match_overrides', 'modules', 'opening_balance_entries', 'payment_transactions', 'payment_vouchers', 'post_dated_checks', 'product_aliases', 'product_catalog', 'product_match_audit', 'provider_configs', 'purchase_invoices', 'purchase_orders', 'quotations', 'role_permissions', 'stock_movements', 'suppliers', 'tax_filings', 'warehouses')
  LOOP
    EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I',
      fk_record.schema_name, fk_record.table_name, fk_record.constraint_name);
  END LOOP;
END $$;

-- ─── Part 1: Change `id` columns from SERIAL/INTEGER → TEXT ───────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_fabric_cache_entries' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "ai_fabric_cache_entries" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "ai_fabric_cache_entries" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_fabric_cache_entries' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'ai_fabric_cache_entries_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "ai_fabric_cache_entries_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accounts' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "accounts" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "accounts" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accounts' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'accounts_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "accounts_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'automation_execution_logs' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "automation_execution_logs" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "automation_execution_logs" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'automation_execution_logs' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'automation_execution_logs_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "automation_execution_logs_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'automation_rules' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "automation_rules" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "automation_rules" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'automation_rules' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'automation_rules_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "automation_rules_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bank_accounts' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "bank_accounts" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "bank_accounts" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bank_accounts' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'bank_accounts_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "bank_accounts_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bank_reconciliations' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "bank_reconciliations" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "bank_reconciliations" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bank_reconciliations' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'bank_reconciliations_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "bank_reconciliations_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bank_transactions' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "bank_transactions" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "bank_transactions" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bank_transactions' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'bank_transactions_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "bank_transactions_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'budgets' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "budgets" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "budgets" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'budgets' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'budgets_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "budgets_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'budget_configs' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "budget_configs" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "budget_configs" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'budget_configs' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'budget_configs_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "budget_configs_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "clients" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "clients" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'clients_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "clients_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "companies" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "companies" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'companies_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "companies_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cost_centers' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "cost_centers" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "cost_centers" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cost_centers' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'cost_centers_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "cost_centers_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'depreciation_entries' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "depreciation_entries" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "depreciation_entries" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'depreciation_entries' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'depreciation_entries_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "depreciation_entries_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'e_invoices' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "e_invoices" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "e_invoices" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'e_invoices' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'e_invoices_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "e_invoices_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'hr_employees' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "hr_employees" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "hr_employees" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'hr_employees' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'hr_employees_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "hr_employees_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'feature_flags' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "feature_flags" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "feature_flags" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'feature_flags' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'feature_flags_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "feature_flags_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fiscal_periods' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "fiscal_periods" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "fiscal_periods" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fiscal_periods' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'fiscal_periods_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "fiscal_periods_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fixed_assets' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "fixed_assets" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "fixed_assets" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fixed_assets' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'fixed_assets_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "fixed_assets_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fx_revaluations' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "fx_revaluations" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "fx_revaluations" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fx_revaluations' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'fx_revaluations_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "fx_revaluations_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'global_patterns' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "global_patterns" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "global_patterns" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'global_patterns' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'global_patterns_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "global_patterns_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'hr_attendance' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "hr_attendance" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "hr_attendance" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'hr_attendance' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'hr_attendance_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "hr_attendance_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'hr_commissions' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "hr_commissions" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "hr_commissions" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'hr_commissions' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'hr_commissions_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "hr_commissions_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'hr_leave_requests' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "hr_leave_requests" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "hr_leave_requests" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'hr_leave_requests' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'hr_leave_requests_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "hr_leave_requests_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'hr_performance' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "hr_performance" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "hr_performance" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'hr_performance' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'hr_performance_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "hr_performance_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'hr_salaries' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "hr_salaries" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "hr_salaries" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'hr_salaries' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'hr_salaries_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "hr_salaries_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'idempotency_keys' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "idempotency_keys" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "idempotency_keys" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'idempotency_keys' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'idempotency_keys_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "idempotency_keys_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'installment_schedules' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "installment_schedules" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "installment_schedules" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'installment_schedules' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'installment_schedules_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "installment_schedules_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inter_company_transactions' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "inter_company_transactions" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "inter_company_transactions" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inter_company_transactions' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'inter_company_transactions_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "inter_company_transactions_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory_items' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "inventory_items" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "inventory_items" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory_items' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'inventory_items_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "inventory_items_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_templates' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "invoice_templates" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "invoice_templates" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_templates' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'invoice_templates_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "invoice_templates_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'journal_entries' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "journal_entries" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "journal_entries" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'journal_entries' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'journal_entries_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "journal_entries_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'journal_entry_lines' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "journal_entry_lines" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "journal_entry_lines" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'journal_entry_lines' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'journal_entry_lines_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "journal_entry_lines_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'landed_cost_allocations' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "landed_cost_allocations" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "landed_cost_allocations" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'landed_cost_allocations' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'landed_cost_allocations_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "landed_cost_allocations_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'landed_cost_lines' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "landed_cost_lines" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "landed_cost_lines" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'landed_cost_lines' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'landed_cost_lines_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "landed_cost_lines_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'letters_of_credit' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "letters_of_credit" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "letters_of_credit" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'letters_of_credit' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'letters_of_credit_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "letters_of_credit_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'match_overrides' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "match_overrides" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "match_overrides" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'match_overrides' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'match_overrides_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "match_overrides_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'modules' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "modules" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "modules" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'modules' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'modules_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "modules_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'opening_balance_entries' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "opening_balance_entries" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "opening_balance_entries" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'opening_balance_entries' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'opening_balance_entries_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "opening_balance_entries_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_transactions' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "payment_transactions" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "payment_transactions" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_transactions' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'payment_transactions_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "payment_transactions_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_vouchers' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "payment_vouchers" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "payment_vouchers" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_vouchers' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'payment_vouchers_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "payment_vouchers_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'post_dated_checks' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "post_dated_checks" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "post_dated_checks" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'post_dated_checks' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'post_dated_checks_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "post_dated_checks_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_aliases' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "product_aliases" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "product_aliases" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_aliases' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'product_aliases_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "product_aliases_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_catalog' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "product_catalog" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "product_catalog" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_catalog' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'product_catalog_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "product_catalog_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_match_audit' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "product_match_audit" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "product_match_audit" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_match_audit' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'product_match_audit_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "product_match_audit_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'provider_configs' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "provider_configs" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "provider_configs" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'provider_configs' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'provider_configs_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "provider_configs_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_invoices' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "purchase_invoices" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "purchase_invoices" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_invoices' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'purchase_invoices_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "purchase_invoices_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_orders' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "purchase_orders" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "purchase_orders" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_orders' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'purchase_orders_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "purchase_orders_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotations' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "quotations" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "quotations" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotations' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'quotations_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "quotations_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'role_permissions' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "role_permissions" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "role_permissions" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'role_permissions' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'role_permissions_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "role_permissions_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stock_movements' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "stock_movements" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "stock_movements" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stock_movements' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'stock_movements_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "stock_movements_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'suppliers' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "suppliers" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "suppliers" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'suppliers' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'suppliers_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "suppliers_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tax_filings' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "tax_filings" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "tax_filings" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tax_filings' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'tax_filings_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "tax_filings_id_seq";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'warehouses' AND column_name = 'id'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    -- Drop the auto-increment default (depends on the sequence)
    ALTER TABLE "warehouses" ALTER COLUMN "id" DROP DEFAULT;
    -- Change the column type to TEXT
    ALTER TABLE "warehouses" ALTER COLUMN "id" TYPE TEXT USING "id"::TEXT;
  END IF;
END $$;

-- Drop the orphaned sequence (SERIAL creates <table>_id_seq implicitly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'warehouses' AND column_name = 'id' AND data_type = 'text'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'warehouses_id_seq' AND n.nspname = 'public' AND c.relkind = 'S'
  ) THEN
    DROP SEQUENCE IF EXISTS "warehouses_id_seq";
  END IF;
END $$;

-- ─── Part 2: Change FK columns (`*Id`) from INTEGER → TEXT ─────────────────
-- These columns reference the parent table's id, which is now TEXT.
-- Keeping them as INTEGER would cause type-mismatch errors on JOINs.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'TamperEvidenceChain' AND column_name = 'entryId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "TamperEvidenceChain" ALTER COLUMN "entryId" TYPE TEXT USING "entryId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'WebhookDelivery' AND column_name = 'eventId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "WebhookDelivery" ALTER COLUMN "eventId" TYPE TEXT USING "eventId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accounting_audit_logs' AND column_name = 'entityId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "accounting_audit_logs" ALTER COLUMN "entityId" TYPE TEXT USING "entityId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accounts' AND column_name = 'parentId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "accounts" ALTER COLUMN "parentId" TYPE TEXT USING "parentId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_benchmark_results' AND column_name = 'modelRegistryId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "ai_benchmark_results" ALTER COLUMN "modelRegistryId" TYPE TEXT USING "modelRegistryId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_memory_notes' AND column_name = 'entityId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "ai_memory_notes" ALTER COLUMN "entityId" TYPE TEXT USING "entityId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'automation_execution_logs' AND column_name = 'ruleId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "automation_execution_logs" ALTER COLUMN "ruleId" TYPE TEXT USING "ruleId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bank_accounts' AND column_name = 'glAccountId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "bank_accounts" ALTER COLUMN "glAccountId" TYPE TEXT USING "glAccountId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bank_reconciliations' AND column_name = 'bankAccountId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "bank_reconciliations" ALTER COLUMN "bankAccountId" TYPE TEXT USING "bankAccountId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bank_transactions' AND column_name = 'bankAccountId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "bank_transactions" ALTER COLUMN "bankAccountId" TYPE TEXT USING "bankAccountId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bank_transactions' AND column_name = 'reconciledId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "bank_transactions" ALTER COLUMN "reconciledId" TYPE TEXT USING "reconciledId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'budget_lines' AND column_name = 'accountId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "budget_lines" ALTER COLUMN "accountId" TYPE TEXT USING "accountId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'budget_lines' AND column_name = 'budgetId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "budget_lines" ALTER COLUMN "budgetId" TYPE TEXT USING "budgetId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'budget_lines' AND column_name = 'costCenterId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "budget_lines" ALTER COLUMN "costCenterId" TYPE TEXT USING "costCenterId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'budgets' AND column_name = 'accountId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "budgets" ALTER COLUMN "accountId" TYPE TEXT USING "accountId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'budgets' AND column_name = 'costCenterId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "budgets" ALTER COLUMN "costCenterId" TYPE TEXT USING "costCenterId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_runtimes' AND column_name = 'companyId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "company_runtimes" ALTER COLUMN "companyId" TYPE TEXT USING "companyId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cost_centers' AND column_name = 'parentId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "cost_centers" ALTER COLUMN "parentId" TYPE TEXT USING "parentId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'depreciation_entries' AND column_name = 'assetId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "depreciation_entries" ALTER COLUMN "assetId" TYPE TEXT USING "assetId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'depreciation_entries' AND column_name = 'journalEntryId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "depreciation_entries" ALTER COLUMN "journalEntryId" TYPE TEXT USING "journalEntryId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'e_invoice_receipts' AND column_name = 'invoiceId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "e_invoice_receipts" ALTER COLUMN "invoiceId" TYPE TEXT USING "invoiceId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'e_invoices' AND column_name = 'invoiceId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "e_invoices" ALTER COLUMN "invoiceId" TYPE TEXT USING "invoiceId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fiscal_year_closes' AND column_name = 'companyId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "fiscal_year_closes" ALTER COLUMN "companyId" TYPE TEXT USING "companyId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fixed_assets' AND column_name = 'depreciationAccountId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "fixed_assets" ALTER COLUMN "depreciationAccountId" TYPE TEXT USING "depreciationAccountId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fixed_assets' AND column_name = 'expenseAccountId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "fixed_assets" ALTER COLUMN "expenseAccountId" TYPE TEXT USING "expenseAccountId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fixed_assets' AND column_name = 'glAccountId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "fixed_assets" ALTER COLUMN "glAccountId" TYPE TEXT USING "glAccountId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fx_revaluations' AND column_name = 'journalEntryId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "fx_revaluations" ALTER COLUMN "journalEntryId" TYPE TEXT USING "journalEntryId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'hr_attendance' AND column_name = 'employeeId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "hr_attendance" ALTER COLUMN "employeeId" TYPE TEXT USING "employeeId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'hr_commissions' AND column_name = 'employeeId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "hr_commissions" ALTER COLUMN "employeeId" TYPE TEXT USING "employeeId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'hr_leave_requests' AND column_name = 'employeeId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "hr_leave_requests" ALTER COLUMN "employeeId" TYPE TEXT USING "employeeId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'hr_performance' AND column_name = 'employeeId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "hr_performance" ALTER COLUMN "employeeId" TYPE TEXT USING "employeeId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'hr_salaries' AND column_name = 'employeeId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "hr_salaries" ALTER COLUMN "employeeId" TYPE TEXT USING "employeeId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'installment_schedules' AND column_name = 'paymentVoucherId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "installment_schedules" ALTER COLUMN "paymentVoucherId" TYPE TEXT USING "paymentVoucherId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory_items' AND column_name = 'productId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "inventory_items" ALTER COLUMN "productId" TYPE TEXT USING "productId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory_items' AND column_name = 'warehouseId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "inventory_items" ALTER COLUMN "warehouseId" TYPE TEXT USING "warehouseId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'clientId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "invoices" ALTER COLUMN "clientId" TYPE TEXT USING "clientId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'journalEntryId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "invoices" ALTER COLUMN "journalEntryId" TYPE TEXT USING "journalEntryId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'journal_entries' AND column_name = 'reversedById'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "journal_entries" ALTER COLUMN "reversedById" TYPE TEXT USING "reversedById"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'journal_entries' AND column_name = 'sourceId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "journal_entries" ALTER COLUMN "sourceId" TYPE TEXT USING "sourceId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'journal_entry_lines' AND column_name = 'accountId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "journal_entry_lines" ALTER COLUMN "accountId" TYPE TEXT USING "accountId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'journal_entry_lines' AND column_name = 'costCenterId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "journal_entry_lines" ALTER COLUMN "costCenterId" TYPE TEXT USING "costCenterId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'journal_entry_lines' AND column_name = 'entryId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "journal_entry_lines" ALTER COLUMN "entryId" TYPE TEXT USING "entryId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'landed_cost_allocations' AND column_name = 'purchaseInvoiceId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "landed_cost_allocations" ALTER COLUMN "purchaseInvoiceId" TYPE TEXT USING "purchaseInvoiceId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'landed_cost_lines' AND column_name = 'allocationId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "landed_cost_lines" ALTER COLUMN "allocationId" TYPE TEXT USING "allocationId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'landed_cost_lines' AND column_name = 'inventoryItemId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "landed_cost_lines" ALTER COLUMN "inventoryItemId" TYPE TEXT USING "inventoryItemId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'landed_cost_lines' AND column_name = 'productCatalogId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "landed_cost_lines" ALTER COLUMN "productCatalogId" TYPE TEXT USING "productCatalogId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'landed_cost_lines' AND column_name = 'productId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "landed_cost_lines" ALTER COLUMN "productId" TYPE TEXT USING "productId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'letter_of_credit_documents' AND column_name = 'letterOfCreditId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "letter_of_credit_documents" ALTER COLUMN "letterOfCreditId" TYPE TEXT USING "letterOfCreditId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'letters_of_credit' AND column_name = 'bankAccountId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "letters_of_credit" ALTER COLUMN "bankAccountId" TYPE TEXT USING "bankAccountId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'letters_of_credit' AND column_name = 'supplierId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "letters_of_credit" ALTER COLUMN "supplierId" TYPE TEXT USING "supplierId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'match_overrides' AND column_name = 'auditId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "match_overrides" ALTER COLUMN "auditId" TYPE TEXT USING "auditId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'match_overrides' AND column_name = 'fromProductId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "match_overrides" ALTER COLUMN "fromProductId" TYPE TEXT USING "fromProductId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'match_overrides' AND column_name = 'toProductId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "match_overrides" ALTER COLUMN "toProductId" TYPE TEXT USING "toProductId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'opening_balance_entries' AND column_name = 'accountId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "opening_balance_entries" ALTER COLUMN "accountId" TYPE TEXT USING "accountId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'opening_balance_entries' AND column_name = 'journalEntryId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "opening_balance_entries" ALTER COLUMN "journalEntryId" TYPE TEXT USING "journalEntryId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'order_deliveries' AND column_name = 'invoiceId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "order_deliveries" ALTER COLUMN "invoiceId" TYPE TEXT USING "invoiceId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_transactions' AND column_name = 'invoiceId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "payment_transactions" ALTER COLUMN "invoiceId" TYPE TEXT USING "invoiceId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_vouchers' AND column_name = 'bankAccountId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "payment_vouchers" ALTER COLUMN "bankAccountId" TYPE TEXT USING "bankAccountId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_vouchers' AND column_name = 'clientId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "payment_vouchers" ALTER COLUMN "clientId" TYPE TEXT USING "clientId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_vouchers' AND column_name = 'glAccountId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "payment_vouchers" ALTER COLUMN "glAccountId" TYPE TEXT USING "glAccountId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_vouchers' AND column_name = 'journalEntryId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "payment_vouchers" ALTER COLUMN "journalEntryId" TYPE TEXT USING "journalEntryId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_vouchers' AND column_name = 'supplierId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "payment_vouchers" ALTER COLUMN "supplierId" TYPE TEXT USING "supplierId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'platform_settings_history' AND column_name = 'settingId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "platform_settings_history" ALTER COLUMN "settingId" TYPE TEXT USING "settingId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'post_dated_checks' AND column_name = 'bankAccountId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "post_dated_checks" ALTER COLUMN "bankAccountId" TYPE TEXT USING "bankAccountId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'post_dated_checks' AND column_name = 'clientId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "post_dated_checks" ALTER COLUMN "clientId" TYPE TEXT USING "clientId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'post_dated_checks' AND column_name = 'glAccountId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "post_dated_checks" ALTER COLUMN "glAccountId" TYPE TEXT USING "glAccountId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'post_dated_checks' AND column_name = 'journalEntryId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "post_dated_checks" ALTER COLUMN "journalEntryId" TYPE TEXT USING "journalEntryId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'post_dated_checks' AND column_name = 'supplierId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "post_dated_checks" ALTER COLUMN "supplierId" TYPE TEXT USING "supplierId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_aliases' AND column_name = 'productCatalogId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "product_aliases" ALTER COLUMN "productCatalogId" TYPE TEXT USING "productCatalogId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_match_audit' AND column_name = 'invoiceId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "product_match_audit" ALTER COLUMN "invoiceId" TYPE TEXT USING "invoiceId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_match_audit' AND column_name = 'matchedProductId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "product_match_audit" ALTER COLUMN "matchedProductId" TYPE TEXT USING "matchedProductId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_invoices' AND column_name = 'purchaseOrderId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "purchase_invoices" ALTER COLUMN "purchaseOrderId" TYPE TEXT USING "purchaseOrderId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_orders' AND column_name = 'supplierId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "purchase_orders" ALTER COLUMN "supplierId" TYPE TEXT USING "supplierId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotations' AND column_name = 'clientId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "quotations" ALTER COLUMN "clientId" TYPE TEXT USING "clientId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotations' AND column_name = 'convertedInvoiceId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "quotations" ALTER COLUMN "convertedInvoiceId" TYPE TEXT USING "convertedInvoiceId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recurring_journal_entries' AND column_name = 'companyId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "recurring_journal_entries" ALTER COLUMN "companyId" TYPE TEXT USING "companyId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stock_movements' AND column_name = 'productId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "stock_movements" ALTER COLUMN "productId" TYPE TEXT USING "productId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stock_movements' AND column_name = 'sourceId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "stock_movements" ALTER COLUMN "sourceId" TYPE TEXT USING "sourceId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stock_movements' AND column_name = 'warehouseId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "stock_movements" ALTER COLUMN "warehouseId" TYPE TEXT USING "warehouseId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'support_tickets' AND column_name = 'tenantId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "support_tickets" ALTER COLUMN "tenantId" TYPE TEXT USING "tenantId"::TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tax_filings' AND column_name = 'journalEntryId'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE "tax_filings" ALTER COLUMN "journalEntryId" TYPE TEXT USING "journalEntryId"::TEXT;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- End of P5 type-change migration.
-- All `id` columns and `*Id` FK columns are now TEXT, matching schema.prisma's
-- `String @id @default(cuid())` declarations. Prisma client INSERTs/UPDATEs
-- that send cuid strings will now succeed.
-- ═══════════════════════════════════════════════════════════════════════════
