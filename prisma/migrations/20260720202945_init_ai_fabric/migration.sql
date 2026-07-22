-- CreateTable
CREATE TABLE "app_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "uid" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'employee',
    "companies" TEXT NOT NULL DEFAULT '[]',
    "permissions" TEXT NOT NULL DEFAULT '{}',
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "email_verifications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "token" TEXT,
    "codeHash" TEXT,
    "purpose" TEXT NOT NULL DEFAULT 'email_verify',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_verifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app_users" ("uid") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "companies" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoBase64" TEXT,
    "nameAr" TEXT,
    "emoji" TEXT,
    "color" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "vatNumber" TEXT,
    "commercialRegistration" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'KWD',
    "country" TEXT,
    "timezone" TEXT,
    "defaultTaxRate" TEXT NOT NULL DEFAULT '0',
    "weekendDays" TEXT NOT NULL DEFAULT '[5,6]',
    "ramadanHours" BOOLEAN NOT NULL DEFAULT false,
    "openrouterApiKey" TEXT,
    "openrouterModel" TEXT NOT NULL DEFAULT 'anthropic/claude-3.5-haiku',
    "plan" TEXT NOT NULL DEFAULT 'trial',
    "subscriptionStatus" TEXT NOT NULL DEFAULT 'active',
    "trialEndsAt" DATETIME,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false,
    "whatsappBusinessNumber" TEXT,
    "whatsappPhoneNumberId" TEXT,
    "whatsappAccessTokenEnc" TEXT,
    "whatsappAppSecretEnc" TEXT,
    "whatsappVerifyTokenHash" TEXT,
    "whatsappGreeting" TEXT,
    "whatsappCredentialsUpdatedAt" DATETIME,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "setup_wizard_progress" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companySlug" TEXT NOT NULL,
    "currentStep" INTEGER NOT NULL DEFAULT 1,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "data" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "setup_wizard_progress_companySlug_fkey" FOREIGN KEY ("companySlug") REFERENCES "companies" ("slug") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "clients" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "company" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "companySlug" TEXT NOT NULL,
    "deletedAt" DATETIME,
    "deletedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "clients_companySlug_fkey" FOREIGN KEY ("companySlug") REFERENCES "companies" ("slug") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "invoiceNumber" TEXT NOT NULL,
    "companySlug" TEXT NOT NULL,
    "clientId" INTEGER,
    "clientName" TEXT NOT NULL,
    "clientEmail" TEXT,
    "clientPhone" TEXT,
    "clientAddress" TEXT,
    "issueDate" TEXT NOT NULL,
    "dueDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "lineItems" TEXT NOT NULL DEFAULT '[]',
    "subtotal" TEXT NOT NULL DEFAULT '0',
    "taxRate" TEXT NOT NULL DEFAULT '0',
    "taxAmount" TEXT NOT NULL DEFAULT '0',
    "total" TEXT NOT NULL DEFAULT '0',
    "shipping" TEXT NOT NULL DEFAULT '0',
    "discount" TEXT NOT NULL DEFAULT '0',
    "paid" TEXT NOT NULL DEFAULT '0',
    "notes" TEXT,
    "source" TEXT,
    "createdByEmail" TEXT,
    "createdByName" TEXT,
    "whatsappRawText" TEXT,
    "parsedConfidence" TEXT,
    "journalEntryId" INTEGER,
    "eInvoiceStatus" TEXT,
    "deliveryMethod" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" DATETIME,
    "deletedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "invoices_companySlug_fkey" FOREIGN KEY ("companySlug") REFERENCES "companies" ("slug") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "invoices_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "product_catalog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "aliases" TEXT NOT NULL DEFAULT '[]',
    "purchasePrice" TEXT,
    "sellingPrice" TEXT,
    "wholesalePrice" TEXT,
    "companySlug" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "product_catalog_companySlug_fkey" FOREIGN KEY ("companySlug") REFERENCES "companies" ("slug") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companySlug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "warehouses_companySlug_fkey" FOREIGN KEY ("companySlug") REFERENCES "companies" ("slug") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companySlug" TEXT NOT NULL,
    "warehouseId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" TEXT NOT NULL DEFAULT '0',
    "reorderLevel" TEXT NOT NULL DEFAULT '0',
    "reorderQty" TEXT NOT NULL DEFAULT '0',
    "batchNumber" TEXT,
    "expiryDate" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "inventory_items_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "inventory_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product_catalog" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "inventory_items_companySlug_fkey" FOREIGN KEY ("companySlug") REFERENCES "companies" ("slug") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companySlug" TEXT NOT NULL,
    "productId" INTEGER,
    "warehouseId" INTEGER NOT NULL,
    "qty" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" INTEGER,
    "note" TEXT,
    "createdBy" TEXT NOT NULL DEFAULT 'system',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stock_movements_companySlug_fkey" FOREIGN KEY ("companySlug") REFERENCES "companies" ("slug") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "stock_movements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product_catalog" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "stock_movements_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "purchase_invoices" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "num" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "supplier" TEXT NOT NULL DEFAULT '',
    "companySlug" TEXT NOT NULL,
    "items" TEXT NOT NULL DEFAULT '[]',
    "sourceInvoiceIds" TEXT NOT NULL DEFAULT '[]',
    "totalQty" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    "deletedBy" TEXT,
    CONSTRAINT "purchase_invoices_companySlug_fkey" FOREIGN KEY ("companySlug") REFERENCES "companies" ("slug") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "hr_employees" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companySlug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "position" TEXT,
    "department" TEXT,
    "baseSalary" TEXT NOT NULL DEFAULT '0',
    "allowances" TEXT NOT NULL DEFAULT '0',
    "currency" TEXT NOT NULL DEFAULT 'KWD',
    "joinDate" TEXT,
    "endDate" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "civilId" TEXT,
    "nationality" TEXT,
    "residenceExpiry" TEXT,
    "passportNumber" TEXT,
    "bankAccount" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "hr_employees_companySlug_fkey" FOREIGN KEY ("companySlug") REFERENCES "companies" ("slug") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "hr_attendance" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companySlug" TEXT NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'present',
    "checkIn" TEXT,
    "checkOut" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "hr_attendance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr_employees" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "hr_salaries" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companySlug" TEXT NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "month" TEXT NOT NULL,
    "baseSalary" TEXT NOT NULL DEFAULT '0',
    "allowances" TEXT NOT NULL DEFAULT '0',
    "deductions" TEXT NOT NULL DEFAULT '0',
    "bonus" TEXT NOT NULL DEFAULT '0',
    "netSalary" TEXT NOT NULL DEFAULT '0',
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "hr_salaries_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr_employees" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "hr_commissions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companySlug" TEXT NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'sales',
    "description" TEXT,
    "amount" TEXT NOT NULL DEFAULT '0',
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "hr_commissions_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr_employees" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "hr_leave_requests" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companySlug" TEXT NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'annual',
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "days" INTEGER NOT NULL DEFAULT 1,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "approvedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "hr_leave_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr_employees" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "hr_performance" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companySlug" TEXT NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "period" TEXT NOT NULL,
    "kpiScore" INTEGER,
    "attendScore" INTEGER,
    "teamScore" INTEGER,
    "overallScore" INTEGER,
    "rating" TEXT,
    "strengths" TEXT,
    "improvements" TEXT,
    "reviewerNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "hr_performance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr_employees" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "type" TEXT NOT NULL,
    "parentId" INTEGER,
    "companySlug" TEXT NOT NULL,
    "balance" TEXT NOT NULL DEFAULT '0',
    "currency" TEXT NOT NULL DEFAULT 'KWD',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "accounts_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "accounts" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "accounts_companySlug_fkey" FOREIGN KEY ("companySlug") REFERENCES "companies" ("slug") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" TEXT NOT NULL,
    "description" TEXT,
    "reference" TEXT,
    "companySlug" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sourceType" TEXT,
    "sourceId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "deletedBy" TEXT,
    CONSTRAINT "journal_entries_companySlug_fkey" FOREIGN KEY ("companySlug") REFERENCES "companies" ("slug") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "journal_entry_lines" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "entryId" INTEGER NOT NULL,
    "accountId" INTEGER NOT NULL,
    "debit" TEXT NOT NULL DEFAULT '0',
    "credit" TEXT NOT NULL DEFAULT '0',
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "journal_entry_lines_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "journal_entries" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "journal_entry_lines_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "e_invoices" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "invoiceId" INTEGER NOT NULL,
    "companySlug" TEXT NOT NULL,
    "authorityType" TEXT NOT NULL DEFAULT 'none',
    "submissionStatus" TEXT NOT NULL DEFAULT 'pending',
    "uuid" TEXT,
    "xmlHash" TEXT,
    "signedXml" TEXT,
    "rawXml" TEXT,
    "rejectionReason" TEXT,
    "submittedAt" DATETIME,
    "approvedAt" DATETIME,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastRetryAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "deletedBy" TEXT,
    CONSTRAINT "e_invoices_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "e_invoices_companySlug_fkey" FOREIGN KEY ("companySlug") REFERENCES "companies" ("slug") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "order_deliveries" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "invoiceId" INTEGER,
    "companySlug" TEXT NOT NULL,
    "clientName" TEXT,
    "clientPhone" TEXT,
    "address" TEXT,
    "locationUrl" TEXT,
    "preferredTime" DATETIME,
    "deliveryFee" TEXT NOT NULL DEFAULT '0',
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "driverId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "order_deliveries_companySlug_fkey" FOREIGN KEY ("companySlug") REFERENCES "companies" ("slug") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "order_deliveries_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "order_deliveries_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "app_users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "payment_provider_configs" (
    "provider" TEXT NOT NULL PRIMARY KEY,
    "encryptedCredentials" TEXT,
    "publicConfig" TEXT,
    "credentialsUpdatedAt" DATETIME,
    "updatedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "payment_transactions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companySlug" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "amount" TEXT NOT NULL DEFAULT '0',
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "providerPaymentId" TEXT,
    "providerOrderId" TEXT,
    "providerEventId" TEXT,
    "checkoutUrl" TEXT,
    "failureReason" TEXT,
    "metadata" TEXT,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    "deletedBy" TEXT,
    CONSTRAINT "payment_transactions_companySlug_fkey" FOREIGN KEY ("companySlug") REFERENCES "companies" ("slug") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "payments_vault" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "wrappedKey" TEXT NOT NULL,
    "kdfSalt" TEXT NOT NULL,
    "kdfN" INTEGER NOT NULL DEFAULT 16384,
    "fingerprint" TEXT NOT NULL,
    "algo" TEXT NOT NULL DEFAULT 'aes-256-gcm',
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotatedAt" DATETIME,
    "rotatedBy" TEXT
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "key" TEXT NOT NULL,
    "labelAr" TEXT NOT NULL,
    "labelEn" TEXT,
    "category" TEXT NOT NULL DEFAULT 'general',
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "role" TEXT NOT NULL,
    "permissionKey" TEXT NOT NULL,
    "companySlug" TEXT,
    "value" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "role_permissions_permissionKey_fkey" FOREIGN KEY ("permissionKey") REFERENCES "permissions" ("key") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userEmail" TEXT NOT NULL,
    "userUid" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "companySlug" TEXT,
    "details" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_userUid_fkey" FOREIGN KEY ("userUid") REFERENCES "app_users" ("uid") ON DELETE NO ACTION ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "admin_audit_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "adminEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "changes" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'info',
    "targetPlans" TEXT NOT NULL DEFAULT '[]',
    "startsAt" DATETIME,
    "endsAt" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" INTEGER,
    "userEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ticket_replies" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketId" TEXT NOT NULL,
    "senderEmail" TEXT NOT NULL,
    "senderRole" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ticket_replies_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "platform_settings" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "valueType" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updatedBy" TEXT,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "platform_settings_history" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "settingKey" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "changedBy" TEXT,
    "changedByEmail" TEXT,
    "changedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "platform_settings_history_settingKey_fkey" FOREIGN KEY ("settingKey") REFERENCES "platform_settings" ("key") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "modules" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "version" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "settings" TEXT NOT NULL DEFAULT '{}',
    "installedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "chat_history" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userUid" TEXT NOT NULL,
    "companySlug" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "content" TEXT NOT NULL,
    "functionName" TEXT,
    "functionArgs" TEXT,
    "functionResult" TEXT,
    "tokensUsed" INTEGER,
    "model" TEXT,
    "conversationId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chat_history_userUid_fkey" FOREIGN KEY ("userUid") REFERENCES "app_users" ("uid") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ai_processing_logs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companySlug" TEXT,
    "endpoint" TEXT NOT NULL,
    "model" TEXT,
    "provider" TEXT,
    "ordersCount" INTEGER NOT NULL DEFAULT 0,
    "itemsCount" INTEGER NOT NULL DEFAULT 0,
    "processingMs" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "retried" BOOLEAN NOT NULL DEFAULT false,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_processing_logs_companySlug_fkey" FOREIGN KEY ("companySlug") REFERENCES "companies" ("slug") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companySlug" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseJson" TEXT,
    "status" INTEGER NOT NULL DEFAULT 200,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userUid" TEXT NOT NULL,
    "companySlug" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" DATETIME
);

