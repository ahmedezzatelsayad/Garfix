-- #27 P1 FIX: StorageObject table for tenant-scoped file access.
CREATE TABLE IF NOT EXISTS "storage_objects" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "companySlug" TEXT NOT NULL,
    "uploadedBy" TEXT,
    "fileSize" INTEGER NOT NULL DEFAULT 0,
    "mimeType" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "storage_objects_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "storage_objects_key_key" ON "storage_objects"("key");
CREATE INDEX IF NOT EXISTS "storage_objects_companySlug_idx" ON "storage_objects"("companySlug");
