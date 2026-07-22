-- CreateTable
CREATE TABLE "MFASecret" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userUid" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "recoveryCodes" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "verifiedAt" DATETIME,
    "lastUsedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MFASecret_userUid_fkey" FOREIGN KEY ("userUid") REFERENCES "app_users" ("uid") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SessionRegistry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userUid" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "SessionRegistry_userUid_fkey" FOREIGN KEY ("userUid") REFERENCES "app_users" ("uid") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TamperEvidenceChain" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companySlug" TEXT,
    "entryId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "prevHash" TEXT NOT NULL,
    "chainOrder" INTEGER NOT NULL DEFAULT 0,
    "verifiedAt" DATETIME,
    "isValid" BOOLEAN,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companySlug" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastPingAt" DATETIME,
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "endpointId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "statusCode" INTEGER,
    "response" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "nextRetryAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" DATETIME,
    CONSTRAINT "WebhookDelivery_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "WebhookEndpoint" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MFASecret_userUid_idx" ON "MFASecret"("userUid");

-- CreateIndex
CREATE UNIQUE INDEX "SessionRegistry_jti_key" ON "SessionRegistry"("jti");

-- CreateIndex
CREATE INDEX "SessionRegistry_userUid_idx" ON "SessionRegistry"("userUid");

-- CreateIndex
CREATE INDEX "SessionRegistry_expiresAt_idx" ON "SessionRegistry"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TamperEvidenceChain_entryId_key" ON "TamperEvidenceChain"("entryId");

-- CreateIndex
CREATE INDEX "TamperEvidenceChain_companySlug_idx" ON "TamperEvidenceChain"("companySlug");

-- CreateIndex
CREATE INDEX "TamperEvidenceChain_chainOrder_idx" ON "TamperEvidenceChain"("chainOrder");

-- CreateIndex
CREATE INDEX "WebhookEndpoint_companySlug_idx" ON "WebhookEndpoint"("companySlug");

-- CreateIndex
CREATE INDEX "WebhookDelivery_endpointId_idx" ON "WebhookDelivery"("endpointId");

-- CreateIndex
CREATE INDEX "WebhookDelivery_status_idx" ON "WebhookDelivery"("status");

-- CreateIndex
CREATE INDEX "WebhookDelivery_nextRetryAt_idx" ON "WebhookDelivery"("nextRetryAt");
