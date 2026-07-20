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
    "currency" TEXT NOT NULL DEFAULT 'KWD',
    "country" TEXT,
    "timezone" TEXT,
    "defaultTaxRate" TEXT NOT NULL DEFAULT '0',
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
    CONSTRAINT "setup_wizard_progress_companySlug_fkey" FOREIGN KEY ("companySlug") REFERENCES "companies" ("slug") ON DELETE CASCADE ON UPDATE CASCADE
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
    "companySlug" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "product_catalog_companySlug_fkey" FOREIGN KEY ("companySlug") REFERENCES "companies" ("slug") ON DELETE RESTRICT ON UPDATE CASCADE
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
    "currency" TEXT NOT NULL DEFAULT 'KWD',
    "joinDate" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "hr_employees_companySlug_fkey" FOREIGN KEY ("companySlug") REFERENCES "companies" ("slug") ON DELETE CASCADE ON UPDATE CASCADE
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
    CONSTRAINT "accounts_companySlug_fkey" FOREIGN KEY ("companySlug") REFERENCES "companies" ("slug") ON DELETE CASCADE ON UPDATE CASCADE
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
    CONSTRAINT "journal_entries_companySlug_fkey" FOREIGN KEY ("companySlug") REFERENCES "companies" ("slug") ON DELETE CASCADE ON UPDATE CASCADE
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
    "authorityType" TEXT NOT NULL DEFAULT 'zatca',
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
    CONSTRAINT "order_deliveries_companySlug_fkey" FOREIGN KEY ("companySlug") REFERENCES "companies" ("slug") ON DELETE CASCADE ON UPDATE CASCADE,
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

-- CreateIndex
CREATE UNIQUE INDEX "app_users_uid_key" ON "app_users"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "app_users_email_key" ON "app_users"("email");

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
CREATE UNIQUE INDEX "setup_wizard_progress_companySlug_key" ON "setup_wizard_progress"("companySlug");

-- CreateIndex
CREATE INDEX "clients_companySlug_idx" ON "clients"("companySlug");

-- CreateIndex
CREATE INDEX "clients_companySlug_createdAt_id_idx" ON "clients"("companySlug", "createdAt", "id");

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
CREATE UNIQUE INDEX "invoices_companySlug_invoiceNumber_key" ON "invoices"("companySlug", "invoiceNumber");

-- CreateIndex
CREATE INDEX "product_catalog_companySlug_idx" ON "product_catalog"("companySlug");

-- CreateIndex
CREATE INDEX "product_catalog_companySlug_createdAt_id_idx" ON "product_catalog"("companySlug", "createdAt", "id");

-- CreateIndex
CREATE INDEX "purchase_invoices_companySlug_idx" ON "purchase_invoices"("companySlug");

-- CreateIndex
CREATE INDEX "purchase_invoices_companySlug_createdAt_id_idx" ON "purchase_invoices"("companySlug", "createdAt", "id");

-- CreateIndex
CREATE INDEX "hr_employees_companySlug_idx" ON "hr_employees"("companySlug");

-- CreateIndex
CREATE INDEX "hr_attendance_companySlug_idx" ON "hr_attendance"("companySlug");

-- CreateIndex
CREATE INDEX "hr_attendance_employeeId_date_idx" ON "hr_attendance"("employeeId", "date");

-- CreateIndex
CREATE INDEX "hr_salaries_companySlug_idx" ON "hr_salaries"("companySlug");

-- CreateIndex
CREATE INDEX "hr_salaries_employeeId_month_idx" ON "hr_salaries"("employeeId", "month");

-- CreateIndex
CREATE INDEX "hr_commissions_companySlug_idx" ON "hr_commissions"("companySlug");

-- CreateIndex
CREATE INDEX "hr_leave_requests_companySlug_idx" ON "hr_leave_requests"("companySlug");

-- CreateIndex
CREATE INDEX "hr_performance_companySlug_idx" ON "hr_performance"("companySlug");

-- CreateIndex
CREATE INDEX "accounts_companySlug_idx" ON "accounts"("companySlug");

-- CreateIndex
CREATE INDEX "accounts_code_idx" ON "accounts"("code");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_companySlug_code_key" ON "accounts"("companySlug", "code");

-- CreateIndex
CREATE INDEX "journal_entries_companySlug_idx" ON "journal_entries"("companySlug");

-- CreateIndex
CREATE INDEX "journal_entries_companySlug_date_idx" ON "journal_entries"("companySlug", "date");

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
CREATE UNIQUE INDEX "order_deliveries_invoiceId_key" ON "order_deliveries"("invoiceId");

-- CreateIndex
CREATE INDEX "order_deliveries_companySlug_idx" ON "order_deliveries"("companySlug");

-- CreateIndex
CREATE INDEX "order_deliveries_companySlug_status_idx" ON "order_deliveries"("companySlug", "status");

-- CreateIndex
CREATE INDEX "order_deliveries_companySlug_preferredTime_idx" ON "order_deliveries"("companySlug", "preferredTime");

-- CreateIndex
CREATE INDEX "payment_transactions_provider_providerPaymentId_idx" ON "payment_transactions"("provider", "providerPaymentId");

-- CreateIndex
CREATE INDEX "payment_transactions_companySlug_idx" ON "payment_transactions"("companySlug");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_provider_providerEventId_key" ON "payment_transactions"("provider", "providerEventId");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE INDEX "role_permissions_role_idx" ON "role_permissions"("role");

-- CreateIndex
CREATE INDEX "role_permissions_companySlug_idx" ON "role_permissions"("companySlug");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_role_permissionKey_companySlug_key" ON "role_permissions"("role", "permissionKey", "companySlug");

-- CreateIndex
CREATE INDEX "audit_logs_companySlug_idx" ON "audit_logs"("companySlug");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "admin_audit_logs_createdAt_idx" ON "admin_audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "admin_audit_logs_adminEmail_idx" ON "admin_audit_logs"("adminEmail");

-- CreateIndex
CREATE INDEX "support_tickets_status_idx" ON "support_tickets"("status");

-- CreateIndex
CREATE INDEX "ticket_replies_ticketId_idx" ON "ticket_replies"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "modules_identifier_key" ON "modules"("identifier");

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

