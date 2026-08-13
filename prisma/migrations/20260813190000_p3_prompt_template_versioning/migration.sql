-- ════════════════════════════════════════════════════════════════════════════
-- AI-12 FIX (Audit v2 · Phase 3): PromptTemplate versioning + rollback
-- ════════════════════════════════════════════════════════════════════════════
--
-- PROBLEM: PromptTemplate had no `version` column and no rollback endpoint.
-- Editing a prompt overwrote the previous content with no audit trail, and
-- a bad edit (e.g. a typo that breaks the JSON-only contract) could not be
-- reverted without a manual DB restore.
--
-- FIX (this migration):
--   1. Ensure the `version` column exists on `prompt_templates` with the
--      correct type (INTEGER NOT NULL DEFAULT 1).
--   2. Ensure the unique constraint on (name, version) exists so two rows
--      can never collide on the same name+version pair.
--   3. Ensure the index on (name, active) exists so the
--      `findFirst({ where: { name, active: true }, orderBy: { version: 'desc' } })`
--      query in src/lib/promptTemplate.ts is index-backed.
--
-- The `version` column + unique constraint were actually added by an earlier
-- migration (20260809000000_add_prompt_templates) when the table was first
-- created. This migration is IDEMPOTENT — it re-asserts the structure so
-- schema-drift in partially-migrated DBs is corrected, and so the AI-12
-- audit artefact is self-contained.
--
-- The rollback ENDPOINT lives at:
--   POST /api/founder-panel/prompt-templates/[id]/rollback
-- (see src/app/api/founder-panel/prompt-templates/[id]/rollback/route.ts).
-- It rolls back to a previous version by creating a NEW row at version N+1
-- with the content of the target version, then deactivating the current row.
-- This preserves the full history (no destructive UPDATE) and matches the
-- append-only contract enforced by the unique constraint.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Step 1: Ensure `version` column exists ─────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'prompt_templates' AND column_name = 'version'
  ) THEN
    ALTER TABLE "prompt_templates"
      ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
  END IF;
END $$;

-- ─── Step 2: Ensure unique constraint on (name, version) ────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'prompt_templates_name_version_key'
  ) THEN
    ALTER TABLE "prompt_templates"
      ADD CONSTRAINT "prompt_templates_name_version_key" UNIQUE ("name", "version");
  END IF;
END $$;

-- ─── Step 3: Ensure index on (name, active) ─────────────────────────────
CREATE INDEX IF NOT EXISTS "prompt_templates_name_active_idx"
  ON "prompt_templates" ("name", "active");

-- ─── Step 4: Ensure index on (active) alone ─────────────────────────────
CREATE INDEX IF NOT EXISTS "prompt_templates_active_idx"
  ON "prompt_templates" ("active");

-- ─── Step 5: Backfill version=1 for any pre-existing rows ──────────────
-- This is a no-op on fresh DBs (the DEFAULT 1 handles new rows), but on
-- DBs that had prompt_templates before the version column was added, every
-- existing row gets stamped as v1.
UPDATE "prompt_templates" SET "version" = 1 WHERE "version" IS NULL;
