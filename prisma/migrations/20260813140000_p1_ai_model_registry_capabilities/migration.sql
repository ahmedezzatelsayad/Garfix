-- ════════════════════════════════════════════════════════════════════════════
-- AI-01 FIX (Audit v2 · Phase 1): AIModelRegistry — add capabilities/healthScore/isHealthy
-- ════════════════════════════════════════════════════════════════════════════
--
-- PROBLEM: The AIModelRegistry schema lacked `capabilities`, `healthScore`,
-- and `isHealthy` columns. The `mapRow()` function in model-registry.ts
-- hardcoded `capabilities: []`, so `getModelsForCapability()` always
-- returned `[]`, and `callAIWithFallback()` always fell through to the
-- legacy chain. The entire capability-based routing was non-functional.
--
-- FIX: Add the three columns + a `lastHealthCheck` timestamp. Backfill
-- existing rows with default capabilities based on provider/model name.
-- ════════════════════════════════════════════════════════════════════════════

-- Add columns (IF NOT EXISTS for idempotency)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_model_registry' AND column_name = 'capabilities'
  ) THEN
    ALTER TABLE "ai_model_registry"
      ADD COLUMN "capabilities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_model_registry' AND column_name = 'healthScore'
  ) THEN
    ALTER TABLE "ai_model_registry"
      ADD COLUMN "healthScore" DOUBLE PRECISION NOT NULL DEFAULT 1.0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_model_registry' AND column_name = 'isHealthy'
  ) THEN
    ALTER TABLE "ai_model_registry"
      ADD COLUMN "isHealthy" BOOLEAN NOT NULL DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_model_registry' AND column_name = 'lastHealthCheck'
  ) THEN
    ALTER TABLE "ai_model_registry"
      ADD COLUMN "lastHealthCheck" TIMESTAMP(3);
  END IF;
END $$;

-- Backfill capabilities for existing rows based on provider/model name
-- Capabilities: 'chat', 'extraction', 'vision', 'embedding'
UPDATE "ai_model_registry" SET "capabilities" = ARRAY['chat', 'extraction']
  WHERE "capabilities" = ARRAY[]::TEXT[] AND "provider" = 'deepseek';

UPDATE "ai_model_registry" SET "capabilities" = ARRAY['chat', 'extraction', 'vision']
  WHERE "capabilities" = ARRAY[]::TEXT[] AND "provider" = 'gemini';

UPDATE "ai_model_registry" SET "capabilities" = ARRAY['chat', 'extraction', 'vision', 'embedding']
  WHERE "capabilities" = ARRAY[]::TEXT[] AND "provider" = 'openai';

UPDATE "ai_model_registry" SET "capabilities" = ARRAY['chat', 'extraction']
  WHERE "capabilities" = ARRAY[]::TEXT[] AND "provider" = 'openrouter';

-- Default: chat capability for any other provider
UPDATE "ai_model_registry" SET "capabilities" = ARRAY['chat']
  WHERE "capabilities" = ARRAY[]::TEXT[];

-- Create index for capability-based lookups (GIN index for array containment)
CREATE INDEX IF NOT EXISTS "ai_model_registry_capabilities_idx"
  ON "ai_model_registry" USING GIN ("capabilities");

-- Create index for health-based filtering
CREATE INDEX IF NOT EXISTS "ai_model_registry_isActive_isHealthy_idx"
  ON "ai_model_registry" ("isActive", "isHealthy");
