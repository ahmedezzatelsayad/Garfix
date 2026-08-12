-- Add description and reference to OpeningBalanceEntry for richer
-- opening-balance descriptions in API routes.
ALTER TABLE "opening_balance_entries" ADD COLUMN "description" TEXT;
ALTER TABLE "opening_balance_entries" ADD COLUMN "reference" TEXT;
