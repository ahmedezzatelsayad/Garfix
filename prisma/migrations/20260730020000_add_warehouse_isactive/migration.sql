-- Add isActive + address columns to warehouses table.
-- The API queries `where: { companySlug, isActive: true }` but the schema
-- didn't have isActive, causing "Unknown argument 'isActive'" Prisma errors
-- during inventory sync on every invoice/purchase create.

ALTER TABLE "warehouses" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "warehouses" ADD COLUMN IF NOT EXISTS "address" TEXT;
