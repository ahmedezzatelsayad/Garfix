-- P1 FIX: Add unique constraint on EInvoiceReceipt to prevent duplicate webhook processing.
-- Without this, two concurrent duplicate webhooks can both pass findFirst and both insert.
CREATE UNIQUE INDEX IF NOT EXISTS "e_invoice_receipts_externalUuid_authority_eventType_key"
  ON "e_invoice_receipts"("externalUuid", "authority", "eventType")
  WHERE "externalUuid" IS NOT NULL;