-- CreateTable
CREATE TABLE "invoice_templates" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companySlug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "layoutType" TEXT NOT NULL DEFAULT 'classic',
    "primaryColor" TEXT NOT NULL DEFAULT '#7c3aed',
    "fontFamily" TEXT NOT NULL DEFAULT 'Cairo',
    "logoPosition" TEXT NOT NULL DEFAULT 'right',
    "showTaxNumber" BOOLEAN NOT NULL DEFAULT true,
    "showQrCode" BOOLEAN NOT NULL DEFAULT false,
    "showBankDetails" BOOLEAN NOT NULL DEFAULT false,
    "footerText" TEXT,
    "termsAndConditions" TEXT,
    "paperSize" TEXT NOT NULL DEFAULT 'A4',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "invoice_templates_companySlug_fkey" FOREIGN KEY ("companySlug") REFERENCES "companies" ("slug") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "invoice_template_settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companySlug" TEXT NOT NULL,
    "templateId" TEXT NOT NULL DEFAULT 'modern',
    "primaryColor" TEXT NOT NULL DEFAULT '#7C3AED',
    "fontFamily" TEXT NOT NULL DEFAULT 'Noto Sans SC',
    "fontSize" INTEGER NOT NULL DEFAULT 12,
    "showLogo" BOOLEAN NOT NULL DEFAULT true,
    "logoPosition" TEXT NOT NULL DEFAULT 'right',
    "showPaymentInfo" BOOLEAN NOT NULL DEFAULT true,
    "showStamp" BOOLEAN NOT NULL DEFAULT false,
    "invoiceTypes" TEXT NOT NULL DEFAULT 'sales,purchase,quote',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "invoice_template_settings_companySlug_fkey" FOREIGN KEY ("companySlug") REFERENCES "companies" ("slug") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ai_usage_logs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companySlug" TEXT,
    "userUid" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCost" REAL NOT NULL DEFAULT 0,
    "processingMs" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "landing_content" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT
);

