-- ════════════════════════════════════════════════════════════════════════════
-- P0 FIX (Audit v2 · Phase 0): Fix companyId column type + decimal precision drift
-- ════════════════════════════════════════════════════════════════════════════
--
-- Issues fixed by this migration:
--
-- DB-03: recurring_journal_entries.companyId and fiscal_year_closes.companyId
-- were declared as INTEGER in migration 20260805000000, but the Prisma schema
-- (lines 2852+ and 2893+) declares them as String (cuid). Prisma sends the
-- cuid string → Postgres throws "invalid input syntax for type integer".
-- The recurring-JE and fiscal-year-close endpoints are unusable on Postgres.
--
-- DB-06 FIX (Audit v2 · Phase 0): fiscal_year_closes.openingRetainedEarnings was DECIMAL(65,3) while
-- every other monetary field in the schema is DECIMAL(65,30). This caused
-- silent truncation of opening balances beyond 3 decimal places.
--
-- DB-07: opening_balance_entries.amount has the same DECIMAL(65,3) drift.
--
-- DB-05 FIX (Audit v2 · Phase 0): journal_entry_lines index was created on "entryId" (legacy column name)
-- but the Prisma schema declares the FK as "journalEntryId". The index should
-- be on the actual FK column. We check for both column names and handle
-- whichever exists (the table was created with "entryId" in the init migration
-- but the schema declares "journalEntryId" — there may be drift).
--
-- This migration is IDEMPOTENT — it uses IF NOT EXISTS / guards so it can
-- be safely re-run. The ALTER COLUMN ... TYPE is safe because TEXT can
-- hold any INTEGER value and DECIMAL(65,30) can hold any DECIMAL(65,3) value.
-- ════════════════════════════════════════════════════════════════════════════

-- DB-03: Fix companyId column type from INTEGER to TEXT on recurring_journal_entries
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recurring_journal_entries'
      AND column_name = 'companyId'
      AND data_type = 'integer'
  ) THEN
    ALTER TABLE "recurring_journal_entries"
      ALTER COLUMN "companyId" TYPE TEXT USING "companyId"::TEXT;
  END IF;
END $$;

-- DB-03: Fix companyId column type from INTEGER to TEXT on fiscal_year_closes
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fiscal_year_closes'
      AND column_name = 'companyId'
      AND data_type = 'integer'
  ) THEN
    ALTER TABLE "fiscal_year_closes"
      ALTER COLUMN "companyId" TYPE TEXT USING "companyId"::TEXT;
  END IF;
END $$;

-- DB-06: Fix decimal precision on fiscal_year_closes.openingRetainedEarnings
-- (DECIMAL(65,3) → DECIMAL(65,30) to match every other monetary field)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fiscal_year_closes'
      AND column_name = 'openingRetainedEarnings'
      AND data_type = 'numeric'
      AND numeric_scale = 3
  ) THEN
    ALTER TABLE "fiscal_year_closes"
      ALTER COLUMN "openingRetainedEarnings" TYPE DECIMAL(65,30);
  END IF;
END $$;

-- DB-07: Fix decimal precision on opening_balance_entries.amount
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'opening_balance_entries'
      AND column_name = 'amount'
      AND data_type = 'numeric'
      AND numeric_scale = 3
  ) THEN
    ALTER TABLE "opening_balance_entries"
      ALTER COLUMN "amount" TYPE DECIMAL(65,30);
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- DB-05: Fix journal_entry_lines index — was created on "entryId" (legacy
-- column name from init migration) but the Prisma schema declares the FK
-- as "journalEntryId". We need to:
--   1. Drop the old index on "entryId" (if it exists)
--   2. Rename "entryId" column to "journalEntryId" (if not already renamed)
--   3. Create the correct index on "journalEntryId"
-- This resolves the schema drift between the init migration and the Prisma schema.
-- ──────────────────────────────────────────────────────────────────────────

-- Step 1: Drop old index on "entryId" if it exists
DROP INDEX IF EXISTS "journal_entry_lines_entryId_idx";
DROP INDEX IF EXISTS "journal_entry_lines_journalEntryId_idx";

-- Step 2: Rename "entryId" → "journalEntryId" if the old column exists
-- AND the new column doesn't (avoid error if already renamed)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'journal_entry_lines' AND column_name = 'entryId'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'journal_entry_lines' AND column_name = 'journalEntryId'
  ) THEN
    ALTER TABLE "journal_entry_lines" RENAME COLUMN "entryId" TO "journalEntryId";
  END IF;
END $$;

-- Step 3: Create the correct index on "journalEntryId" (if the column exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'journal_entry_lines' AND column_name = 'journalEntryId'
  ) THEN
    CREATE INDEX IF NOT EXISTS "journal_entry_lines_journalEntryId_idx"
      ON "journal_entry_lines" ("journalEntryId");
  END IF;
END $$;

-- Also rename the FK constraint to match the new column name
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'journal_entry_lines_entryId_fkey'
      AND table_name = 'journal_entry_lines'
  ) THEN
    ALTER TABLE "journal_entry_lines"
      RENAME CONSTRAINT "journal_entry_lines_entryId_fkey"
      TO "journal_entry_lines_journalEntryId_fkey";
  END IF;
END $$;
