-- CreateTable
CREATE TABLE IF NOT EXISTS "MFASecret" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userUid" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "recoveryCodes" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "verifiedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MFASecret_userUid_fkey" FOREIGN KEY ("userUid") REFERENCES "app_users" ("uid") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SessionRegistry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userUid" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SessionRegistry_userUid_fkey" FOREIGN KEY ("userUid") REFERENCES "app_users" ("uid") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TamperEvidenceChain" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companySlug" TEXT,
    "entryId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "prevHash" TEXT NOT NULL,
    "chainOrder" INTEGER NOT NULL DEFAULT 0,
    "verifiedAt" TIMESTAMP(3),
    "isValid" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "WebhookEndpoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companySlug" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastPingAt" TIMESTAMP(3),
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "WebhookDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "endpointId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "statusCode" INTEGER,
    "response" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "nextRetryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    CONSTRAINT "WebhookDelivery_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "WebhookEndpoint" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MFASecret_userUid_idx" ON "MFASecret"("userUid");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SessionRegistry_jti_key" ON "SessionRegistry"("jti");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SessionRegistry_userUid_idx" ON "SessionRegistry"("userUid");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SessionRegistry_expiresAt_idx" ON "SessionRegistry"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TamperEvidenceChain_entryId_key" ON "TamperEvidenceChain"("entryId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TamperEvidenceChain_companySlug_idx" ON "TamperEvidenceChain"("companySlug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TamperEvidenceChain_chainOrder_idx" ON "TamperEvidenceChain"("chainOrder");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WebhookEndpoint_companySlug_idx" ON "WebhookEndpoint"("companySlug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WebhookDelivery_endpointId_idx" ON "WebhookDelivery"("endpointId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WebhookDelivery_status_idx" ON "WebhookDelivery"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WebhookDelivery_nextRetryAt_idx" ON "WebhookDelivery"("nextRetryAt");
