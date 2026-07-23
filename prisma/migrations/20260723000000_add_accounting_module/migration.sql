-- Garfix Accounting Module Migration
-- Adds 21 new tables and updates to JournalEntry / JournalEntryLine for
-- comprehensive multi-tenant ERP accounting (fiscal periods, cost centers,
-- banking, fixed assets, budgets, FX revaluation, inter-company, WPS,
-- tax filings, audit logs, opening balances, and more).
--
-- Migration: 20260723000000_add_accounting_module
-- Database:  PostgreSQL
-- Schema:    GarfiX v12 Prisma schema

-- ──────────────────────────────────────────────────────────────────────────────
-- Step 1 — ALTER existing tables: add new columns (no FK constraints yet)
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE "journal_entries" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'KWD';
ALTER TABLE "journal_entries" ADD COLUMN "reversedById" INTEGER;
ALTER TABLE "journal_entry_lines" ADD COLUMN "costCenterId" INTEGER;

-- ──────────────────────────────────────────────────────────────────────────────
-- Step 2 — CREATE new tables (dependency-ordered)
-- ──────────────────────────────────────────────────────────────────────────────

-- ── FiscalPeriod (فترات مالية) ──────────────────────────────────────────────

CREATE TABLE "fiscal_periods" (
    "id" SERIAL PRIMARY KEY,
    "companySlug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "periodType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "closedBy" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_periods_companySlug_fkey" FOREIGN KEY ("companySlug") REFERENCES "companies" ("slug") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ── CostCenter (مراكز التكلفة) ─────────────────────────────────────────────

CREATE TABLE "cost_centers" (
    "id" SERIAL PRIMARY KEY,
    "companySlug" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "parentId" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cost_centers_companySlug_fkey" FOREIGN KEY ("companySlug") REFERENCES "companies" ("slug") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "cost_centers_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "cost_centers" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- ── WpsFile (ملف حماية الأجور) ────────────────────────────────────────────

CREATE TABLE "wps_files" (
    "id" SERIAL PRIMARY KEY,
    "companySlug" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileContent" TEXT,
    "totalEmployees" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" TEXT NOT NULL DEFAULT '0',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "submittedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wps_files_companySlug_fkey" FOREIGN KEY ("companySlug") REFERENCES "companies" ("slug") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ── AccountingAuditLog (سجل تعديلات محاسبي) ───────────────────────────────

CREATE TABLE "accounting_audit_logs" (
    "id" SERIAL PRIMARY KEY,
    "companySlug" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" INTEGER,
    "beforeState" TEXT,
    "afterState" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounting_audit_logs_companySlug_fkey" FOREIGN KEY ("companySlug") REFERENCES "companies" ("slug") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ── BankAccount (حسابات بنكية) ──────────────────────────────────────────────

CREATE TABLE "bank_accounts" (
    "id" SERIAL PRIMARY KEY,
    "companySlug" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "iban" TEXT,
    "branchCode" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'KWD',
    "balance" TEXT NOT NULL DEFAULT '0',
    "accountType" TEXT NOT NULL DEFAULT 'checking',
    "glAccountId" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_accounts_companySlug_fkey" FOREIGN KEY ("companySlug") REFERENCES "companies" ("slug") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "bank_accounts_glAccountId_fkey" FOREIGN KEY ("glAccountId") REFERENCES "accounts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- ── Quotation (عروض أسعار) ─────────────────────────────────────────────────

CREATE TABLE "quotations" (
    "id" SERIAL PRIMARY KEY,
    "companySlug" TEXT NOT NULL,
    "quotationNumber" TEXT NOT NULL,
    "clientId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "validUntil" TEXT,
    "lineItems" TEXT NOT NULL,
    "subtotal" TEXT NOT NULL,
    "taxRate" TEXT NOT NULL,
    "taxAmount" TEXT NOT NULL,
    "total" TEXT NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "convertedInvoiceId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotations_companySlug_fkey" FOREIGN KEY ("companySlug") REFERENCES "companies" ("slug") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "quotations_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ── PurchaseOrder (أوامر شراء) ─────────────────────────────────────────────

CREATE TABLE "purchase_orders" (
    "id" SERIAL PRIMARY KEY,
    "companySlug" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "expectedDelivery" TEXT,
    "lineItems" TEXT NOT NULL,
    "subtotal" TEXT NOT NULL,
    "taxRate" TEXT NOT NULL,
    "taxAmount" TEXT NOT NULL,
    "total" TEXT NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_companySlug_fkey" FOREIGN KEY ("companySlug") REFERENCES "companies" ("slug") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "purchase_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ── FxRevaluation (إعادة تقييم العملة) ────────────────────────────────────

CREATE TABLE "fx_revaluations" (
    "id" SERIAL PRIMARY KEY,
    "companySlug" TEXT NOT NULL,
    "fromCurrency" TEXT NOT NULL,
    "toCurrency" TEXT NOT NULL,
    "rate" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "realizedGain" TEXT NOT NULL DEFAULT '0',
    "realizedLoss" TEXT NOT NULL DEFAULT '0',
    "unrealizedGain" TEXT NOT NULL DEFAULT '0',
    "unrealizedLoss" TEXT NOT NULL DEFAULT '0',
    "journalEntryId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fx_revaluations_companySlug_fkey" FOREIGN KEY ("companySlug") REFERENCES "companies" ("slug") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "fx_revaluations_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- ── FixedAsset (أصول ثابتة) ────────────────────────────────────────────────

CREATE TABLE "fixed_assets" (
    "id" SERIAL PRIMARY KEY,
    "companySlug" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "category" TEXT NOT NULL,
    "acquisitionDate" TEXT NOT NULL,
    "acquisitionCost" TEXT NOT NULL,
    "salvageValue" TEXT NOT NULL DEFAULT '0',
    "usefulLifeYears" INTEGER NOT NULL,
    "depreciationMethod" TEXT NOT NULL DEFAULT 'straight_line',
    "decliningRate" TEXT NOT NULL DEFAULT '0',
    "currentBookValue" TEXT NOT NULL,
    "accumulatedDepreciation" TEXT NOT NULL DEFAULT '0',
    "location" TEXT,
    "assetTag" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "disposalDate" TEXT,
    "disposalType" TEXT,
    "disposalAmount" TEXT,
    "glAccountId" INTEGER,
    "depreciationAccountId" INTEGER,
    "expenseAccountId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fixed_assets_companySlug_fkey" FOREIGN KEY ("companySlug") REFERENCES "companies" ("slug") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "fixed_assets_glAccountId_fkey" FOREIGN KEY ("glAccountId") REFERENCES "accounts" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "fixed_assets_depreciationAccountId_fkey" FOREIGN KEY ("depreciationAccountId") REFERENCES "accounts" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "fixed_assets_expenseAccountId_fkey" FOREIGN KEY ("expenseAccountId") REFERENCES "accounts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- ── LandedCostAllocation (تكلفة الاستيراد) ────────────────────────────────

CREATE TABLE "landed_cost_allocations" (
    "id" SERIAL PRIMARY KEY,
    "companySlug" TEXT NOT NULL,
    "purchaseInvoiceId" INTEGER NOT NULL,
    "costType" TEXT NOT NULL,
    "totalCost" TEXT NOT NULL,
    "allocationMethod" TEXT NOT NULL DEFAULT 'quantity',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "landed_cost_allocations_companySlug_fkey" FOREIGN KEY ("companySlug") REFERENCES "companies" ("slug") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "landed_cost_allocations_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "purchase_invoices" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ── PostDatedCheck (شيكات آجلة) ────────────────────────────────────────────

CREATE TABLE "post_dated_checks" (
    "id" SERIAL PRIMARY KEY,
    "companySlug" TEXT NOT NULL,
    "checkNumber" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KWD',
    "dueDate" TEXT NOT NULL,
    "issueDate" TEXT,
    "payee" TEXT,
    "payer" TEXT,
    "direction" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "clientId" INTEGER,
    "supplierId" INTEGER,
    "glAccountId" INTEGER,
    "journalEntryId" INTEGER,
    "clearedAt" TIMESTAMP(3),
    "returnedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "post_dated_checks_companySlug_fkey" FOREIGN KEY ("companySlug") REFERENCES "companies" ("slug") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "post_dated_checks_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "post_dated_checks_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "post_dated_checks_glAccountId_fkey" FOREIGN KEY ("glAccountId") REFERENCES "accounts" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "post_dated_checks_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- ── OpeningBalanceEntry (ترحيل أرصدة افتتاحية) ────────────────────────────

CREATE TABLE "opening_balance_entries" (
    "id" SERIAL PRIMARY KEY,
    "companySlug" TEXT NOT NULL,
    "accountId" INTEGER NOT NULL,
    "amount" TEXT NOT NULL,
    "asOfDate" TEXT NOT NULL,
    "importedFrom" TEXT,
    "journalEntryId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opening_balance_entries_companySlug_fkey" FOREIGN KEY ("companySlug") REFERENCES "companies" ("slug") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "opening_balance_entries_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "opening_balance_entries_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- ── TaxFiling (إقرارات ضريبية) ────────────────────────────────────────────

CREATE TABLE "tax_filings" (
    "id" SERIAL PRIMARY KEY,
    "companySlug" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "taxType" TEXT NOT NULL,
    "periodFrom" TEXT NOT NULL,
    "periodTo" TEXT NOT NULL,
    "totalSales" TEXT NOT NULL DEFAULT '0',
    "totalPurchases" TEXT NOT NULL DEFAULT '0',
    "vatDue" TEXT NOT NULL DEFAULT '0',
    "filingReference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "submittedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "journalEntryId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_filings_companySlug_fkey" FOREIGN KEY ("companySlug") REFERENCES "companies" ("slug") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "tax_filings_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- ── InterCompanyTransaction (معاملات بين فروع) ────────────────────────────

CREATE TABLE "inter_company_transactions" (
    "id" SERIAL PRIMARY KEY,
    "companySlugFrom" TEXT NOT NULL,
    "companySlugTo" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "description" TEXT,
    "journalEntryIdFrom" INTEGER,
    "journalEntryIdTo" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inter_company_transactions_companySlugFrom_fkey" FOREIGN KEY ("companySlugFrom") REFERENCES "companies" ("slug") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "inter_company_transactions_companySlugTo_fkey" FOREIGN KEY ("companySlugTo") REFERENCES "companies" ("slug") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "inter_company_transactions_journalEntryIdFrom_fkey" FOREIGN KEY ("journalEntryIdFrom") REFERENCES "journal_entries" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "inter_company_transactions_journalEntryIdTo_fkey" FOREIGN KEY ("journalEntryIdTo") REFERENCES "journal_entries" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- ── BankTransaction (حركات بنكية) ──────────────────────────────────────────
-- Depends on: bank_accounts

CREATE TABLE "bank_transactions" (
    "id" SERIAL PRIMARY KEY,
    "companySlug" TEXT NOT NULL,
    "bankAccountId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "reference" TEXT,
    "description" TEXT,
    "amount" TEXT NOT NULL,
    "transactionType" TEXT NOT NULL,
    "isReconciled" BOOLEAN NOT NULL DEFAULT false,
    "reconciledWith" TEXT,
    "reconciledId" INTEGER,
    "importedFrom" TEXT,
    "rawRow" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_transactions_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "bank_transactions_companySlug_fkey" FOREIGN KEY ("companySlug") REFERENCES "companies" ("slug") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ── BankReconciliation (تسوية بنكية) ───────────────────────────────────────
-- Depends on: bank_accounts

CREATE TABLE "bank_reconciliations" (
    "id" SERIAL PRIMARY KEY,
    "companySlug" TEXT NOT NULL,
    "bankAccountId" INTEGER NOT NULL,
    "periodStart" TEXT NOT NULL,
    "periodEnd" TEXT NOT NULL,
    "statementBalance" TEXT NOT NULL,
    "bookBalance" TEXT NOT NULL,
    "adjustedBalance" TEXT NOT NULL,
    "difference" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "completedBy" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_reconciliations_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "bank_reconciliations_companySlug_fkey" FOREIGN KEY ("companySlug") REFERENCES "companies" ("slug") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ── DepreciationEntry (إهلاك) ──────────────────────────────────────────────
-- Depends on: fixed_assets

CREATE TABLE "depreciation_entries" (
    "id" SERIAL PRIMARY KEY,
    "companySlug" TEXT NOT NULL,
    "assetId" INTEGER NOT NULL,
    "period" TEXT NOT NULL,
    "depreciationAmount" TEXT NOT NULL,
    "bookValueAfter" TEXT NOT NULL,
    "journalEntryId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "depreciation_entries_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "fixed_assets" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "depreciation_entries_companySlug_fkey" FOREIGN KEY ("companySlug") REFERENCES "companies" ("slug") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "depreciation_entries_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- ── PaymentVoucher (سندات قبض وصرف) ──────────────────────────────────────
-- Depends on: bank_accounts

CREATE TABLE "payment_vouchers" (
    "id" SERIAL PRIMARY KEY,
    "companySlug" TEXT NOT NULL,
    "voucherNumber" TEXT NOT NULL,
    "voucherType" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KWD',
    "amountArText" TEXT,
    "payee" TEXT NOT NULL,
    "payer" TEXT NOT NULL,
    "description" TEXT,
    "reference" TEXT,
    "clientId" INTEGER,
    "supplierId" INTEGER,
    "bankAccountId" INTEGER,
    "glAccountId" INTEGER,
    "journalEntryId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_vouchers_companySlug_fkey" FOREIGN KEY ("companySlug") REFERENCES "companies" ("slug") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "payment_vouchers_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "payment_vouchers_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "payment_vouchers_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "payment_vouchers_glAccountId_fkey" FOREIGN KEY ("glAccountId") REFERENCES "accounts" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "payment_vouchers_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- ── Budget (موازنة تخطيطية) ──────────────────────────────────────────────
-- Depends on: cost_centers

CREATE TABLE "budgets" (
    "id" SERIAL PRIMARY KEY,
    "companySlug" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "period" TEXT NOT NULL,
    "periodName" TEXT NOT NULL,
    "accountId" INTEGER NOT NULL,
    "costCenterId" INTEGER,
    "plannedAmount" TEXT NOT NULL,
    "actualAmount" TEXT NOT NULL DEFAULT '0',
    "variance" TEXT NOT NULL DEFAULT '0',
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budgets_companySlug_fkey" FOREIGN KEY ("companySlug") REFERENCES "companies" ("slug") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "budgets_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "budgets_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- ── LetterOfCredit (اعتمادات مستندية) ────────────────────────────────────
-- Depends on: bank_accounts

CREATE TABLE "letters_of_credit" (
    "id" SERIAL PRIMARY KEY,
    "companySlug" TEXT NOT NULL,
    "lcNumber" TEXT NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "bankAccountId" INTEGER NOT NULL,
    "amount" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KWD',
    "issueDate" TEXT NOT NULL,
    "expiryDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'issued',
    "utilizationAmount" TEXT NOT NULL DEFAULT '0',
    "documentsRequired" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "letters_of_credit_companySlug_fkey" FOREIGN KEY ("companySlug") REFERENCES "companies" ("slug") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "letters_of_credit_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "letters_of_credit_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ── LandedCostLine (تفاصيل تكلفة الاستيراد) ──────────────────────────────
-- Depends on: landed_cost_allocations

CREATE TABLE "landed_cost_lines" (
    "id" SERIAL PRIMARY KEY,
    "allocationId" INTEGER NOT NULL,
    "inventoryItemId" INTEGER,
    "productId" INTEGER,
    "allocatedCost" TEXT NOT NULL,
    "baseQuantity" TEXT,
    "baseValue" TEXT,
    "productCatalogId" INTEGER,

    CONSTRAINT "landed_cost_lines_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "landed_cost_allocations" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "landed_cost_lines_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "landed_cost_lines_productCatalogId_fkey" FOREIGN KEY ("productCatalogId") REFERENCES "product_catalog" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- ──────────────────────────────────────────────────────────────────────────────
-- Step 3 — Add FK constraints for new columns on existing tables
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_costCenterId_fkey"
    FOREIGN KEY ("costCenterId") REFERENCES "cost_centers" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reversedById_fkey"
    FOREIGN KEY ("reversedById") REFERENCES "journal_entries" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ──────────────────────────────────────────────────────────────────────────────
-- Step 4 — CREATE indexes (unique constraints + regular indexes)
-- ──────────────────────────────────────────────────────────────────────────────

-- ── Indexes for columns added to existing tables ────────────────────────────

CREATE INDEX "journal_entry_lines_costCenterId_idx" ON "journal_entry_lines" ("costCenterId");
CREATE INDEX "journal_entries_reversedById_idx" ON "journal_entries" ("reversedById");

-- ── fiscal_periods ──────────────────────────────────────────────────────────

CREATE UNIQUE INDEX "fiscal_periods_companySlug_name_key" ON "fiscal_periods" ("companySlug", "name");
CREATE INDEX "fiscal_periods_companySlug_startDate_idx" ON "fiscal_periods" ("companySlug", "startDate");
CREATE INDEX "fiscal_periods_companySlug_status_idx" ON "fiscal_periods" ("companySlug", "status");

-- ── cost_centers ────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX "cost_centers_companySlug_code_key" ON "cost_centers" ("companySlug", "code");
CREATE INDEX "cost_centers_companySlug_idx" ON "cost_centers" ("companySlug");

-- ── bank_accounts ───────────────────────────────────────────────────────────

CREATE INDEX "bank_accounts_companySlug_idx" ON "bank_accounts" ("companySlug");
CREATE INDEX "bank_accounts_companySlug_currency_idx" ON "bank_accounts" ("companySlug", "currency");

-- ── bank_transactions ───────────────────────────────────────────────────────

CREATE INDEX "bank_transactions_companySlug_date_idx" ON "bank_transactions" ("companySlug", "date");
CREATE INDEX "bank_transactions_bankAccountId_idx" ON "bank_transactions" ("bankAccountId");
CREATE INDEX "bank_transactions_companySlug_isReconciled_idx" ON "bank_transactions" ("companySlug", "isReconciled");

-- ── bank_reconciliations ────────────────────────────────────────────────────

CREATE INDEX "bank_reconciliations_companySlug_periodEnd_idx" ON "bank_reconciliations" ("companySlug", "periodEnd");
CREATE INDEX "bank_reconciliations_bankAccountId_idx" ON "bank_reconciliations" ("bankAccountId");

-- ── post_dated_checks ───────────────────────────────────────────────────────

CREATE INDEX "post_dated_checks_companySlug_dueDate_idx" ON "post_dated_checks" ("companySlug", "dueDate");
CREATE INDEX "post_dated_checks_companySlug_status_idx" ON "post_dated_checks" ("companySlug", "status");
CREATE INDEX "post_dated_checks_companySlug_direction_idx" ON "post_dated_checks" ("companySlug", "direction");

-- ── fixed_assets ────────────────────────────────────────────────────────────

CREATE INDEX "fixed_assets_companySlug_idx" ON "fixed_assets" ("companySlug");
CREATE INDEX "fixed_assets_companySlug_category_idx" ON "fixed_assets" ("companySlug", "category");
CREATE INDEX "fixed_assets_companySlug_isActive_idx" ON "fixed_assets" ("companySlug", "isActive");

-- ── depreciation_entries ────────────────────────────────────────────────────

CREATE UNIQUE INDEX "depreciation_entries_assetId_period_key" ON "depreciation_entries" ("assetId", "period");
CREATE INDEX "depreciation_entries_companySlug_period_idx" ON "depreciation_entries" ("companySlug", "period");

-- ── payment_vouchers ────────────────────────────────────────────────────────

CREATE UNIQUE INDEX "payment_vouchers_companySlug_voucherNumber_key" ON "payment_vouchers" ("companySlug", "voucherNumber");
CREATE INDEX "payment_vouchers_companySlug_date_idx" ON "payment_vouchers" ("companySlug", "date");
CREATE INDEX "payment_vouchers_companySlug_voucherType_idx" ON "payment_vouchers" ("companySlug", "voucherType");

-- ── quotations ──────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX "quotations_companySlug_quotationNumber_key" ON "quotations" ("companySlug", "quotationNumber");
CREATE INDEX "quotations_companySlug_date_idx" ON "quotations" ("companySlug", "date");
CREATE INDEX "quotations_companySlug_status_idx" ON "quotations" ("companySlug", "status");

-- ── purchase_orders ─────────────────────────────────────────────────────────

CREATE UNIQUE INDEX "purchase_orders_companySlug_poNumber_key" ON "purchase_orders" ("companySlug", "poNumber");
CREATE INDEX "purchase_orders_companySlug_date_idx" ON "purchase_orders" ("companySlug", "date");
CREATE INDEX "purchase_orders_companySlug_status_idx" ON "purchase_orders" ("companySlug", "status");

-- ── budgets ─────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX "budgets_companySlug_periodName_accountId_costCenterId_key" ON "budgets" ("companySlug", "periodName", "accountId", "costCenterId");
CREATE INDEX "budgets_companySlug_fiscalYear_idx" ON "budgets" ("companySlug", "fiscalYear");
CREATE INDEX "budgets_accountId_idx" ON "budgets" ("accountId");

-- ── letters_of_credit ───────────────────────────────────────────────────────

CREATE UNIQUE INDEX "letters_of_credit_companySlug_lcNumber_key" ON "letters_of_credit" ("companySlug", "lcNumber");
CREATE INDEX "letters_of_credit_companySlug_expiryDate_idx" ON "letters_of_credit" ("companySlug", "expiryDate");
CREATE INDEX "letters_of_credit_supplierId_idx" ON "letters_of_credit" ("supplierId");

-- ── landed_cost_allocations ────────────────────────────────────────────────

CREATE INDEX "landed_cost_allocations_companySlug_idx" ON "landed_cost_allocations" ("companySlug");
CREATE INDEX "landed_cost_allocations_purchaseInvoiceId_idx" ON "landed_cost_allocations" ("purchaseInvoiceId");

-- ── landed_cost_lines ──────────────────────────────────────────────────────

CREATE INDEX "landed_cost_lines_allocationId_idx" ON "landed_cost_lines" ("allocationId");

-- ── fx_revaluations ─────────────────────────────────────────────────────────

CREATE INDEX "fx_revaluations_companySlug_period_idx" ON "fx_revaluations" ("companySlug", "period");

-- ── inter_company_transactions ──────────────────────────────────────────────

CREATE INDEX "inter_company_transactions_companySlugFrom_idx" ON "inter_company_transactions" ("companySlugFrom");
CREATE INDEX "inter_company_transactions_companySlugTo_idx" ON "inter_company_transactions" ("companySlugTo");
CREATE INDEX "inter_company_transactions_companySlugFrom_companySlugTo_status_idx" ON "inter_company_transactions" ("companySlugFrom", "companySlugTo", "status");

-- ── wps_files ───────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX "wps_files_companySlug_country_month_key" ON "wps_files" ("companySlug", "country", "month");
CREATE INDEX "wps_files_companySlug_month_idx" ON "wps_files" ("companySlug", "month");

-- ── tax_filings ─────────────────────────────────────────────────────────────

CREATE INDEX "tax_filings_companySlug_country_taxType_idx" ON "tax_filings" ("companySlug", "country", "taxType");
CREATE INDEX "tax_filings_companySlug_periodTo_idx" ON "tax_filings" ("companySlug", "periodTo");

-- ── accounting_audit_logs ───────────────────────────────────────────────────

CREATE INDEX "accounting_audit_logs_companySlug_idx" ON "accounting_audit_logs" ("companySlug");
CREATE INDEX "accounting_audit_logs_companySlug_entity_entityId_idx" ON "accounting_audit_logs" ("companySlug", "entity", "entityId");
CREATE INDEX "accounting_audit_logs_companySlug_createdAt_idx" ON "accounting_audit_logs" ("companySlug", "createdAt");

-- ── opening_balance_entries ─────────────────────────────────────────────────

CREATE UNIQUE INDEX "opening_balance_entries_companySlug_accountId_asOfDate_key" ON "opening_balance_entries" ("companySlug", "accountId", "asOfDate");
CREATE INDEX "opening_balance_entries_companySlug_asOfDate_idx" ON "opening_balance_entries" ("companySlug", "asOfDate");
