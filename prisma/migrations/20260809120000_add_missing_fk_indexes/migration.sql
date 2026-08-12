-- P1 FIX (verification audit): use CREATE INDEX CONCURRENTLY to avoid write locks.
-- Note: CONCURRENTLY cannot run inside a transaction block. Prisma migrate deploy
-- wraps each migration in a transaction by default. To use CONCURRENTLY, this
-- migration must be run with --create-only + manual execution, OR split into
-- a separate non-transactional migration.
-- For safety in automated deploy, we use regular CREATE INDEX IF NOT EXISTS
-- (locks writes briefly but is safe for tables < 1M rows).
-- If the table has millions of rows, run these manually with CONCURRENTLY first:
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "invoices_clientId_idx" ON "invoices"("clientId");
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "payment_transactions_invoiceId_idx" ON "payment_transactions"("invoiceId");

CREATE INDEX IF NOT EXISTS "invoices_clientId_idx" ON "invoices"("clientId");
-- P1 FIX: Removed CREATE INDEX on payment_transactions.invoiceId — column does not exist
