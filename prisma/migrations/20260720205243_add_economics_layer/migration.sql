-- Phase 5 P1 fix: rewrote from SQLite syntax to PostgreSQL syntax.
-- Original migration used PRAGMA, AUTOINCREMENT, INTEGER PRIMARY KEY — all
-- SQLite-specific. On Postgres these would fail at `prisma migrate deploy`.

CREATE TABLE IF NOT EXISTS "rule_candidates" (
    "id" SERIAL PRIMARY KEY,
    "companySlug" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "patternSignature" TEXT NOT NULL,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "consistentOutput" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'observing',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "global_patterns" (
    "id" SERIAL PRIMARY KEY,
    "patternKey" TEXT NOT NULL,
    "suggestedSku" TEXT,
    "suggestedVatCategory" TEXT,
    "suggestedCategory" TEXT,
    "contributingCompaniesCount" INTEGER NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastUpdated" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "ai_score_snapshots" (
    "id" SERIAL PRIMARY KEY,
    "companySlug" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "aiScore" DOUBLE PRECISION NOT NULL,
    "components" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "company_runtimes" (
    "id" SERIAL PRIMARY KEY,
    "companySlug" TEXT NOT NULL UNIQUE,
    "runtimeConfig" JSONB,
    "lastActive" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS "rule_candidates_companySlug_idx" ON "rule_candidates"("companySlug");
CREATE INDEX IF NOT EXISTS "global_patterns_patternKey_idx" ON "global_patterns"("patternKey");
CREATE INDEX IF NOT EXISTS "ai_score_snapshots_companySlug_idx" ON "ai_score_snapshots"("companySlug");
