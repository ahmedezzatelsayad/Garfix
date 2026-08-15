-- P0+P1 Migration: SessionRegistry + OutboxEvent
--
-- SessionRegistry table is created in a prior migration (20260720214438)
-- but was missing from schema.prisma, so the Prisma client could not
-- type-safely access it. This migration is a no-op for the table itself
-- (CREATE TABLE IF NOT EXISTS is idempotent) and adds the OutboxEvent
-- table for the P1.1 transactional outbox pattern.

-- SessionRegistry (idempotent — table already exists from prior migration)
CREATE TABLE IF NOT EXISTS "SessionRegistry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userUid" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "SessionRegistry_jti_key" ON "SessionRegistry"("jti");
CREATE INDEX IF NOT EXISTS "SessionRegistry_userUid_expiresAt_idx" ON "SessionRegistry"("userUid", "expiresAt");
CREATE INDEX IF NOT EXISTS "SessionRegistry_expiresAt_idx" ON "SessionRegistry"("expiresAt");

-- OutboxEvent (P1.1 — Transactional Outbox Pattern)
CREATE TABLE IF NOT EXISTS "OutboxEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "headers" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending'
);
CREATE INDEX IF NOT EXISTS "OutboxEvent_status_createdAt_idx" ON "OutboxEvent"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "OutboxEvent_aggregateType_aggregateId_idx" ON "OutboxEvent"("aggregateType", "aggregateId");
