-- P0 RECONCILIATION: جدول compiled_rules كان في المخطط ويُستخدم من اختبارات
-- اقتصاديات AI Fabric ومحرك القواعد المترجمة، بلا migration ينشئه.
CREATE TABLE IF NOT EXISTS "compiled_rules" (
    "id" SERIAL NOT NULL,
    "companySlug" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "clusterKey" TEXT NOT NULL,
    "compiledOutput" TEXT,
    "sourceCandidateCount" INTEGER NOT NULL DEFAULT 0,
    "estimatedAnnualSavingsUsd" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending_review',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compiled_rules_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "compiled_rules_companySlug_idx" ON "compiled_rules"("companySlug");
