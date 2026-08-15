-- P2-Sprint6: Schema Reconciliation Migration
-- Adds missing columns and relations identified from 170 TODO markers
-- in the P2-Sprint5 dbTyped migration.
--
-- All ADD COLUMN statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
-- to be idempotent and safe to re-run.

-- ═══════════════════════════════════════════════════════════════════
-- 1. HR models: add companySlug column (5 models)
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE "hr_attendance" ADD COLUMN IF NOT EXISTS "companySlug" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE "hr_attendance" ADD COLUMN IF NOT EXISTS "notes" TEXT;
CREATE INDEX IF NOT EXISTS "hr_attendance_companySlug_idx" ON "hr_attendance"("companySlug");

ALTER TABLE "hr_commissions" ADD COLUMN IF NOT EXISTS "companySlug" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE "hr_commissions" ADD COLUMN IF NOT EXISTS "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "hr_commissions" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'sales';
ALTER TABLE "hr_commissions" ADD COLUMN IF NOT EXISTS "isPaid" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "hr_commissions_companySlug_idx" ON "hr_commissions"("companySlug");

ALTER TABLE "hr_leave_requests" ADD COLUMN IF NOT EXISTS "companySlug" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE "hr_leave_requests" ADD COLUMN IF NOT EXISTS "days" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "hr_leave_requests" ADD COLUMN IF NOT EXISTS "reason" TEXT;
CREATE INDEX IF NOT EXISTS "hr_leave_requests_companySlug_idx" ON "hr_leave_requests"("companySlug");

ALTER TABLE "hr_performance" ADD COLUMN IF NOT EXISTS "companySlug" TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "hr_performance_companySlug_idx" ON "hr_performance"("companySlug");

ALTER TABLE "hr_salaries" ADD COLUMN IF NOT EXISTS "companySlug" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE "hr_salaries" ADD COLUMN IF NOT EXISTS "baseSalary" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "hr_salaries" ADD COLUMN IF NOT EXISTS "netSalary" DECIMAL(65,30) NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "hr_salaries_companySlug_idx" ON "hr_salaries"("companySlug");

-- ═══════════════════════════════════════════════════════════════════
-- 2. Employee: add civilId, allowances, endDate, bankAccount, etc.
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE "hr_employees" ADD COLUMN IF NOT EXISTS "civilId" TEXT;
ALTER TABLE "hr_employees" ADD COLUMN IF NOT EXISTS "allowances" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "hr_employees" ADD COLUMN IF NOT EXISTS "endDate" TIMESTAMP(3);
ALTER TABLE "hr_employees" ADD COLUMN IF NOT EXISTS "bankAccount" TEXT;
ALTER TABLE "hr_employees" ADD COLUMN IF NOT EXISTS "nationality" TEXT;
ALTER TABLE "hr_employees" ADD COLUMN IF NOT EXISTS "residenceExpiry" TIMESTAMP(3);
ALTER TABLE "hr_employees" ADD COLUMN IF NOT EXISTS "passportNumber" TEXT;

-- ═══════════════════════════════════════════════════════════════════
-- 3. LetterOfCredit: add utilizationAmount, documentsRequired, beneficiaryBank
--    Fix bankAccountId type from Int? to String?
-- ═══════════════════════════════════════════════════════════════════
-- First add the new columns
ALTER TABLE "letters_of_credit" ADD COLUMN IF NOT EXISTS "utilizationAmount" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "letters_of_credit" ADD COLUMN IF NOT EXISTS "documentsRequired" TEXT;
ALTER TABLE "letters_of_credit" ADD COLUMN IF NOT EXISTS "beneficiaryBank" TEXT;

-- Change bankAccountId from Int? to String?
-- This requires dropping the old column and recreating it as String?
-- (PostgreSQL doesn't support direct Int->String conversion with foreign key intent)
-- Step 1: Drop the old Int? column (data will be lost — this column was previously
--         broken because BankAccount.id is a String cuid, so Int values were never valid FKs)
ALTER TABLE "letters_of_credit" DROP COLUMN IF EXISTS "bankAccountId";
ALTER TABLE "letters_of_credit" ADD COLUMN IF NOT EXISTS "bankAccountId" TEXT;
CREATE INDEX IF NOT EXISTS "letters_of_credit_bankAccountId_idx" ON "letters_of_credit"("bankAccountId");

-- ═══════════════════════════════════════════════════════════════════
-- 4. BankAccount: fix glAccountId from Int? to String?, add glAccount relation
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE "bank_accounts" DROP COLUMN IF EXISTS "glAccountId";
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "glAccountId" TEXT;

-- ═══════════════════════════════════════════════════════════════════
-- 5. FixedAsset: fix *AccountId from Int? to String?, add relations
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE "fixed_assets" DROP COLUMN IF EXISTS "glAccountId";
ALTER TABLE "fixed_assets" DROP COLUMN IF EXISTS "depreciationAccountId";
ALTER TABLE "fixed_assets" DROP COLUMN IF EXISTS "expenseAccountId";
ALTER TABLE "fixed_assets" ADD COLUMN IF NOT EXISTS "glAccountId" TEXT;
ALTER TABLE "fixed_assets" ADD COLUMN IF NOT EXISTS "depreciationAccountId" TEXT;
ALTER TABLE "fixed_assets" ADD COLUMN IF NOT EXISTS "expenseAccountId" TEXT;

-- ═══════════════════════════════════════════════════════════════════
-- 6. FxRevaluation: add gain/loss breakdown, fix journalEntryId to String?
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE "fx_revaluations" ADD COLUMN IF NOT EXISTS "period" TEXT;
ALTER TABLE "fx_revaluations" ADD COLUMN IF NOT EXISTS "realizedGain" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "fx_revaluations" ADD COLUMN IF NOT EXISTS "realizedLoss" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "fx_revaluations" ADD COLUMN IF NOT EXISTS "unrealizedGain" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "fx_revaluations" ADD COLUMN IF NOT EXISTS "unrealizedLoss" DECIMAL(65,30) NOT NULL DEFAULT 0;

-- Fix journalEntryId from Int? to String?
ALTER TABLE "fx_revaluations" DROP COLUMN IF EXISTS "journalEntryId";
ALTER TABLE "fx_revaluations" ADD COLUMN IF NOT EXISTS "journalEntryId" TEXT;

-- ═══════════════════════════════════════════════════════════════════
-- 7. BankReconciliation: add completedAt
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE "bank_reconciliations" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);

