-- Phase 15 P0: ON DELETE RESTRICT on compliance-critical FKs
ALTER TABLE "accounts" DROP CONSTRAINT IF EXISTS "accounts_companyId_fkey";
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT;
ALTER TABLE "clients" DROP CONSTRAINT IF EXISTS "clients_companyId_fkey";
ALTER TABLE "clients" ADD CONSTRAINT "clients_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT;
ALTER TABLE "suppliers" DROP CONSTRAINT IF EXISTS "suppliers_companyId_fkey";
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT;
ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_clientId_fkey";
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT;
ALTER TABLE "payment_vouchers" DROP CONSTRAINT IF EXISTS "payment_vouchers_clientId_fkey";
ALTER TABLE "payment_vouchers" ADD CONSTRAINT "payment_vouchers_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT;
ALTER TABLE "payment_vouchers" DROP CONSTRAINT IF EXISTS "payment_vouchers_supplierId_fkey";
ALTER TABLE "payment_vouchers" ADD CONSTRAINT "payment_vouchers_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT;
