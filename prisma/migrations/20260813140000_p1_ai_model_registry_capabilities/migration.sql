-- ════════════════════════════════════════════════════════════════════════════
-- AI-01 FIX (Audit v2 · Phase 1): AIModelRegistry — add capabilities/healthScore/isHealthy
-- ════════════════════════════════════════════════════════════════════════════
--
-- PROBLEM: The init migration (20260720202945) created `ai_model_registry`
-- with `capabilities TEXT NOT NULL DEFAULT '[]'` (a JSON string, not an
-- array). The Prisma schema didn't declare this column, so mapRow()
-- hardcoded `capabilities: []`.
--
-- FIX: Convert `capabilities` from TEXT to TEXT[] and ensure the other
-- columns exist with the correct types.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Step 1: Convert capabilities from TEXT to TEXT[] ───────────────────
-- The init migration created it as TEXT with default '[]'. We need TEXT[].
-- ADD-4 FIX (Phase 1.5): Simplified — drop and re-add since fresh DB has no data.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_model_registry' AND column_name = 'capabilities'
  ) THEN
    ALTER TABLE "ai_model_registry" DROP COLUMN "capabilities";
  END IF;
  ALTER TABLE "ai_model_registry"
    ADD COLUMN "capabilities" TEXT[] NOT NULL DEFAULT '{}'::TEXT[];
END $$;

-- ─── Step 2: Ensure healthScore column exists ───────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_model_registry' AND column_name = 'healthScore'
  ) THEN
    ALTER TABLE "ai_model_registry"
      ADD COLUMN "healthScore" DOUBLE PRECISION NOT NULL DEFAULT 1.0;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_model_registry'
      AND column_name = 'healthScore'
      AND data_type = 'real'
  ) THEN
    -- Convert from REAL to DOUBLE PRECISION
    ALTER TABLE "ai_model_registry"
      ALTER COLUMN "healthScore" TYPE DOUBLE PRECISION USING "healthScore"::DOUBLE PRECISION;
  END IF;
END $$;

-- ─── Step 3: Ensure isHealthy column exists ─────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_model_registry' AND column_name = 'isHealthy'
  ) THEN
    ALTER TABLE "ai_model_registry"
      ADD COLUMN "isHealthy" BOOLEAN NOT NULL DEFAULT true;
  END IF;
END $$;

-- ─── Step 4: Ensure lastHealthCheck column exists ───────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_model_registry' AND column_name = 'lastHealthCheck'
  ) THEN
    ALTER TABLE "ai_model_registry"
      ADD COLUMN "lastHealthCheck" TIMESTAMP(3);
  END IF;
END $$;

-- ─── Step 5: Backfill capabilities for existing rows ────────────────────
-- ADD-4 FIX: Use '{}'::TEXT[] for empty array comparison
UPDATE "ai_model_registry" SET "capabilities" = ARRAY['chat', 'extraction']
  WHERE "capabilities" = '{}'::TEXT[] AND "provider" = 'deepseek';

UPDATE "ai_model_registry" SET "capabilities" = ARRAY['chat', 'extraction', 'vision']
  WHERE "capabilities" = '{}'::TEXT[] AND "provider" = 'gemini';

UPDATE "ai_model_registry" SET "capabilities" = ARRAY['chat', 'extraction', 'vision', 'embedding']
  WHERE "capabilities" = '{}'::TEXT[] AND "provider" = 'openai';

UPDATE "ai_model_registry" SET "capabilities" = ARRAY['chat', 'extraction']
  WHERE "capabilities" = '{}'::TEXT[] AND "provider" = 'openrouter';

-- Default: chat capability for any other provider
UPDATE "ai_model_registry" SET "capabilities" = ARRAY['chat']
  WHERE "capabilities" = '{}'::TEXT[];

-- ─── Step 6: Fix schema drift — rename columns to match Prisma schema ──
-- ADD-4 FIX (Phase 1.5): The init migration created columns with different
-- names than the Prisma schema. Rename them so the typed Prisma client works.
DO $$
BEGIN
  -- Rename isEnabled → isActive
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_model_registry' AND column_name = 'isEnabled'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_model_registry' AND column_name = 'isActive'
  ) THEN
    ALTER TABLE "ai_model_registry" RENAME COLUMN "isEnabled" TO "isActive";
  END IF;

  -- Rename costPer1kIn → costPerTokenIn
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_model_registry' AND column_name = 'costPer1kIn'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_model_registry' AND column_name = 'costPerTokenIn'
  ) THEN
    ALTER TABLE "ai_model_registry" RENAME COLUMN "costPer1kIn" TO "costPerTokenIn";
  END IF;

  -- Rename costPer1kOut → costPerTokenOut
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_model_registry' AND column_name = 'costPer1kOut'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_model_registry' AND column_name = 'costPerTokenOut'
  ) THEN
    ALTER TABLE "ai_model_registry" RENAME COLUMN "costPer1kOut" TO "costPerTokenOut";
  END IF;

  -- Convert costPerTokenIn from REAL to DOUBLE PRECISION (Float in Prisma)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_model_registry'
      AND column_name = 'costPerTokenIn'
      AND data_type = 'real'
  ) THEN
    ALTER TABLE "ai_model_registry"
      ALTER COLUMN "costPerTokenIn" TYPE DOUBLE PRECISION USING "costPerTokenIn"::DOUBLE PRECISION;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_model_registry'
      AND column_name = 'costPerTokenOut'
      AND data_type = 'real'
  ) THEN
    ALTER TABLE "ai_model_registry"
      ALTER COLUMN "costPerTokenOut" TYPE DOUBLE PRECISION USING "costPerTokenOut"::DOUBLE PRECISION;
  END IF;

  -- Make maxTokens nullable (schema has Int? not Int)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_model_registry'
      AND column_name = 'maxTokens'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE "ai_model_registry" ALTER COLUMN "maxTokens" DROP NOT NULL;
  END IF;
END $$;

-- ─── Step 7: Create indexes ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "ai_model_registry_capabilities_idx"
  ON "ai_model_registry" USING GIN ("capabilities");

CREATE INDEX IF NOT EXISTS "ai_model_registry_isActive_isHealthy_idx"
  ON "ai_model_registry" ("isActive", "isHealthy");
