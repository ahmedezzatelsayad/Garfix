-- CreateTable
CREATE TABLE "rule_candidates" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companySlug" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "patternSignature" TEXT NOT NULL,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "consistentOutput" TEXT NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'observing',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "global_patterns" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "patternKey" TEXT NOT NULL,
    "suggestedSku" TEXT,
    "suggestedVatCategory" TEXT,
    "suggestedCategory" TEXT,
    "contributingCompaniesCount" INTEGER NOT NULL DEFAULT 0,
    "confidence" REAL NOT NULL DEFAULT 0,
    "lastUpdated" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ai_score_snapshots" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companySlug" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "score" REAL NOT NULL DEFAULT 0,
    "cacheHitPct" REAL NOT NULL DEFAULT 0,
    "ruleHitPct" REAL NOT NULL DEFAULT 0,
    "aiCallPct" REAL NOT NULL DEFAULT 0,
    "avgCostPerRequest" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "compiled_rules" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "requestType" TEXT NOT NULL,
    "patternDescription" TEXT NOT NULL,
    "logicType" TEXT NOT NULL,
    "logicDefinition" TEXT NOT NULL,
    "accuracyOnHistoricalSample" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending_review',
    "reviewedBy" TEXT,
    "reviewedAt" DATETIME,
    "sourceCandidateId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_company_runtimes" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companyId" INTEGER NOT NULL,
    "workerPoolSize" INTEGER NOT NULL DEFAULT 2,
    "status" TEXT NOT NULL DEFAULT 'active',
    "slaTier" TEXT NOT NULL DEFAULT 'starter',
    "maxAcceptableLatencyMs" INTEGER NOT NULL DEFAULT 2000,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "company_runtimes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_company_runtimes" ("companyId", "createdAt", "id", "status", "updatedAt", "workerPoolSize") SELECT "companyId", "createdAt", "id", "status", "updatedAt", "workerPoolSize" FROM "company_runtimes";
DROP TABLE "company_runtimes";
ALTER TABLE "new_company_runtimes" RENAME TO "company_runtimes";
CREATE UNIQUE INDEX "company_runtimes_companyId_key" ON "company_runtimes"("companyId");
CREATE INDEX "company_runtimes_status_idx" ON "company_runtimes"("status");
CREATE INDEX "company_runtimes_slaTier_idx" ON "company_runtimes"("slaTier");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "rule_candidates_companySlug_status_idx" ON "rule_candidates"("companySlug", "status");

-- CreateIndex
CREATE INDEX "rule_candidates_companySlug_patternSignature_idx" ON "rule_candidates"("companySlug", "patternSignature");

-- CreateIndex
CREATE INDEX "rule_candidates_status_confidence_idx" ON "rule_candidates"("status", "confidence");

-- CreateIndex
CREATE INDEX "global_patterns_confidence_idx" ON "global_patterns"("confidence");

-- CreateIndex
CREATE INDEX "global_patterns_lastUpdated_idx" ON "global_patterns"("lastUpdated");

-- CreateIndex
CREATE UNIQUE INDEX "global_patterns_patternKey_key" ON "global_patterns"("patternKey");

-- CreateIndex
CREATE INDEX "ai_score_snapshots_companySlug_createdAt_idx" ON "ai_score_snapshots"("companySlug", "createdAt");

-- CreateIndex
CREATE INDEX "ai_score_snapshots_score_idx" ON "ai_score_snapshots"("score");

-- CreateIndex
CREATE UNIQUE INDEX "ai_score_snapshots_companySlug_period_key" ON "ai_score_snapshots"("companySlug", "period");

-- CreateIndex
CREATE INDEX "compiled_rules_status_idx" ON "compiled_rules"("status");

-- CreateIndex
CREATE INDEX "compiled_rules_requestType_status_idx" ON "compiled_rules"("requestType", "status");

-- CreateIndex
CREATE INDEX "compiled_rules_accuracyOnHistoricalSample_idx" ON "compiled_rules"("accuracyOnHistoricalSample");