-- CreateTable
CREATE TABLE "automation_rules" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companySlug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "condition" TEXT NOT NULL DEFAULT '{}',
    "actions" TEXT NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "automation_execution_logs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ruleId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "triggerData" TEXT,
    "error" TEXT,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "automation_execution_logs_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "automation_rules" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ai_memory_notes" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companySlug" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "feature_flags" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "plans" TEXT NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "user_workspace_state" (
    "userUid" TEXT NOT NULL PRIMARY KEY,
    "pinnedViews" TEXT NOT NULL DEFAULT '[]',
    "lastActiveView" TEXT NOT NULL DEFAULT 'dash',
    "widgetOrder" TEXT NOT NULL DEFAULT '[]',
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "invoice_brain_templates" (
    "fingerprint" TEXT NOT NULL PRIMARY KEY,
    "fields" TEXT NOT NULL,
    "sampleCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "invoice_brain_header_maps" (
    "headerFingerprint" TEXT NOT NULL PRIMARY KEY,
    "mapping" TEXT NOT NULL,
    "sampleCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "product_aliases" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "productCatalogId" INTEGER NOT NULL,
    "companySlug" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'unspecified',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "confidence" REAL NOT NULL DEFAULT 1.0,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL DEFAULT 'system',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "product_aliases_productCatalogId_fkey" FOREIGN KEY ("productCatalogId") REFERENCES "product_catalog" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "product_aliases_companySlug_fkey" FOREIGN KEY ("companySlug") REFERENCES "companies" ("slug") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "product_match_audit" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companySlug" TEXT NOT NULL,
    "inputText" TEXT NOT NULL,
    "matchedProductId" INTEGER,
    "matchedAlias" TEXT,
    "confidence" REAL NOT NULL,
    "tier" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "isUndone" BOOLEAN NOT NULL DEFAULT false,
    "undoneBy" TEXT,
    "undoneAt" DATETIME,
    "invoiceId" INTEGER,
    "createdBy" TEXT NOT NULL DEFAULT 'system',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedBy" TEXT,
    "aiReasoning" TEXT,
    "aiModel" TEXT,
    CONSTRAINT "product_match_audit_companySlug_fkey" FOREIGN KEY ("companySlug") REFERENCES "companies" ("slug") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "match_overrides" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companySlug" TEXT NOT NULL,
    "inputText" TEXT NOT NULL,
    "inputNormalized" TEXT NOT NULL,
    "fromProductId" INTEGER,
    "toProductId" INTEGER NOT NULL,
    "chosenAlias" TEXT,
    "auditId" INTEGER,
    "reason" TEXT,
    "overriddenBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "match_overrides_companySlug_fkey" FOREIGN KEY ("companySlug") REFERENCES "companies" ("slug") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "job_queue" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "queue" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lastError" TEXT,
    "lockedAt" DATETIME,
    "lockedBy" TEXT,
    "scheduledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ai_model_registry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "capabilities" TEXT NOT NULL DEFAULT '[]',
    "tier" TEXT NOT NULL DEFAULT 'free',
    "costPer1kIn" REAL NOT NULL DEFAULT 0,
    "costPer1kOut" REAL NOT NULL DEFAULT 0,
    "maxTokens" INTEGER NOT NULL DEFAULT 4096,
    "contextWindow" INTEGER NOT NULL DEFAULT 8192,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isHealthy" BOOLEAN NOT NULL DEFAULT true,
    "healthScore" REAL NOT NULL DEFAULT 0,
    "successRate" REAL NOT NULL DEFAULT 0,
    "avgLatencyMs" INTEGER NOT NULL DEFAULT 0,
    "p95LatencyMs" INTEGER NOT NULL DEFAULT 0,
    "avgQualityScore" REAL NOT NULL DEFAULT 0,
    "totalBenchmarks" INTEGER NOT NULL DEFAULT 0,
    "lastBenchmarkAt" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ai_benchmark_results" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "modelRegistryId" INTEGER NOT NULL,
    "capability" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "responseQuality" REAL NOT NULL DEFAULT 0,
    "responseSample" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_benchmark_results_modelRegistryId_fkey" FOREIGN KEY ("modelRegistryId") REFERENCES "ai_model_registry" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "company_runtimes" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companyId" INTEGER NOT NULL,
    "workerPoolSize" INTEGER NOT NULL DEFAULT 2,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "company_runtimes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ai_request_logs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companySlug" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "resolvedBy" TEXT NOT NULL,
    "provider" TEXT,
    "tokensUsed" INTEGER,
    "costUsd" REAL NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ai_fabric_cache_entries" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "key" TEXT NOT NULL,
    "companySlug" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "hitCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "budget_configs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companySlug" TEXT NOT NULL,
    "monthlyBudgetUsd" REAL NOT NULL,
    "currentSpendUsd" REAL NOT NULL DEFAULT 0,
    "alertThresholdPct" INTEGER NOT NULL DEFAULT 80,
    "hardStopEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "provider_configs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "taskType" TEXT NOT NULL,
    "primaryProvider" TEXT NOT NULL,
    "fallbackProvider" TEXT NOT NULL,
    "costPerRequestUsd" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ai_memory_entries" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companySlug" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAccessedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "profit_snapshots" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companySlug" TEXT NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "revenueUsd" REAL NOT NULL DEFAULT 0,
    "infraCostUsd" REAL NOT NULL DEFAULT 0,
    "aiCostUsd" REAL NOT NULL DEFAULT 0,
    "workerCostUsd" REAL NOT NULL DEFAULT 0,
    "profitUsd" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "app_users_uid_key" ON "app_users"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "app_users_email_key" ON "app_users"("email");

-- CreateIndex
CREATE INDEX "app_users_role_idx" ON "app_users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "email_verifications_token_key" ON "email_verifications"("token");

-- CreateIndex
CREATE INDEX "email_verifications_userId_purpose_createdAt_idx" ON "email_verifications"("userId", "purpose", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "companies_slug_key" ON "companies"("slug");

-- CreateIndex
CREATE INDEX "companies_stripeCustomerId_idx" ON "companies"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "companies_stripeSubscriptionId_idx" ON "companies"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "companies_subscriptionStatus_idx" ON "companies"("subscriptionStatus");

-- CreateIndex
CREATE INDEX "companies_plan_idx" ON "companies"("plan");

-- CreateIndex
CREATE INDEX "companies_deletedAt_idx" ON "companies"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "setup_wizard_progress_companySlug_key" ON "setup_wizard_progress"("companySlug");

-- CreateIndex
CREATE INDEX "clients_companySlug_idx" ON "clients"("companySlug");

-- CreateIndex
CREATE INDEX "clients_companySlug_createdAt_id_idx" ON "clients"("companySlug", "createdAt", "id");

-- CreateIndex
CREATE INDEX "clients_companySlug_deletedAt_idx" ON "clients"("companySlug", "deletedAt");

-- CreateIndex
CREATE INDEX "invoices_companySlug_idx" ON "invoices"("companySlug");

-- CreateIndex
CREATE INDEX "invoices_companySlug_issueDate_idx" ON "invoices"("companySlug", "issueDate");

-- CreateIndex
CREATE INDEX "invoices_companySlug_status_idx" ON "invoices"("companySlug", "status");

-- CreateIndex
CREATE INDEX "invoices_clientId_idx" ON "invoices"("clientId");

-- CreateIndex
CREATE INDEX "invoices_companySlug_createdAt_id_idx" ON "invoices"("companySlug", "createdAt", "id");

-- CreateIndex
CREATE INDEX "invoices_journalEntryId_idx" ON "invoices"("journalEntryId");

-- CreateIndex
CREATE INDEX "invoices_companySlug_eInvoiceStatus_idx" ON "invoices"("companySlug", "eInvoiceStatus");

-- CreateIndex
CREATE INDEX "invoices_companySlug_deletedAt_idx" ON "invoices"("companySlug", "deletedAt");

-- CreateIndex
CREATE INDEX "invoices_companySlug_dueDate_status_idx" ON "invoices"("companySlug", "dueDate", "status");

-- CreateIndex
CREATE INDEX "invoices_invoiceNumber_idx" ON "invoices"("invoiceNumber");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_companySlug_invoiceNumber_key" ON "invoices"("companySlug", "invoiceNumber");

-- CreateIndex
CREATE INDEX "product_catalog_companySlug_idx" ON "product_catalog"("companySlug");

-- CreateIndex
CREATE INDEX "product_catalog_companySlug_createdAt_id_idx" ON "product_catalog"("companySlug", "createdAt", "id");

-- CreateIndex
CREATE INDEX "warehouses_companySlug_idx" ON "warehouses"("companySlug");

-- CreateIndex
CREATE INDEX "warehouses_companySlug_isActive_idx" ON "warehouses"("companySlug", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_companySlug_code_key" ON "warehouses"("companySlug", "code");

-- CreateIndex
CREATE INDEX "inventory_items_companySlug_idx" ON "inventory_items"("companySlug");

-- CreateIndex
CREATE INDEX "inventory_items_productId_idx" ON "inventory_items"("productId");

-- CreateIndex
CREATE INDEX "inventory_items_warehouseId_idx" ON "inventory_items"("warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_warehouseId_productId_key" ON "inventory_items"("warehouseId", "productId");

-- CreateIndex
CREATE INDEX "stock_movements_companySlug_createdAt_idx" ON "stock_movements"("companySlug", "createdAt");

-- CreateIndex
CREATE INDEX "stock_movements_companySlug_productId_idx" ON "stock_movements"("companySlug", "productId");

-- CreateIndex
CREATE INDEX "stock_movements_sourceType_sourceId_idx" ON "stock_movements"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "stock_movements_warehouseId_idx" ON "stock_movements"("warehouseId");

-- CreateIndex
CREATE INDEX "stock_movements_companySlug_idx" ON "stock_movements"("companySlug");

-- CreateIndex
CREATE INDEX "stock_movements_productId_idx" ON "stock_movements"("productId");

-- CreateIndex
CREATE INDEX "purchase_invoices_companySlug_idx" ON "purchase_invoices"("companySlug");

-- CreateIndex
CREATE INDEX "purchase_invoices_companySlug_createdAt_id_idx" ON "purchase_invoices"("companySlug", "createdAt", "id");

-- CreateIndex
CREATE INDEX "purchase_invoices_companySlug_deletedAt_idx" ON "purchase_invoices"("companySlug", "deletedAt");

-- CreateIndex
CREATE INDEX "hr_employees_companySlug_idx" ON "hr_employees"("companySlug");

-- CreateIndex
CREATE INDEX "hr_employees_civilId_idx" ON "hr_employees"("civilId");

-- CreateIndex
CREATE INDEX "hr_employees_companySlug_isActive_idx" ON "hr_employees"("companySlug", "isActive");

-- CreateIndex
CREATE INDEX "hr_attendance_companySlug_idx" ON "hr_attendance"("companySlug");

-- CreateIndex
CREATE INDEX "hr_attendance_employeeId_date_idx" ON "hr_attendance"("employeeId", "date");

-- CreateIndex
CREATE INDEX "hr_attendance_companySlug_date_idx" ON "hr_attendance"("companySlug", "date");

-- CreateIndex
CREATE INDEX "hr_salaries_companySlug_idx" ON "hr_salaries"("companySlug");

-- CreateIndex
CREATE INDEX "hr_salaries_employeeId_month_idx" ON "hr_salaries"("employeeId", "month");

-- CreateIndex
CREATE INDEX "hr_salaries_companySlug_isPaid_idx" ON "hr_salaries"("companySlug", "isPaid");

-- CreateIndex
CREATE INDEX "hr_salaries_companySlug_month_idx" ON "hr_salaries"("companySlug", "month");

-- CreateIndex
CREATE INDEX "hr_commissions_companySlug_idx" ON "hr_commissions"("companySlug");

-- CreateIndex
CREATE INDEX "hr_commissions_employeeId_idx" ON "hr_commissions"("employeeId");

-- CreateIndex
CREATE INDEX "hr_commissions_companySlug_isPaid_idx" ON "hr_commissions"("companySlug", "isPaid");

-- CreateIndex
CREATE INDEX "hr_commissions_companySlug_date_idx" ON "hr_commissions"("companySlug", "date");

-- CreateIndex
CREATE INDEX "hr_leave_requests_companySlug_idx" ON "hr_leave_requests"("companySlug");

-- CreateIndex
CREATE INDEX "hr_leave_requests_employeeId_idx" ON "hr_leave_requests"("employeeId");

-- CreateIndex
CREATE INDEX "hr_leave_requests_companySlug_status_idx" ON "hr_leave_requests"("companySlug", "status");

-- CreateIndex
CREATE INDEX "hr_performance_companySlug_idx" ON "hr_performance"("companySlug");

-- CreateIndex
CREATE INDEX "hr_performance_employeeId_idx" ON "hr_performance"("employeeId");

-- CreateIndex
CREATE INDEX "hr_performance_companySlug_period_idx" ON "hr_performance"("companySlug", "period");

-- CreateIndex
CREATE INDEX "accounts_companySlug_idx" ON "accounts"("companySlug");

-- CreateIndex
CREATE INDEX "accounts_code_idx" ON "accounts"("code");

-- CreateIndex
CREATE INDEX "accounts_parentId_idx" ON "accounts"("parentId");

-- CreateIndex
CREATE INDEX "accounts_companySlug_type_idx" ON "accounts"("companySlug", "type");

-- CreateIndex
CREATE INDEX "accounts_companySlug_isActive_idx" ON "accounts"("companySlug", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_companySlug_code_key" ON "accounts"("companySlug", "code");

-- CreateIndex
CREATE INDEX "journal_entries_companySlug_idx" ON "journal_entries"("companySlug");

-- CreateIndex
CREATE INDEX "journal_entries_companySlug_date_idx" ON "journal_entries"("companySlug", "date");

-- CreateIndex
CREATE INDEX "journal_entries_companySlug_deletedAt_idx" ON "journal_entries"("companySlug", "deletedAt");

-- CreateIndex
CREATE INDEX "journal_entries_companySlug_status_idx" ON "journal_entries"("companySlug", "status");

-- CreateIndex
CREATE INDEX "journal_entries_companySlug_sourceType_sourceId_idx" ON "journal_entries"("companySlug", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "journal_entry_lines_entryId_idx" ON "journal_entry_lines"("entryId");

-- CreateIndex
CREATE INDEX "journal_entry_lines_accountId_idx" ON "journal_entry_lines"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "e_invoices_invoiceId_key" ON "e_invoices"("invoiceId");

-- CreateIndex
CREATE INDEX "e_invoices_invoiceId_idx" ON "e_invoices"("invoiceId");

-- CreateIndex
CREATE INDEX "e_invoices_companySlug_idx" ON "e_invoices"("companySlug");

-- CreateIndex
CREATE INDEX "e_invoices_companySlug_submissionStatus_idx" ON "e_invoices"("companySlug", "submissionStatus");

-- CreateIndex
CREATE INDEX "e_invoices_companySlug_deletedAt_idx" ON "e_invoices"("companySlug", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "order_deliveries_invoiceId_key" ON "order_deliveries"("invoiceId");

-- CreateIndex
CREATE INDEX "order_deliveries_companySlug_idx" ON "order_deliveries"("companySlug");

-- CreateIndex
CREATE INDEX "order_deliveries_companySlug_status_idx" ON "order_deliveries"("companySlug", "status");

-- CreateIndex
CREATE INDEX "order_deliveries_companySlug_preferredTime_idx" ON "order_deliveries"("companySlug", "preferredTime");

-- CreateIndex
CREATE INDEX "order_deliveries_driverId_idx" ON "order_deliveries"("driverId");

-- CreateIndex
CREATE INDEX "payment_transactions_provider_providerPaymentId_idx" ON "payment_transactions"("provider", "providerPaymentId");

-- CreateIndex
CREATE INDEX "payment_transactions_companySlug_idx" ON "payment_transactions"("companySlug");

-- CreateIndex
CREATE INDEX "payment_transactions_companySlug_deletedAt_idx" ON "payment_transactions"("companySlug", "deletedAt");

-- CreateIndex
CREATE INDEX "payment_transactions_companySlug_status_idx" ON "payment_transactions"("companySlug", "status");

-- CreateIndex
CREATE INDEX "payment_transactions_companySlug_createdAt_idx" ON "payment_transactions"("companySlug", "createdAt");

-- CreateIndex
CREATE INDEX "payment_transactions_provider_idx" ON "payment_transactions"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_provider_providerEventId_key" ON "payment_transactions"("provider", "providerEventId");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE INDEX "permissions_category_idx" ON "permissions"("category");

-- CreateIndex
CREATE INDEX "role_permissions_role_idx" ON "role_permissions"("role");

-- CreateIndex
CREATE INDEX "role_permissions_companySlug_idx" ON "role_permissions"("companySlug");

-- CreateIndex
CREATE INDEX "role_permissions_permissionKey_idx" ON "role_permissions"("permissionKey");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_role_permissionKey_companySlug_key" ON "role_permissions"("role", "permissionKey", "companySlug");

-- CreateIndex
CREATE INDEX "audit_logs_companySlug_idx" ON "audit_logs"("companySlug");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_userUid_idx" ON "audit_logs"("userUid");

-- CreateIndex
CREATE INDEX "audit_logs_companySlug_entity_idx" ON "audit_logs"("companySlug", "entity");

-- CreateIndex
CREATE INDEX "audit_logs_companySlug_createdAt_idx" ON "audit_logs"("companySlug", "createdAt");

-- CreateIndex
CREATE INDEX "admin_audit_logs_createdAt_idx" ON "admin_audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "admin_audit_logs_adminEmail_idx" ON "admin_audit_logs"("adminEmail");

-- CreateIndex
CREATE INDEX "admin_audit_logs_action_idx" ON "admin_audit_logs"("action");

-- CreateIndex
CREATE INDEX "admin_audit_logs_targetType_idx" ON "admin_audit_logs"("targetType");

-- CreateIndex
CREATE INDEX "announcements_isActive_startsAt_idx" ON "announcements"("isActive", "startsAt");

-- CreateIndex
CREATE INDEX "support_tickets_status_idx" ON "support_tickets"("status");

-- CreateIndex
CREATE INDEX "support_tickets_tenantId_idx" ON "support_tickets"("tenantId");

-- CreateIndex
CREATE INDEX "support_tickets_userEmail_idx" ON "support_tickets"("userEmail");

-- CreateIndex
CREATE INDEX "support_tickets_createdAt_idx" ON "support_tickets"("createdAt");

-- CreateIndex
CREATE INDEX "support_tickets_status_createdAt_idx" ON "support_tickets"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ticket_replies_ticketId_idx" ON "ticket_replies"("ticketId");

-- CreateIndex
CREATE INDEX "platform_settings_category_idx" ON "platform_settings"("category");

-- CreateIndex
CREATE INDEX "platform_settings_history_settingKey_idx" ON "platform_settings_history"("settingKey");

-- CreateIndex
CREATE INDEX "platform_settings_history_changedAt_idx" ON "platform_settings_history"("changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "modules_identifier_key" ON "modules"("identifier");

-- CreateIndex
CREATE INDEX "modules_isActive_idx" ON "modules"("isActive");

-- CreateIndex
CREATE INDEX "chat_history_userUid_createdAt_idx" ON "chat_history"("userUid", "createdAt");

-- CreateIndex
CREATE INDEX "chat_history_companySlug_createdAt_idx" ON "chat_history"("companySlug", "createdAt");

-- CreateIndex
CREATE INDEX "chat_history_userUid_conversationId_createdAt_idx" ON "chat_history"("userUid", "conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_processing_logs_companySlug_createdAt_idx" ON "ai_processing_logs"("companySlug", "createdAt");

-- CreateIndex
CREATE INDEX "ai_processing_logs_endpoint_createdAt_idx" ON "ai_processing_logs"("endpoint", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_companySlug_endpoint_key_key" ON "idempotency_keys"("companySlug", "endpoint", "key");

-- CreateIndex
CREATE INDEX "notifications_userUid_isRead_idx" ON "notifications"("userUid", "isRead");

-- CreateIndex
CREATE INDEX "notifications_userUid_createdAt_idx" ON "notifications"("userUid", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_companySlug_idx" ON "notifications"("companySlug");

-- CreateIndex
CREATE INDEX "invoice_templates_companySlug_idx" ON "invoice_templates"("companySlug");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_template_settings_companySlug_key" ON "invoice_template_settings"("companySlug");

-- CreateIndex
CREATE INDEX "ai_usage_logs_companySlug_createdAt_idx" ON "ai_usage_logs"("companySlug", "createdAt");

-- CreateIndex
CREATE INDEX "ai_usage_logs_userUid_createdAt_idx" ON "ai_usage_logs"("userUid", "createdAt");

-- CreateIndex
CREATE INDEX "ai_usage_logs_endpoint_createdAt_idx" ON "ai_usage_logs"("endpoint", "createdAt");

-- CreateIndex
CREATE INDEX "automation_rules_companySlug_idx" ON "automation_rules"("companySlug");

-- CreateIndex
CREATE INDEX "automation_rules_trigger_idx" ON "automation_rules"("trigger");

-- CreateIndex
CREATE INDEX "automation_rules_companySlug_isActive_idx" ON "automation_rules"("companySlug", "isActive");

-- CreateIndex
CREATE INDEX "automation_execution_logs_ruleId_createdAt_idx" ON "automation_execution_logs"("ruleId", "createdAt");

-- CreateIndex
CREATE INDEX "automation_execution_logs_status_idx" ON "automation_execution_logs"("status");

-- CreateIndex
CREATE INDEX "ai_memory_notes_companySlug_entityType_entityId_idx" ON "ai_memory_notes"("companySlug", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "ai_memory_notes_companySlug_createdAt_idx" ON "ai_memory_notes"("companySlug", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flags_key_key" ON "feature_flags"("key");

-- CreateIndex
CREATE INDEX "feature_flags_isActive_idx" ON "feature_flags"("isActive");

-- CreateIndex
CREATE INDEX "product_aliases_companySlug_idx" ON "product_aliases"("companySlug");

-- CreateIndex
CREATE INDEX "product_aliases_productCatalogId_idx" ON "product_aliases"("productCatalogId");

-- CreateIndex
CREATE UNIQUE INDEX "product_aliases_companySlug_alias_key" ON "product_aliases"("companySlug", "alias");

-- CreateIndex
CREATE INDEX "product_match_audit_companySlug_createdAt_idx" ON "product_match_audit"("companySlug", "createdAt");

-- CreateIndex
CREATE INDEX "product_match_audit_companySlug_isUndone_idx" ON "product_match_audit"("companySlug", "isUndone");

-- CreateIndex
CREATE INDEX "product_match_audit_companySlug_resolvedBy_idx" ON "product_match_audit"("companySlug", "resolvedBy");

-- CreateIndex
CREATE INDEX "match_overrides_companySlug_inputNormalized_idx" ON "match_overrides"("companySlug", "inputNormalized");

-- CreateIndex
CREATE INDEX "match_overrides_companySlug_toProductId_idx" ON "match_overrides"("companySlug", "toProductId");

-- CreateIndex
CREATE INDEX "job_queue_queue_status_scheduledAt_idx" ON "job_queue"("queue", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "job_queue_status_scheduledAt_idx" ON "job_queue"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "ai_model_registry_isEnabled_isHealthy_healthScore_idx" ON "ai_model_registry"("isEnabled", "isHealthy", "healthScore");

-- CreateIndex
CREATE INDEX "ai_model_registry_tier_idx" ON "ai_model_registry"("tier");

-- CreateIndex
CREATE UNIQUE INDEX "ai_model_registry_provider_model_key" ON "ai_model_registry"("provider", "model");

-- CreateIndex
CREATE INDEX "ai_benchmark_results_modelRegistryId_createdAt_idx" ON "ai_benchmark_results"("modelRegistryId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_benchmark_results_capability_createdAt_idx" ON "ai_benchmark_results"("capability", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "company_runtimes_companyId_key" ON "company_runtimes"("companyId");

-- CreateIndex
CREATE INDEX "company_runtimes_status_idx" ON "company_runtimes"("status");

-- CreateIndex
CREATE INDEX "ai_request_logs_companySlug_createdAt_idx" ON "ai_request_logs"("companySlug", "createdAt");

-- CreateIndex
CREATE INDEX "ai_request_logs_companySlug_resolvedBy_createdAt_idx" ON "ai_request_logs"("companySlug", "resolvedBy", "createdAt");

-- CreateIndex
CREATE INDEX "ai_request_logs_requestType_resolvedBy_createdAt_idx" ON "ai_request_logs"("requestType", "resolvedBy", "createdAt");

-- CreateIndex
CREATE INDEX "ai_request_logs_resolvedBy_createdAt_idx" ON "ai_request_logs"("resolvedBy", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ai_fabric_cache_entries_key_key" ON "ai_fabric_cache_entries"("key");

-- CreateIndex
CREATE INDEX "ai_fabric_cache_entries_companySlug_idx" ON "ai_fabric_cache_entries"("companySlug");

-- CreateIndex
CREATE INDEX "ai_fabric_cache_entries_expiresAt_idx" ON "ai_fabric_cache_entries"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "budget_configs_companySlug_key" ON "budget_configs"("companySlug");

-- CreateIndex
CREATE INDEX "budget_configs_companySlug_idx" ON "budget_configs"("companySlug");

-- CreateIndex
CREATE UNIQUE INDEX "provider_configs_taskType_key" ON "provider_configs"("taskType");

-- CreateIndex
CREATE INDEX "ai_memory_entries_companySlug_category_idx" ON "ai_memory_entries"("companySlug", "category");

-- CreateIndex
CREATE INDEX "ai_memory_entries_companySlug_category_lastAccessedAt_idx" ON "ai_memory_entries"("companySlug", "category", "lastAccessedAt");

-- CreateIndex
CREATE INDEX "ai_memory_entries_lastAccessedAt_idx" ON "ai_memory_entries"("lastAccessedAt");

-- CreateIndex
CREATE INDEX "profit_snapshots_companySlug_periodStart_idx" ON "profit_snapshots"("companySlug", "periodStart");

-- CreateIndex
CREATE INDEX "profit_snapshots_periodStart_periodEnd_idx" ON "profit_snapshots"("periodStart", "periodEnd");
