-- P0 RECONCILIATION: موديل ApiKeyPool كان موجودًا في المخطط ومستخدمًا في
-- 15 موضعًا (لوحة مجموعة مفاتيح المؤسس + التوزيع التلقائي) بلا أي migration
-- ينشئ الجدول — أي استخدام للصفحة كان يضرب P2021 (table does not exist).
CREATE TABLE IF NOT EXISTS "api_key_pool" (
    "id" TEXT NOT NULL,
    "keyValue" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'openrouter',
    "model" TEXT NOT NULL DEFAULT 'deepseek/deepseek-chat-v3-0324',
    "status" TEXT NOT NULL DEFAULT 'available',
    "assignedToUserId" TEXT,
    "assignedToCompanyId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "timesUsed" BIGINT NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "rpmLimit" INTEGER NOT NULL DEFAULT 60,
    "dailyLimit" INTEGER NOT NULL DEFAULT 1000,
    "usedToday" BIGINT NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMP(3),
    "addedBy" TEXT,
    "notes" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "lowUsageAlert" BOOLEAN NOT NULL DEFAULT true,
    "alertThreshold" INTEGER NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_key_pool_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "api_key_pool_keyValue_key" ON "api_key_pool"("keyValue");
CREATE UNIQUE INDEX IF NOT EXISTS "api_key_pool_assignedToUserId_key" ON "api_key_pool"("assignedToUserId");
CREATE INDEX IF NOT EXISTS "api_key_pool_status_idx" ON "api_key_pool"("status");
CREATE INDEX IF NOT EXISTS "api_key_pool_provider_idx" ON "api_key_pool"("provider");
CREATE INDEX IF NOT EXISTS "api_key_pool_assignedToUserId_idx" ON "api_key_pool"("assignedToUserId");

ALTER TABLE "api_key_pool"
    ADD CONSTRAINT "api_key_pool_assignedToUserId_fkey"
    FOREIGN KEY ("assignedToUserId") REFERENCES "app_users"("uid")
    ON DELETE SET NULL ON UPDATE CASCADE
    NOT VALID;
ALTER TABLE "api_key_pool" VALIDATE CONSTRAINT "api_key_pool_assignedToUserId_fkey";

ALTER TABLE "api_key_pool"
    ADD CONSTRAINT "api_key_pool_assignedToCompanyId_fkey"
    FOREIGN KEY ("assignedToCompanyId") REFERENCES "companies"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
    NOT VALID;
ALTER TABLE "api_key_pool" VALIDATE CONSTRAINT "api_key_pool_assignedToCompanyId_fkey";
