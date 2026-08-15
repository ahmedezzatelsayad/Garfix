-- P5-M7 Root Fix #1: Drift #9
-- ============================================================================
-- AIScoreSnapshot declares `@@unique([companySlug, period])` in schema.prisma
-- but no prior migration ever created the corresponding UNIQUE constraint in
-- the database. As a result, every `db.aiScoreSnapshot.upsert({ where: { companySlug_period: { companySlug, period } } })`
-- call from ai-fabric source (ai-score.ts, learning-engine.ts, etc.) failed at
-- runtime with PostgreSQL error 42P10: "invalid ON CONFLICT for upsert — there
-- is no unique or exclusion constraint matching the ON CONFLICT fields".
--
-- This migration closes that drift by adding the missing composite UNIQUE
-- constraint. After applying, `upsert()` resolves to `ON CONFLICT (companySlug, period)`
-- and 42P10 disappears.
--
-- Idempotent: uses IF NOT EXISTS so re-running (e.g. via migrate deploy on a
-- partially-migrated environment) is safe.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS "ai_score_snapshots_companySlug_period_key"
  ON "ai_score_snapshots" ("companySlug", "period");
