-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "nameAr" TEXT,
    "nameEn" TEXT,
    "password" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "companyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "code" TEXT NOT NULL,
    "slug" TEXT NOT NULL DEFAULT 'default-slug',
    "plan" TEXT NOT NULL DEFAULT 'trial',
    "subscriptionStatus" TEXT NOT NULL DEFAULT 'inactive',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "currencyDecimalPlaces" INTEGER NOT NULL DEFAULT 3,
    "taxId" TEXT,
    "vatNumber" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "country" TEXT,
    "defaultTaxRate" TEXT NOT NULL DEFAULT '0',
    "emoji" TEXT,
    "color" TEXT,
    "trialEndsAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "nameEn" TEXT,
    "type" TEXT NOT NULL,
    "balance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "companySlug" TEXT NOT NULL DEFAULT 'default',
    "parentId" INTEGER,
    "companyId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientCompany" TEXT,
    "code" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "taxId" TEXT,
    "companySlug" TEXT NOT NULL DEFAULT 'default',
    "companyId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "code" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "taxId" TEXT,
    "companySlug" TEXT NOT NULL DEFAULT 'default',
    "companyId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCatalog" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT,
    "sku" TEXT NOT NULL DEFAULT '',
    "code" TEXT,
    "category" TEXT,
    "purchasePrice" TEXT NOT NULL DEFAULT '0.000',
    "sellingPrice" TEXT NOT NULL DEFAULT '0.000',
    "unit" TEXT NOT NULL DEFAULT 'piece',
    "description" TEXT,
    "companySlug" TEXT NOT NULL DEFAULT 'default',
    "companyId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" TEXT NOT NULL DEFAULT '0',
    "reorderLevel" TEXT NOT NULL DEFAULT '0',
    "warehouseId" INTEGER,
    "warehouse" TEXT,
    "batchNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "companySlug" TEXT NOT NULL DEFAULT 'default',
    "companyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "code" TEXT NOT NULL,
    "companySlug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialPeriod" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "companyId" TEXT,
    "companySlug" TEXT NOT NULL DEFAULT 'default',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" SERIAL NOT NULL,
    "companySlug" TEXT NOT NULL DEFAULT 'default',
    "companyId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'posted',
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "sourceType" TEXT,
    "sourceId" INTEGER,
    "createdBy" TEXT,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Voucher" (
    "id" SERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "voucherType" TEXT NOT NULL DEFAULT 'general',
    "bankAccountId" INTEGER,
    "companySlug" TEXT NOT NULL DEFAULT 'default',
    "companyId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Voucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoucherLine" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "debit" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "credit" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "voucherId" INTEGER NOT NULL,

    CONSTRAINT "VoucherLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentVoucher" (
    "id" SERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "voucherNumber" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" TEXT NOT NULL DEFAULT '0.000',
    "paymentType" TEXT NOT NULL DEFAULT 'receipt',
    "voucherType" TEXT,
    "direction" TEXT NOT NULL DEFAULT 'inbound',
    "payee" TEXT,
    "payer" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "description" TEXT,
    "reference" TEXT,
    "clientId" TEXT,
    "supplierId" INTEGER,
    "bankAccountId" INTEGER,
    "companySlug" TEXT NOT NULL DEFAULT 'default',
    "companyId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentVoucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Installment" (
    "id" SERIAL NOT NULL,
    "paymentVoucherId" INTEGER NOT NULL,
    "amount" TEXT NOT NULL DEFAULT '0.000',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paidDate" TIMESTAMP(3),
    "paymentRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Installment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpeningBalance" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "periodId" INTEGER NOT NULL,
    "debit" TEXT NOT NULL DEFAULT '0.000',
    "credit" TEXT NOT NULL DEFAULT '0.000',
    "companySlug" TEXT NOT NULL DEFAULT 'default',
    "companyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpeningBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfitDistribution" (
    "id" SERIAL NOT NULL,
    "periodId" INTEGER,
    "totalProfit" TEXT NOT NULL DEFAULT '0.000',
    "retained" TEXT NOT NULL DEFAULT '0.000',
    "distributed" TEXT NOT NULL DEFAULT '0.000',
    "distributionType" TEXT NOT NULL DEFAULT 'proportional',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "notes" TEXT,
    "companySlug" TEXT NOT NULL DEFAULT 'default',
    "companyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfitDistribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfitDistributionEntry" (
    "id" SERIAL NOT NULL,
    "distributionId" INTEGER NOT NULL,
    "shareholder" TEXT NOT NULL,
    "shareRatio" TEXT NOT NULL DEFAULT '0',
    "amount" TEXT NOT NULL DEFAULT '0.000',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfitDistributionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LetterOfCredit" (
    "id" SERIAL NOT NULL,
    "lcNumber" TEXT NOT NULL,
    "number" TEXT,
    "type" TEXT NOT NULL DEFAULT 'import',
    "amount" TEXT NOT NULL DEFAULT '0.000',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "issueDate" TEXT,
    "expiryDate" TEXT,
    "beneficiary" TEXT,
    "issuingBank" TEXT,
    "description" TEXT,
    "reference" TEXT,
    "supplierId" INTEGER,
    "bankAccountId" INTEGER,
    "companySlug" TEXT NOT NULL DEFAULT 'default',
    "companyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LetterOfCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LetterOfCreditDocument" (
    "id" SERIAL NOT NULL,
    "letterOfCreditId" INTEGER NOT NULL,
    "documentType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LetterOfCreditDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIRequestLog" (
    "id" SERIAL NOT NULL,
    "companySlug" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "resolvedBy" TEXT NOT NULL,
    "provider" TEXT,
    "tokensUsed" INTEGER,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIRequestLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CacheEntry" (
    "key" TEXT NOT NULL,
    "companySlug" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "hitCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CacheEntry_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AIMemoryEntry" (
    "id" SERIAL NOT NULL,
    "companySlug" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "lastAccessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIMemoryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetConfig" (
    "companySlug" TEXT NOT NULL,
    "monthlyBudgetUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentSpendUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "alertThresholdPct" INTEGER NOT NULL DEFAULT 80,
    "hardStopEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetConfig_pkey" PRIMARY KEY ("companySlug")
);

-- CreateTable
CREATE TABLE "CompanyRuntime" (
    "id" SERIAL NOT NULL,
    "companyId" TEXT NOT NULL,
    "workerPoolSize" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'active',
    "slaTier" TEXT,
    "maxAcceptableLatencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyRuntime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" SERIAL NOT NULL,
    "userUid" TEXT NOT NULL,
    "companySlug" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'general',
    "title" TEXT NOT NULL,
    "body" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobQueue" (
    "id" SERIAL NOT NULL,
    "queue" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "data" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderConfig" (
    "taskType" TEXT NOT NULL,
    "primaryProvider" TEXT NOT NULL,
    "fallbackProvider" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderConfig_pkey" PRIMARY KEY ("taskType")
);

-- CreateTable
CREATE TABLE "RuleCandidate" (
    "id" SERIAL NOT NULL,
    "companySlug" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "patternSignature" TEXT NOT NULL,
    "sampleCount" INTEGER NOT NULL DEFAULT 1,
    "consistentOutput" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "status" TEXT NOT NULL DEFAULT 'observing',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RuleCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalPattern" (
    "patternKey" TEXT NOT NULL,
    "suggestedSku" TEXT,
    "suggestedVatCategory" TEXT,
    "suggestedCategory" TEXT,
    "contributingCompaniesCount" INTEGER NOT NULL DEFAULT 1,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalPattern_pkey" PRIMARY KEY ("patternKey")
);

-- CreateTable
CREATE TABLE "ProfitSnapshot" (
    "id" SERIAL NOT NULL,
    "companySlug" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "revenueUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "infraCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "aiCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "workerCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "profitUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfitSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIScoreSnapshot" (
    "id" SERIAL NOT NULL,
    "companySlug" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "cacheHitPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ruleHitPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "aiCallPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgCostPerRequest" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIScoreSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompiledRule" (
    "id" SERIAL NOT NULL,
    "companySlug" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "clusterKey" TEXT NOT NULL,
    "compiledOutput" TEXT,
    "sourceCandidateCount" INTEGER NOT NULL DEFAULT 0,
    "estimatedAnnualSavingsUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending_review',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompiledRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" SERIAL NOT NULL,
    "companySlug" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "clientId" TEXT,
    "clientName" TEXT,
    "clientEmail" TEXT,
    "clientPhone" TEXT,
    "clientAddress" TEXT,
    "issueDate" TEXT NOT NULL,
    "dueDate" TEXT,
    "subtotal" TEXT NOT NULL DEFAULT '0',
    "taxRate" TEXT NOT NULL DEFAULT '0',
    "taxAmount" TEXT NOT NULL DEFAULT '0',
    "total" TEXT NOT NULL DEFAULT '0',
    "shipping" TEXT NOT NULL DEFAULT '0',
    "discount" TEXT NOT NULL DEFAULT '0',
    "paid" TEXT NOT NULL DEFAULT '0',
    "lineItems" TEXT,
    "createdByEmail" TEXT,
    "createdByName" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "source" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureFlag" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "plans" TEXT NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSettings" (
    "key" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "valueType" TEXT NOT NULL DEFAULT 'string',
    "value" TEXT NOT NULL DEFAULT '',
    "updatedBy" TEXT NOT NULL DEFAULT 'system',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "PlatformSettingsHistory" (
    "id" SERIAL NOT NULL,
    "settingKey" TEXT NOT NULL,
    "newValue" TEXT NOT NULL DEFAULT '',
    "changedBy" TEXT NOT NULL DEFAULT 'system',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformSettingsHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppUser" (
    "uid" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT 'employee',
    "companies" TEXT NOT NULL DEFAULT '[]',
    "permissions" TEXT NOT NULL DEFAULT '{}',
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppUser_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "ProductAlias" (
    "id" SERIAL NOT NULL,
    "productCatalogId" INTEGER NOT NULL,
    "companySlug" TEXT NOT NULL DEFAULT 'default',
    "alias" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductMatchAudit" (
    "id" SERIAL NOT NULL,
    "companySlug" TEXT NOT NULL DEFAULT 'default',
    "invoiceId" INTEGER,
    "inputText" TEXT NOT NULL,
    "matchedProductId" INTEGER,
    "matchedAlias" TEXT,
    "tier" TEXT NOT NULL DEFAULT 'auto-match',
    "action" TEXT NOT NULL DEFAULT 'auto-matched',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "resolvedBy" TEXT,
    "isUndone" BOOLEAN NOT NULL DEFAULT false,
    "undoneBy" TEXT,
    "undoneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductMatchAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchOverride" (
    "id" SERIAL NOT NULL,
    "companySlug" TEXT NOT NULL,
    "inputText" TEXT NOT NULL,
    "inputNormalized" TEXT,
    "fromProductId" INTEGER,
    "toProductId" INTEGER,
    "chosenAlias" TEXT,
    "auditId" INTEGER,
    "reason" TEXT,
    "overriddenBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" SERIAL NOT NULL,
    "companySlug" TEXT NOT NULL DEFAULT 'default',
    "productId" INTEGER NOT NULL,
    "quantity" TEXT NOT NULL DEFAULT '0',
    "movementType" TEXT NOT NULL DEFAULT 'adjustment',
    "sourceType" TEXT,
    "sourceId" TEXT,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "companySlug" TEXT NOT NULL DEFAULT 'default',
    "companyId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "phone" TEXT,
    "position" TEXT,
    "department" TEXT,
    "joinDate" TEXT,
    "baseSalary" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'KWD',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HRAttendance" (
    "id" SERIAL NOT NULL,
    "companySlug" TEXT NOT NULL DEFAULT 'default',
    "employeeId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'present',
    "checkIn" TEXT,
    "checkOut" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HRAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HRSalary" (
    "id" SERIAL NOT NULL,
    "companySlug" TEXT NOT NULL DEFAULT 'default',
    "employeeId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "baseSalary" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "allowances" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "deductions" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "bonus" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "netSalary" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HRSalary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "labelAr" TEXT,
    "labelEn" TEXT,
    "category" TEXT NOT NULL DEFAULT 'general',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Module" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "settings" TEXT NOT NULL DEFAULT '{}',
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Module_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "companySlug" TEXT NOT NULL DEFAULT 'default',
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "userId" TEXT,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIUsageLog" (
    "id" SERIAL NOT NULL,
    "companySlug" TEXT NOT NULL,
    "endpoint" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "estimatedCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "processingMs" INTEGER NOT NULL DEFAULT 0,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" SERIAL NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "bankName" TEXT,
    "branch" TEXT,
    "iban" TEXT,
    "swiftCode" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "balance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "accountType" TEXT NOT NULL DEFAULT 'checking',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "companyId" TEXT,
    "companySlug" TEXT NOT NULL DEFAULT 'default',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedAsset" (
    "id" SERIAL NOT NULL,
    "assetCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "purchaseDate" TIMESTAMP(3) NOT NULL,
    "purchaseCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "salvageValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "usefulLifeYears" INTEGER NOT NULL DEFAULT 5,
    "depreciationMethod" TEXT NOT NULL DEFAULT 'straight_line',
    "accumulatedDep" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "netBookValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "companyId" TEXT,
    "companySlug" TEXT NOT NULL DEFAULT 'default',
    "glAccountId" INTEGER,
    "depAccountId" INTEGER,
    "expAccountId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixedAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntryLine" (
    "id" SERIAL NOT NULL,
    "journalEntryId" INTEGER NOT NULL,
    "accountId" INTEGER NOT NULL,
    "debit" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "credit" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "description" TEXT,
    "lineOrder" INTEGER NOT NULL DEFAULT 0,
    "companyId" TEXT,
    "companySlug" TEXT NOT NULL DEFAULT 'default',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalEntryLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpeningBalanceEntry" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "periodId" INTEGER NOT NULL,
    "debit" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "credit" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "companyId" TEXT,
    "companySlug" TEXT NOT NULL DEFAULT 'default',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpeningBalanceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "periodId" INTEGER,
    "fiscalYear" TEXT NOT NULL,
    "accountId" INTEGER NOT NULL,
    "plannedAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "actualAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "variance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "companyId" TEXT,
    "companySlug" TEXT NOT NULL DEFAULT 'default',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quotation" (
    "id" SERIAL NOT NULL,
    "quotationNumber" TEXT NOT NULL,
    "clientId" TEXT,
    "clientName" TEXT,
    "issueDate" TEXT NOT NULL,
    "expiryDate" TEXT,
    "subtotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "taxRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "total" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "lineItems" TEXT,
    "companyId" TEXT,
    "companySlug" TEXT NOT NULL DEFAULT 'default',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" SERIAL NOT NULL,
    "poNumber" TEXT NOT NULL,
    "supplierId" INTEGER,
    "orderDate" TEXT NOT NULL,
    "expectedDate" TEXT,
    "subtotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "taxRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "total" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "lineItems" TEXT,
    "companyId" TEXT,
    "companySlug" TEXT NOT NULL DEFAULT 'default',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseInvoice" (
    "id" SERIAL NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "supplierId" INTEGER,
    "invoiceDate" TEXT NOT NULL,
    "dueDate" TEXT,
    "subtotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "taxRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "total" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "lineItems" TEXT,
    "companyId" TEXT,
    "companySlug" TEXT NOT NULL DEFAULT 'default',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionRegistry" (
    "id" TEXT NOT NULL,
    "userUid" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionRegistry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "headers" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalPeriod" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "companyId" TEXT,
    "companySlug" TEXT NOT NULL DEFAULT 'default',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EInvoice" (
    "id" SERIAL NOT NULL,
    "authorityType" TEXT NOT NULL,
    "submissionStatus" TEXT NOT NULL DEFAULT 'pending',
    "uuid" TEXT,
    "rawXml" TEXT,
    "invoiceId" INTEGER,
    "companySlug" TEXT NOT NULL DEFAULT 'default',
    "companyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZatcaCertificate" (
    "id" SERIAL NOT NULL,
    "companySlug" TEXT NOT NULL DEFAULT 'default',
    "companyId" TEXT,
    "certificateType" TEXT NOT NULL,
    "certificateDataEnc" BYTEA NOT NULL,
    "privateKeyDataEnc" BYTEA NOT NULL,
    "serialNumber" TEXT,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZatcaCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MFASecret" (
    "id" TEXT NOT NULL,
    "userUid" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "recoveryCodes" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MFASecret_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" SERIAL NOT NULL,
    "userEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "companySlug" TEXT,
    "assignedTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentTransaction" (
    "id" SERIAL NOT NULL,
    "companySlug" TEXT NOT NULL DEFAULT 'default',
    "companyId" TEXT,
    "invoiceId" INTEGER,
    "provider" TEXT NOT NULL,
    "providerPaymentId" TEXT,
    "providerEventId" TEXT,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIModelRegistry" (
    "id" SERIAL NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "capabilities" TEXT NOT NULL DEFAULT '[]',
    "tier" TEXT NOT NULL DEFAULT 'free',
    "costPer1kIn" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "costPer1kOut" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "maxTokens" INTEGER NOT NULL DEFAULT 4096,
    "contextWindow" INTEGER NOT NULL DEFAULT 8192,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "healthScore" DECIMAL(65,30) DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIModelRegistry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIBenchmarkResult" (
    "id" SERIAL NOT NULL,
    "modelRegistryId" INTEGER NOT NULL,
    "capability" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "responseQuality" DECIMAL(65,30) DEFAULT 0,
    "responseSample" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIBenchmarkResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIFabricCacheEntry" (
    "id" SERIAL NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "cacheValue" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIFabricCacheEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRule" (
    "id" SERIAL NOT NULL,
    "companySlug" TEXT NOT NULL DEFAULT 'default',
    "name" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "condition" TEXT NOT NULL DEFAULT '{}',
    "actions" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationExecutionLog" (
    "id" SERIAL NOT NULL,
    "ruleId" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "triggerData" TEXT,
    "error" TEXT,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationExecutionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEndpoint" (
    "id" SERIAL NOT NULL,
    "companySlug" TEXT NOT NULL DEFAULT 'default',
    "url" TEXT NOT NULL,
    "events" TEXT NOT NULL DEFAULT '[]',
    "secret" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" SERIAL NOT NULL,
    "endpointId" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceBrainHeaderMap" (
    "id" SERIAL NOT NULL,
    "headerFingerprint" TEXT NOT NULL,
    "mapping" TEXT NOT NULL,
    "sampleCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceBrainHeaderMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceBrainTemplate" (
    "id" SERIAL NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "fields" TEXT NOT NULL,
    "sampleCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceBrainTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceTemplate" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "layout" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceTemplateSettings" (
    "id" SERIAL NOT NULL,
    "companySlug" TEXT NOT NULL,
    "templateId" TEXT,
    "primaryColor" TEXT DEFAULT '#1f2937',
    "fontFamily" TEXT DEFAULT 'Inter, sans-serif',
    "fontSize" INTEGER NOT NULL DEFAULT 12,
    "showLogo" BOOLEAN NOT NULL DEFAULT true,
    "logoPosition" TEXT DEFAULT 'right',
    "showPaymentInfo" BOOLEAN NOT NULL DEFAULT true,
    "showStamp" BOOLEAN NOT NULL DEFAULT false,
    "invoiceTypes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceTemplateSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostCenter" (
    "id" SERIAL NOT NULL,
    "companySlug" TEXT NOT NULL DEFAULT 'default',
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "parentId" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostCenter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepreciationEntry" (
    "id" SERIAL NOT NULL,
    "companySlug" TEXT NOT NULL DEFAULT 'default',
    "assetId" INTEGER NOT NULL,
    "period" TEXT NOT NULL,
    "depreciationAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "bookValueAfter" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepreciationEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FxRevaluation" (
    "id" SERIAL NOT NULL,
    "companySlug" TEXT NOT NULL DEFAULT 'default',
    "fromCurrency" TEXT NOT NULL,
    "toCurrency" TEXT NOT NULL,
    "rate" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "realizedGain" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "realizedLoss" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "unrealizedGain" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "unrealizedLoss" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FxRevaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterCompanyTransaction" (
    "id" SERIAL NOT NULL,
    "companySlugFrom" TEXT NOT NULL,
    "companySlugTo" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "description" TEXT,
    "journalEntryIdFrom" INTEGER,
    "journalEntryIdTo" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterCompanyTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LandedCostAllocation" (
    "id" SERIAL NOT NULL,
    "companySlug" TEXT NOT NULL DEFAULT 'default',
    "purchaseInvoiceId" INTEGER,
    "costType" TEXT NOT NULL,
    "totalCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "allocationMethod" TEXT NOT NULL DEFAULT 'quantity',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LandedCostAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LandedCostLine" (
    "id" SERIAL NOT NULL,
    "allocationId" INTEGER NOT NULL,
    "inventoryItemId" INTEGER,
    "productId" INTEGER,
    "allocatedCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "baseQuantity" DECIMAL(65,30) DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LandedCostLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallmentSchedule" (
    "id" SERIAL NOT NULL,
    "companySlug" TEXT NOT NULL DEFAULT 'default',
    "invoiceId" INTEGER,
    "totalAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstallmentSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Company_code_key" ON "Company"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Account_code_companySlug_key" ON "Account"("code", "companySlug");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_code_companySlug_key" ON "Supplier"("code", "companySlug");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_warehouseId_productId_key" ON "InventoryItem"("warehouseId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_companySlug_code_key" ON "Warehouse"("companySlug", "code");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialPeriod_name_companySlug_key" ON "FinancialPeriod"("name", "companySlug");

-- CreateIndex
CREATE INDEX "JournalEntry_companySlug_status_idx" ON "JournalEntry"("companySlug", "status");

-- CreateIndex
CREATE INDEX "JournalEntry_companySlug_date_idx" ON "JournalEntry"("companySlug", "date");

-- CreateIndex
CREATE INDEX "JournalEntry_sourceType_sourceId_idx" ON "JournalEntry"("sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "Voucher_number_companySlug_key" ON "Voucher"("number", "companySlug");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentVoucher_companySlug_voucherNumber_key" ON "PaymentVoucher"("companySlug", "voucherNumber");

-- CreateIndex
CREATE UNIQUE INDEX "OpeningBalance_accountId_periodId_key" ON "OpeningBalance"("accountId", "periodId");

-- CreateIndex
CREATE UNIQUE INDEX "LetterOfCredit_companySlug_lcNumber_key" ON "LetterOfCredit"("companySlug", "lcNumber");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyRuntime_companyId_key" ON "CompanyRuntime"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "AIScoreSnapshot_companySlug_period_key" ON "AIScoreSnapshot"("companySlug", "period");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureFlag_key_key" ON "FeatureFlag"("key");

-- CreateIndex
CREATE UNIQUE INDEX "AppUser_email_key" ON "AppUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ProductAlias_companySlug_alias_key" ON "ProductAlias"("companySlug", "alias");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_code_companySlug_key" ON "Employee"("code", "companySlug");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Module_identifier_key" ON "Module"("identifier");

-- CreateIndex
CREATE INDEX "JournalEntryLine_journalEntryId_idx" ON "JournalEntryLine"("journalEntryId");

-- CreateIndex
CREATE INDEX "JournalEntryLine_accountId_idx" ON "JournalEntryLine"("accountId");

-- CreateIndex
CREATE INDEX "JournalEntryLine_companySlug_idx" ON "JournalEntryLine"("companySlug");

-- CreateIndex
CREATE UNIQUE INDEX "SessionRegistry_jti_key" ON "SessionRegistry"("jti");

-- CreateIndex
CREATE INDEX "SessionRegistry_userUid_expiresAt_idx" ON "SessionRegistry"("userUid", "expiresAt");

-- CreateIndex
CREATE INDEX "SessionRegistry_expiresAt_idx" ON "SessionRegistry"("expiresAt");

-- CreateIndex
CREATE INDEX "OutboxEvent_status_createdAt_idx" ON "OutboxEvent"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OutboxEvent_aggregateType_aggregateId_idx" ON "OutboxEvent"("aggregateType", "aggregateId");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalPeriod_name_companySlug_key" ON "FiscalPeriod"("name", "companySlug");

-- CreateIndex
CREATE UNIQUE INDEX "EInvoice_uuid_key" ON "EInvoice"("uuid");

-- CreateIndex
CREATE INDEX "EInvoice_companySlug_authorityType_idx" ON "EInvoice"("companySlug", "authorityType");

-- CreateIndex
CREATE INDEX "EInvoice_invoiceId_idx" ON "EInvoice"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "ZatcaCertificate_serialNumber_key" ON "ZatcaCertificate"("serialNumber");

-- CreateIndex
CREATE INDEX "ZatcaCertificate_companySlug_status_idx" ON "ZatcaCertificate"("companySlug", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MFASecret_userUid_key" ON "MFASecret"("userUid");

-- CreateIndex
CREATE INDEX "SupportTicket_status_createdAt_idx" ON "SupportTicket"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicket_userEmail_idx" ON "SupportTicket"("userEmail");

-- CreateIndex
CREATE INDEX "PaymentTransaction_provider_providerPaymentId_idx" ON "PaymentTransaction"("provider", "providerPaymentId");

-- CreateIndex
CREATE INDEX "PaymentTransaction_companySlug_status_idx" ON "PaymentTransaction"("companySlug", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AIModelRegistry_provider_model_key" ON "AIModelRegistry"("provider", "model");

-- CreateIndex
CREATE INDEX "AIBenchmarkResult_modelRegistryId_capability_idx" ON "AIBenchmarkResult"("modelRegistryId", "capability");

-- CreateIndex
CREATE UNIQUE INDEX "AIFabricCacheEntry_cacheKey_key" ON "AIFabricCacheEntry"("cacheKey");

-- CreateIndex
CREATE INDEX "AIFabricCacheEntry_expiresAt_idx" ON "AIFabricCacheEntry"("expiresAt");

-- CreateIndex
CREATE INDEX "AutomationRule_companySlug_isActive_idx" ON "AutomationRule"("companySlug", "isActive");

-- CreateIndex
CREATE INDEX "AutomationExecutionLog_ruleId_createdAt_idx" ON "AutomationExecutionLog"("ruleId", "createdAt");

-- CreateIndex
CREATE INDEX "WebhookEndpoint_companySlug_isActive_idx" ON "WebhookEndpoint"("companySlug", "isActive");

-- CreateIndex
CREATE INDEX "WebhookDelivery_status_nextRetryAt_idx" ON "WebhookDelivery"("status", "nextRetryAt");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceBrainHeaderMap_headerFingerprint_key" ON "InvoiceBrainHeaderMap"("headerFingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceBrainTemplate_fingerprint_key" ON "InvoiceBrainTemplate"("fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceTemplateSettings_companySlug_key" ON "InvoiceTemplateSettings"("companySlug");

-- CreateIndex
CREATE UNIQUE INDEX "CostCenter_companySlug_code_key" ON "CostCenter"("companySlug", "code");

-- CreateIndex
CREATE INDEX "DepreciationEntry_companySlug_period_idx" ON "DepreciationEntry"("companySlug", "period");

-- CreateIndex
CREATE INDEX "DepreciationEntry_assetId_period_idx" ON "DepreciationEntry"("assetId", "period");

-- CreateIndex
CREATE INDEX "FxRevaluation_companySlug_period_idx" ON "FxRevaluation"("companySlug", "period");

-- CreateIndex
CREATE INDEX "InterCompanyTransaction_companySlugFrom_status_idx" ON "InterCompanyTransaction"("companySlugFrom", "status");

-- CreateIndex
CREATE INDEX "InterCompanyTransaction_companySlugTo_status_idx" ON "InterCompanyTransaction"("companySlugTo", "status");

-- CreateIndex
CREATE INDEX "LandedCostAllocation_companySlug_purchaseInvoiceId_idx" ON "LandedCostAllocation"("companySlug", "purchaseInvoiceId");

-- CreateIndex
CREATE INDEX "LandedCostLine_allocationId_idx" ON "LandedCostLine"("allocationId");

-- CreateIndex
CREATE INDEX "LandedCostLine_productId_idx" ON "LandedCostLine"("productId");

-- CreateIndex
CREATE INDEX "InstallmentSchedule_companySlug_invoiceId_idx" ON "InstallmentSchedule"("companySlug", "invoiceId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCatalog" ADD CONSTRAINT "ProductCatalog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ProductCatalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialPeriod" ADD CONSTRAINT "FinancialPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherLine" ADD CONSTRAINT "VoucherLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherLine" ADD CONSTRAINT "VoucherLine_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "Voucher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentVoucher" ADD CONSTRAINT "PaymentVoucher_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentVoucher" ADD CONSTRAINT "PaymentVoucher_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentVoucher" ADD CONSTRAINT "PaymentVoucher_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentVoucher" ADD CONSTRAINT "PaymentVoucher_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installment" ADD CONSTRAINT "Installment_paymentVoucherId_fkey" FOREIGN KEY ("paymentVoucherId") REFERENCES "PaymentVoucher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningBalance" ADD CONSTRAINT "OpeningBalance_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningBalance" ADD CONSTRAINT "OpeningBalance_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "FinancialPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningBalance" ADD CONSTRAINT "OpeningBalance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfitDistribution" ADD CONSTRAINT "ProfitDistribution_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfitDistributionEntry" ADD CONSTRAINT "ProfitDistributionEntry_distributionId_fkey" FOREIGN KEY ("distributionId") REFERENCES "ProfitDistribution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LetterOfCredit" ADD CONSTRAINT "LetterOfCredit_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LetterOfCredit" ADD CONSTRAINT "LetterOfCredit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LetterOfCredit" ADD CONSTRAINT "LetterOfCredit_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LetterOfCreditDocument" ADD CONSTRAINT "LetterOfCreditDocument_letterOfCreditId_fkey" FOREIGN KEY ("letterOfCreditId") REFERENCES "LetterOfCredit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyRuntime" ADD CONSTRAINT "CompanyRuntime_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAlias" ADD CONSTRAINT "ProductAlias_productCatalogId_fkey" FOREIGN KEY ("productCatalogId") REFERENCES "ProductCatalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HRAttendance" ADD CONSTRAINT "HRAttendance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HRSalary" ADD CONSTRAINT "HRSalary_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAsset" ADD CONSTRAINT "FixedAsset_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAsset" ADD CONSTRAINT "FixedAsset_glAccountId_fkey" FOREIGN KEY ("glAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAsset" ADD CONSTRAINT "FixedAsset_depAccountId_fkey" FOREIGN KEY ("depAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAsset" ADD CONSTRAINT "FixedAsset_expAccountId_fkey" FOREIGN KEY ("expAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntryLine" ADD CONSTRAINT "JournalEntryLine_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntryLine" ADD CONSTRAINT "JournalEntryLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningBalanceEntry" ADD CONSTRAINT "OpeningBalanceEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalPeriod" ADD CONSTRAINT "FiscalPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIBenchmarkResult" ADD CONSTRAINT "AIBenchmarkResult_modelRegistryId_fkey" FOREIGN KEY ("modelRegistryId") REFERENCES "AIModelRegistry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationExecutionLog" ADD CONSTRAINT "AutomationExecutionLog_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutomationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "WebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostCenter" ADD CONSTRAINT "CostCenter_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepreciationEntry" ADD CONSTRAINT "DepreciationEntry_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "FixedAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandedCostLine" ADD CONSTRAINT "LandedCostLine_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "LandedCostAllocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
