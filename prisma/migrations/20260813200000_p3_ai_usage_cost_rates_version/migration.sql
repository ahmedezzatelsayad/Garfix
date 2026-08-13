-- ════════════════════════════════════════════════════════════════════════════
-- AI-11 FIX (Audit v2 · Phase 3): AIUsageLog.costRatesVersion column
-- ════════════════════════════════════════════════════════════════════════════
--
-- PROBLEM: Cost rates in src/lib/ai/cost-rates.ts are not versioned. When a
-- model's per-token rate changes (e.g. OpenAI cuts GPT-4o pricing), every
-- historical AIUsageLog row is re-computed at the NEW rate whenever a
-- dashboard aggregates costs. This silently rewrites history — a $50 spend
-- from last month becomes $30 in this month's report.
--
-- FIX: add a `costRatesVersion` integer column to `ai_usage_logs` that
-- records the COST_RATES_VERSION constant (in cost-rates.ts) active at the
-- time the row was written. The constant is bumped monotonically whenever
-- the rate table changes. Historical rows stay at version=1 (the column
-- default) so pre-migration data is treated as "v1 — initial table".
--
-- This migration is IDEMPOTENT: it checks information_schema before adding
-- the column so it can be re-applied against a partially-migrated DB.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_usage_logs' AND column_name = 'costRatesVersion'
  ) THEN
    ALTER TABLE "ai_usage_logs"
      ADD COLUMN "costRatesVersion" INTEGER NOT NULL DEFAULT 1;
  END IF;
END $$;

-- Backfill: every pre-migration row is treated as "v1 — initial table".
-- The DEFAULT 1 above handles new rows; this UPDATE stamps existing rows
-- explicitly so a future schema-diff doesn't surprise anyone.
UPDATE "ai_usage_logs" SET "costRatesVersion" = 1 WHERE "costRatesVersion" IS NULL;

-- Optional: an index on costRatesVersion lets dashboards filter/group
-- "show me costs at v3 rates vs v2 rates" without a full-table scan.
CREATE INDEX IF NOT EXISTS "ai_usage_logs_costRatesVersion_idx"
  ON "ai_usage_logs" ("costRatesVersion");
