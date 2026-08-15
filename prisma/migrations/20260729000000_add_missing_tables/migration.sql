-- Add 10 missing tables that are referenced by models in schema.prisma
-- but were never created by previous migrations.
--
-- These tables correspond to models: Supplier, InstallmentSchedule,
-- ProfitDistribution, ProfitDistributionEntry, LetterOfCreditDocument,
-- BudgetLine, RefundTransaction, ZatcaCertificate, SubscriptionSchedule, Post.
--
-- All use CREATE TABLE IF NOT EXISTS so this migration is idempotent
-- and safe to run on databases that may already have some of these tables.

-- ─── suppliers ──+
-- MOVED to 20260723000000_add_accounting_module (before FK references)

-- ─── installment_schedules ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "installment_schedules" (
    "id" SERIAL PRIMARY KEY,
    "paymentVoucherId" INTEGER NOT NULL,
    "installmentNumber" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" TEXT NOT NULL DEFAULT '0',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "installment_schedules_paymentVoucherId_fkey" FOREIGN KEY ("paymentVoucherId") REFERENCES "payment_vouchers" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- ─── profit_distributions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "profit_distributions" (
    "id" TEXT NOT NULL,
    "companySlug" TEXT NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "totalProfit" TEXT NOT NULL DEFAULT '0',
    "totalDistributed" TEXT NOT NULL DEFAULT '0',
    "distributionType" TEXT NOT NULL DEFAULT 'proportional',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "profit_distributions_pkey" PRIMARY KEY ("id")
);

-- ─── profit_distribution_entries ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "profit_distribution_entries" (
    "id" TEXT NOT NULL,
    "distributionId" TEXT NOT NULL,
    "shareholder" TEXT NOT NULL,
    "shareRatio" TEXT NOT NULL DEFAULT '0',
    "amount" TEXT NOT NULL DEFAULT '0',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "profit_distribution_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "profit_distribution_entries_distributionId_fkey" FOREIGN KEY ("distributionId") REFERENCES "profit_distributions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- ─── letter_of_credit_documents ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "letter_of_credit_documents" (
    "id" TEXT NOT NULL,
    "letterOfCreditId" INTEGER NOT NULL,
    "documentType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "letter_of_credit_documents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "letter_of_credit_documents_letterOfCreditId_fkey" FOREIGN KEY ("letterOfCreditId") REFERENCES "letters_of_credit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- ─── budget_lines ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "budget_lines" (
    "id" TEXT NOT NULL,
    "budgetId" INTEGER NOT NULL,
    "accountId" INTEGER NOT NULL,
    "costCenterId" INTEGER,
    "plannedAmount" TEXT NOT NULL DEFAULT '0',
    "actualAmount" TEXT NOT NULL DEFAULT '0',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "budget_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "budget_lines_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "budget_lines_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ─── refund_transactions ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "refund_transactions" (
    "id" TEXT NOT NULL,
    "originalTransactionId" TEXT,
    "amount" TEXT NOT NULL DEFAULT '0',
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "refund_transactions_pkey" PRIMARY KEY ("id")
);

-- ─── zatca_certificates ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "zatca_certificates" (
    "id" TEXT NOT NULL,
    "companySlug" TEXT NOT NULL,
    "certificateType" TEXT NOT NULL,
    "secret" TEXT,
    "certValidFrom" TIMESTAMP(3),
    "certValidTo" TIMESTAMP(3),
    "csr" TEXT,
    "certificateRequest" TEXT,
    "binarySecurityToken" TEXT,
    "secretBinarySecurityToken" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "zatca_certificates_pkey" PRIMARY KEY ("id")
);

-- ─── subscription_schedules ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "subscription_schedules" (
    "id" TEXT NOT NULL,
    "companySlug" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "amount" TEXT NOT NULL DEFAULT '0',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "billingCycle" TEXT NOT NULL DEFAULT 'monthly',
    "nextBillingDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "subscription_schedules_pkey" PRIMARY KEY ("id")
);

-- ─── posts ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "posts" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "content" TEXT,
    "excerpt" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS "suppliers_companySlug_idx" ON "suppliers"("companySlug");
CREATE INDEX IF NOT EXISTS "installment_schedules_paymentVoucherId_idx" ON "installment_schedules"("paymentVoucherId");
CREATE INDEX IF NOT EXISTS "profit_distributions_companySlug_idx" ON "profit_distributions"("companySlug");
CREATE INDEX IF NOT EXISTS "profit_distribution_entries_distributionId_idx" ON "profit_distribution_entries"("distributionId");
CREATE INDEX IF NOT EXISTS "letter_of_credit_documents_letterOfCreditId_idx" ON "letter_of_credit_documents"("letterOfCreditId");
CREATE INDEX IF NOT EXISTS "budget_lines_budgetId_idx" ON "budget_lines"("budgetId");
CREATE INDEX IF NOT EXISTS "refund_transactions_originalTransactionId_idx" ON "refund_transactions"("originalTransactionId");
CREATE INDEX IF NOT EXISTS "zatca_certificates_companySlug_idx" ON "zatca_certificates"("companySlug");
CREATE INDEX IF NOT EXISTS "subscription_schedules_companySlug_idx" ON "subscription_schedules"("companySlug");
CREATE INDEX IF NOT EXISTS "posts_slug_idx" ON "posts"("slug");
CREATE INDEX IF NOT EXISTS "posts_authorId_idx" ON "posts"("authorId");
