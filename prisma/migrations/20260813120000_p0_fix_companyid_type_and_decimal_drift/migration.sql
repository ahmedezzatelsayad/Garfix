-- ════════════════════════════════════════════════════════════════════════════
-- P0 FIX (Audit v2): Fix companyId column type + decimal precision drift
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
-- DB-06: fiscal_year_closes.openingRetainedEarnings was DECIMAL(65,3) while
-- every other monetary field in the schema is DECIMAL(65,30). This caused
-- silent truncation of opening balances beyond 3 decimal places.
--
-- DB-07: opening_balance_entries.amount has the same DECIMAL(65,3) drift.
-- (Fixed here for consistency — see schema.prisma OpeningBalanceEntry model.)
--
-- This migration is IDEMPOTENT — it uses IF NOT EXISTS / guards so it can
-- be safely re-run. The ALTER COLUMN ... TYPE is safe because TEXT can
-- hold any INTEGER value and DECIMAL(65,30) can hold any DECIMAL(65,3) value.
-- ════════════════════════════════════════════════════════════════════════════

-- DB-03: Fix companyId column type from INTEGER to TEXT on recurring_journal_entries
-- The column is currently INTEGER; Prisma sends cuid strings. Convert to TEXT.
-- Using USING clause to coerce existing integer values to text.
DO $$
BEGIN
  -- Check if the column exists and is currently INTEGER
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
-- DB-05: Fix journal_entry_lines index — was created on non-existent "entryId"
-- column instead of the actual FK column "journalEntryId".
-- Drop the bad index and create the correct one.
-- ──────────────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS "journal_entry_lines_journalEntryId_idx";
-- The above DROP is safe even if the index was created on a different column
-- (e.g. the misnamed "entryId") because we use IF EXISTS.

CREATE INDEX IF NOT EXISTS "journal_entry_lines_journalEntryId_idx"
  ON "journal_entry_lines" ("journalEntryId");
