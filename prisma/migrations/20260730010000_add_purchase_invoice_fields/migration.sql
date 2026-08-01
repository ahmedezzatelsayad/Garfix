-- Add fields that POST /api/purchases writes to the purchase_invoices table.
-- The API uses `num`, `date`, `supplier`, `items`, `sourceInvoiceIds`,
-- `totalQty`, `totalAmount`, `notes` — none of which existed in the schema.
-- This caused every purchase-invoice create to 500 with "Unknown arg `num`".
-- All ALTERs are idempotent (IF NOT EXISTS).

ALTER TABLE "purchase_invoices" ADD COLUMN IF NOT EXISTS "num" TEXT;
ALTER TABLE "purchase_invoices" ADD COLUMN IF NOT EXISTS "date" TIMESTAMP(3);
ALTER TABLE "purchase_invoices" ADD COLUMN IF NOT EXISTS "supplier" TEXT;
ALTER TABLE "purchase_invoices" ADD COLUMN IF NOT EXISTS "items" TEXT;
ALTER TABLE "purchase_invoices" ADD COLUMN IF NOT EXISTS "sourceInvoiceIds" TEXT;
ALTER TABLE "purchase_invoices" ADD COLUMN IF NOT EXISTS "totalQty" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "purchase_invoices" ADD COLUMN IF NOT EXISTS "totalAmount" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "purchase_invoices" ADD COLUMN IF NOT EXISTS "notes" TEXT;
