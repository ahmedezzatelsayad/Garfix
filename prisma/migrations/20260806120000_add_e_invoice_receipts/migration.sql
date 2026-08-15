-- CreateTable: EInvoiceReceipt (inbound webhook receipts from tax authorities)
CREATE TABLE IF NOT EXISTS "e_invoice_receipts" (
    "id" TEXT NOT NULL,
    "companySlug" TEXT NOT NULL,
    "invoiceId" INTEGER,
    "authority" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "externalUuid" TEXT,
    "status" TEXT NOT NULL,
    "rawPayload" TEXT NOT NULL,
    "signatureValid" BOOLEAN,
    "rejectionReason" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "e_invoice_receipts_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX IF NOT EXISTS "e_invoice_receipts_companySlug_idx" ON "e_invoice_receipts"("companySlug");
CREATE INDEX IF NOT EXISTS "e_invoice_receipts_companySlug_authority_idx" ON "e_invoice_receipts"("companySlug", "authority");
CREATE INDEX IF NOT EXISTS "e_invoice_receipts_companySlug_receivedAt_idx" ON "e_invoice_receipts"("companySlug", "receivedAt");
CREATE INDEX IF NOT EXISTS "e_invoice_receipts_externalUuid_idx" ON "e_invoice_receipts"("externalUuid");

-- FK: invoiceId → invoices.id (ON DELETE SET NULL — keep receipts even if invoice is hard-deleted)
ALTER TABLE "e_invoice_receipts" ADD CONSTRAINT "e_invoice_receipts_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
