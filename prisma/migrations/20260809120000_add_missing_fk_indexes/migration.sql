-- Phase 5 P1 fix: Add missing FK indexes for hot query paths.
-- Without these, Postgres does sequential scans on invoices.clientId and
-- payment_transactions.invoiceId lookups (client profile page, AR aging,
-- payment idempotency check).

CREATE INDEX IF NOT EXISTS "invoices_clientId_idx" ON "invoices"("clientId");
CREATE INDEX IF NOT EXISTS "payment_transactions_invoiceId_idx" ON "payment_transactions"("invoiceId");
