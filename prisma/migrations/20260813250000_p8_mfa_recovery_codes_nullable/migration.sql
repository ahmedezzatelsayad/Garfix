-- ═══════════════════════════════════════════════════════════════════════════
-- P8: MFASecret.recoveryCodes — drop NOT NULL constraint
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Problem
-- -------
-- Schema.prisma declares MFASecret.recoveryCodes as `String?` (nullable):
--   recoveryCodes String? // P1 FIX: encrypted blob of hashed recovery codes
--
-- But the init migration created it as `TEXT NOT NULL`:
--   "recoveryCodes" TEXT NOT NULL,
--
-- Prisma client upserts that don't set recoveryCodes (it's optional in the
-- schema) fail with "Null constraint violation on the fields: (recoveryCodes)".
--
-- Fix: drop the NOT NULL constraint.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'MFASecret' AND column_name = 'recoveryCodes'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE "MFASecret" ALTER COLUMN "recoveryCodes" DROP NOT NULL;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- End of P8 migration.
-- ═══════════════════════════════════════════════════════════════════════════
