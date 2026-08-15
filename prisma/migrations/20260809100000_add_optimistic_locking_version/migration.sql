-- Phase 15 P0: Add optimistic locking version column

ALTER TABLE "payment_vouchers" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "payment_vouchers_version_idx" ON "payment_vouchers"("version");

ALTER TABLE "payment_transactions" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "payment_transactions_version_idx" ON "payment_transactions"("version");

ALTER TABLE "e_invoices" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "e_invoices_version_idx" ON "e_invoices"("version");

ALTER TABLE "budgets" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "budgets_version_idx" ON "budgets"("version");

ALTER TABLE "purchase_invoices" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "purchase_invoices_version_idx" ON "purchase_invoices"("version");

ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "clients_version_idx" ON "clients"("version");

ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "suppliers_version_idx" ON "suppliers"("version");
