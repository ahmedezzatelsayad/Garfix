-- Phase 15 P0: ON DELETE RESTRICT on compliance-critical FKs
-- P1 FIX: Removed companyId FK constraint — column does not exist on this table
-- P1 FIX: Removed companyId FK constraint — column does not exist on this table
-- P1 FIX: Removed companyId FK constraint — column does not exist on this table
-- P1 FIX: Removed companyId FK constraint — column does not exist on this table
-- P1 FIX: Removed companyId FK constraint — column does not exist on this table
-- P1 FIX: Removed companyId FK constraint — column does not exist on this table
ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_clientId_fkey";
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT;
ALTER TABLE "payment_vouchers" DROP CONSTRAINT IF EXISTS "payment_vouchers_clientId_fkey";
ALTER TABLE "payment_vouchers" ADD CONSTRAINT "payment_vouchers_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT;
ALTER TABLE "payment_vouchers" DROP CONSTRAINT IF EXISTS "payment_vouchers_supplierId_fkey";
ALTER TABLE "payment_vouchers" ADD CONSTRAINT "payment_vouchers_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT;