-- ═══════════════════════════════════════════════════════════════════
-- 8. PostDatedCheck: add clearedAt
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE "post_dated_checks" ADD COLUMN IF NOT EXISTS "clearedAt" TIMESTAMP(3);

-- ═══════════════════════════════════════════════════════════════════
-- 9. StockMovement: add warehouseId
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "warehouseId" TEXT;

-- ═══════════════════════════════════════════════════════════════════
-- 10. InventoryItem: add reorderQty
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "reorderQty" DECIMAL(65,30) NOT NULL DEFAULT 0;

-- ═══════════════════════════════════════════════════════════════════
-- 11. ProductCatalog: add wholesalePrice
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE "product_catalog" ADD COLUMN IF NOT EXISTS "wholesalePrice" DECIMAL(65,30) NOT NULL DEFAULT 0;

-- ═══════════════════════════════════════════════════════════════════
-- 12. Client: add clientCompany, notes
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "clientCompany" TEXT;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "notes" TEXT;

-- ═══════════════════════════════════════════════════════════════════
-- 13. PaymentVoucher: add approvedBy
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE "payment_vouchers" ADD COLUMN IF NOT EXISTS "approvedBy" TEXT;

-- ═══════════════════════════════════════════════════════════════════
-- 14. IdempotencyKey: add companySlug, endpoint, responseJson
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE "idempotency_keys" ADD COLUMN IF NOT EXISTS "companySlug" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE "idempotency_keys" ADD COLUMN IF NOT EXISTS "endpoint" TEXT;
ALTER TABLE "idempotency_keys" ADD COLUMN IF NOT EXISTS "responseJson" TEXT;
CREATE INDEX IF NOT EXISTS "idempotency_keys_companySlug_idx" ON "idempotency_keys"("companySlug");

-- ═══════════════════════════════════════════════════════════════════
-- 15. PlatformSettings: add updatedBy
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "updatedBy" TEXT;

-- ═══════════════════════════════════════════════════════════════════
-- 16. PlatformSettingsHistory: add changedByEmail
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE "platform_settings_history" ADD COLUMN IF NOT EXISTS "changedByEmail" TEXT;

-- ═══════════════════════════════════════════════════════════════════
-- 17. Quotation: add client relation index
-- ═══════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS "quotations_clientId_idx" ON "quotations"("clientId");

-- ═══════════════════════════════════════════════════════════════════
-- 18. CostCenter: fix parentId from Int? to String?, add self-relation
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE "cost_centers" DROP COLUMN IF EXISTS "parentId";
ALTER TABLE "cost_centers" ADD COLUMN IF NOT EXISTS "parentId" TEXT;

-- ═══════════════════════════════════════════════════════════════════
-- 19. Budget: fix accountId/costCenterId from Int to String?, add relations
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE "budgets" DROP COLUMN IF EXISTS "accountId";
ALTER TABLE "budgets" DROP COLUMN IF EXISTS "costCenterId";
ALTER TABLE "budgets" ADD COLUMN IF NOT EXISTS "accountId" TEXT;
ALTER TABLE "budgets" ADD COLUMN IF NOT EXISTS "costCenterId" TEXT;

-- ═══════════════════════════════════════════════════════════════════
-- 20. JournalEntryLine: add costCenterId
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE "journal_entry_lines" ADD COLUMN IF NOT EXISTS "costCenterId" TEXT;

-- ═══════════════════════════════════════════════════════════════════
-- 21. LandedCostAllocation: purchaseInvoice relation already has purchaseInvoiceId
-- ═══════════════════════════════════════════════════════════════════
-- (no column changes needed — purchaseInvoiceId String? already exists)

-- ═══════════════════════════════════════════════════════════════════
-- 22. LandedCostLine: add productId, proportionalWeight, allocatedAmount
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE "landed_cost_lines" ADD COLUMN IF NOT EXISTS "productId" TEXT;
ALTER TABLE "landed_cost_lines" ADD COLUMN IF NOT EXISTS "proportionalWeight" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "landed_cost_lines" ADD COLUMN IF NOT EXISTS "allocatedAmount" DECIMAL(65,30) NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "landed_cost_lines_allocationId_idx" ON "landed_cost_lines"("allocationId");
CREATE INDEX IF NOT EXISTS "landed_cost_lines_productId_idx" ON "landed_cost_lines"("productId");

-- ═══════════════════════════════════════════════════════════════════
-- 23. InvoiceTemplateSettings: add name
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE "invoice_template_settings" ADD COLUMN IF NOT EXISTS "name" TEXT;
