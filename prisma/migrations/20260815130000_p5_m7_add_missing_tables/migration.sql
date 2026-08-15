-- P5-M7 Root Fix #1b: Drift #10 — missing tables
-- ============================================================================
-- Two tables declared in schema.prisma have NEVER had a CREATE TABLE migration:
--   - compiled_rules  (model CompiledRule, declared in schema but only ever
--                      mentioned in migrations as "column does not exist")
--   - api_key_pool    (model ApiKeyPool, no migration references it at all)
--
-- Symptom: any code path that calls `db.compiledRule.*` or `db.apiKeyPool.*`
-- fails at runtime with P2021: "The table `compiled_rules` does not exist in
-- the current database." This blocked ai-fabric tests (economics-p2.test.ts)
-- in beforeEach() which calls `db.compiledRule.deleteMany(...)`.
--
-- This migration creates both tables idempotently (IF NOT EXISTS) so re-running
-- via migrate deploy on partially-synced environments is safe.
-- ============================================================================

-- ─── compiled_rules ──────────────────────────────────────────────────────
-- Matches model CompiledRule { ... @@map("compiled_rules") }
CREATE TABLE IF NOT EXISTS "compiled_rules" (
  "id"                      SERIAL           PRIMARY KEY,
  "companySlug"             TEXT             NOT NULL,
  "requestType"             TEXT             NOT NULL,
  "clusterKey"              TEXT             NOT NULL,
  "compiledOutput"          TEXT,
  "sourceCandidateCount"    INTEGER          NOT NULL DEFAULT 0,
  "estimatedAnnualSavingsUsd" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "status"                  TEXT             NOT NULL DEFAULT 'pending_review',
  "createdAt"               TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"               TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "compiled_rules_companySlug_idx"
  ON "compiled_rules" ("companySlug");

-- ─── api_key_pool ────────────────────────────────────────────────────────
-- Matches model ApiKeyPool { ... @@map("api_key_pool") }
-- Note: `assignedToUserId` and `assignedToCompanyId` FKs are intentionally
-- omitted here — they reference `app_users` and `companies` which already
-- exist. Adding the FKs would require the referenced columns to be UNIQUE
-- in the parent tables, which they already are (uid is the AppUser @id, id
-- is the Company @id). However, FK creation can fail in partially-synced
-- environments, so we add them as a separate optional step below. If the
-- FKs already exist or the parent columns are missing, the ADD CONSTRAINT
-- is skipped via DO block.

CREATE TABLE IF NOT EXISTS "api_key_pool" (
  "id"                   TEXT             PRIMARY KEY,
  "keyValue"             TEXT             NOT NULL,
  "provider"             TEXT             NOT NULL DEFAULT 'openrouter',
  "model"                TEXT             NOT NULL DEFAULT 'deepseek/deepseek-chat-v3-0324',
  "status"               TEXT             NOT NULL DEFAULT 'available',
  "assignedToUserId"     TEXT             UNIQUE,
  "assignedToCompanyId"  TEXT,
  "assignedAt"           TIMESTAMP(3),
  "timesUsed"            BIGINT           NOT NULL DEFAULT 0,
  "lastUsedAt"           TIMESTAMP(3),
  "rpmLimit"             INTEGER          NOT NULL DEFAULT 60,
  "dailyLimit"           INTEGER          NOT NULL DEFAULT 1000,
  "usedToday"            BIGINT           NOT NULL DEFAULT 0,
  "resetAt"              TIMESTAMP(3),
  "addedBy"              TEXT,
  "notes"                TEXT,
  "priority"             INTEGER          NOT NULL DEFAULT 0,
  "lowUsageAlert"        BOOLEAN          NOT NULL DEFAULT TRUE,
  "alertThreshold"       INTEGER          NOT NULL DEFAULT 10,
  "createdAt"            TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "api_key_pool_status_idx"
  ON "api_key_pool" ("status");
CREATE INDEX IF NOT EXISTS "api_key_pool_provider_idx"
  ON "api_key_pool" ("provider");
CREATE INDEX IF NOT EXISTS "api_key_pool_assignedToUserId_idx"
  ON "api_key_pool" ("assignedToUserId");

-- Optional FK constraints (skipped if parent columns already have a matching
-- FK or if the parent column is missing). This is intentionally lenient so
-- the migration doesn't fail on partially-synced DBs.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'api_key_pool_assignedToUserId_fkey'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'app_users' AND column_name = 'uid'
  ) THEN
    ALTER TABLE "api_key_pool"
      ADD CONSTRAINT "api_key_pool_assignedToUserId_fkey"
      FOREIGN KEY ("assignedToUserId") REFERENCES "app_users"("uid") ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'api_key_pool_assignedToCompanyId_fkey'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'id'
  ) THEN
    ALTER TABLE "api_key_pool"
      ADD CONSTRAINT "api_key_pool_assignedToCompanyId_fkey"
      FOREIGN KEY ("assignedToCompanyId") REFERENCES "companies"("id") ON DELETE SET NULL;
  END IF;
END $$;
