-- ═══════════════════════════════════════════════════════════════════════════
-- P6: Type reconciliation — fix DB column types to match schema.prisma
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Problem
-- -------
-- P4 + P5 added missing columns and changed SERIAL ids to TEXT. But several
-- pre-existing columns still have types that don't match schema.prisma:
--
--   - companies.ramadanHours: DB is BOOLEAN, schema says String?
--     → Prisma fails to convert boolean 'false' to String on read
--     → "Error converting field 'ramadanHours' of expected non-nullable
--        type 'String', found incompatible value of 'false'"
--     → Breaks prisma.company.upsert() in E2E helpers
--
-- Strategy
-- --------
-- Change column types to match schema.prisma declarations. Each ALTER is
-- wrapped in a DO block that checks the current type before applying, so
-- the migration is idempotent.
--
-- All conversions use USING clauses that handle NULL gracefully.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. companies.ramadanHours: BOOLEAN → TEXT ─────────────────────────────
-- schema.prisma: ramadanHours String?
-- DB: BOOLEAN NOT NULL DEFAULT false
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'ramadanHours'
      AND data_type = 'boolean'
  ) THEN
    ALTER TABLE "companies" ALTER COLUMN "ramadanHours" DROP DEFAULT;
    ALTER TABLE "companies" ALTER COLUMN "ramadanHours" TYPE TEXT USING
      CASE WHEN "ramadanHours" THEN 'true' ELSE 'false' END;
    ALTER TABLE "companies" ALTER COLUMN "ramadanHours" DROP NOT NULL;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- End of P6 type reconciliation migration.
-- ═══════════════════════════════════════════════════════════════════════════
