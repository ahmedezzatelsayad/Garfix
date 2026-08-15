-- ───────────────────────────────────────────────────────────────────────────
-- Schema drift fix: add columns the API code writes to but that were never
-- declared in schema.prisma (and therefore never created in the DB).
--
-- This migration is IDEMPOTENT: every statement uses IF NOT EXISTS so it can
-- be re-run safely on databases that already have some of the columns.
--
-- Background: the previous migrations (20260723_add_accounting_module and
-- 20260801_decimal_migration_monetary_fields) added columns like
-- invoices.lineItems / taxRate / shipping / paid / discount, but the
-- schema.prisma file was never updated to match. The Prisma Client generated
-- from schema.prisma therefore rejected every API call that wrote those
-- fields, producing silent 500s across Company create, Invoice create,
-- Notification list, EmailVerification (forgot-password), InterCompany
-- settlement, SaaS payment initiate, AdminAuditLog, TamperEvidenceChain,
-- SetupWizardProgress, Account create, IdempotencyKey, PaymentTransaction,
-- LandingContent, and Module activation.
--
-- This migration brings the DB and schema.prisma into sync with what the
-- API code actually writes.
-- ───────────────────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════════════════════
-- 1. COMPANIES — add the brand + locale + trial fields used by the
--    onboarding wizard (POST /api/companies) and the settings page
--    (PATCH /api/companies/[slug]).
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "nameAr" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "emoji" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "color" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "vatNumber" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "country" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "defaultTaxRate" TEXT NOT NULL DEFAULT '0';
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "trialEndsAt" TIMESTAMP(3);
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "commercialRegistration" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "timezone" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "weekendDays" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "ramadanHours" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "openrouterModel" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "whatsappVerifyTokenHash" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "whatsappAppSecretEnc" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "whatsappPhoneNumberId" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. INVOICES — add the fields POST /api/invoices writes (lineItems JSON,
--    client contact fields, tax/shipping/paid/discount, audit fields, and
--    Kuwait-compliance hijri/MOCI/Arabic fields).
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "lineItems" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "clientEmail" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "clientPhone" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "clientAddress" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "taxRate" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "shipping" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "paid" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "discount" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "createdByEmail" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "createdByName" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "deletedBy" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "hijriIssueDate" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "hijriDueDate" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "mociNumber" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "invoiceTypeAr" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "invoiceTypeEn" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "sellerNameAr" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "sellerAddressAr" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "buyerNameAr" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "buyerAddressAr" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "lineItemsAr" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "notesAr" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "currencyDecimalPlaces" INTEGER;

-- P1 FIX (audit): Removed DO $$ block that tried to ADD CONSTRAINT
-- invoices_companySlug_invoiceNumber_key. This constraint is already created
-- by CREATE UNIQUE INDEX IF NOT EXISTS in 20260720202945_init_ai_fabric.
-- The DO $$ block checked pg_constraint but CREATE UNIQUE INDEX creates an
-- index (not a pg_constraint entry), so the check passed and ADD CONSTRAINT
-- failed with E42P07 'relation already exists'.
-- The constraint from the init migration is sufficient.

-- ════════════════════════════════════════════════════════════════════════════
-- 3. NOTIFICATIONS — add isRead column used by GET/PATCH /api/notifications.
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "isRead" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "readAt" TIMESTAMP(3);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. EMAIL_VERIFICATIONS — add the fields used by forgot-password/reset-password.
--    The schema currently has only (id, email, code, expiresAt, verified, timestamps).
--    The API writes: userId, codeHash, purpose, usedAt, attempts.
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE "email_verifications" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "email_verifications" ADD COLUMN IF NOT EXISTS "codeHash" TEXT;
ALTER TABLE "email_verifications" ADD COLUMN IF NOT EXISTS "purpose" TEXT;
ALTER TABLE "email_verifications" ADD COLUMN IF NOT EXISTS "usedAt" TIMESTAMP(3);
ALTER TABLE "email_verifications" ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. INTER_COMPANY_TRANSACTIONS — add companySlugFrom / companySlugTo / currency
--    (the API uses these; current schema only has fromCompanyId / toCompanyId).
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE "inter_company_transactions" ADD COLUMN IF NOT EXISTS "companySlugFrom" TEXT;
ALTER TABLE "inter_company_transactions" ADD COLUMN IF NOT EXISTS "companySlugTo" TEXT;
ALTER TABLE "inter_company_transactions" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'KWD';

-- ════════════════════════════════════════════════════════════════════════════
-- 6. SESSION_REGISTRY — add the fields auth.ts writes: userUid, jti, userAgent.
--    Schema currently has (userId, tokenHash, deviceInfo, ipAddress, expiresAt).
--    Add jti unique constraint.
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE "SessionRegistry" ADD COLUMN IF NOT EXISTS "userUid" TEXT;
ALTER TABLE "SessionRegistry" ADD COLUMN IF NOT EXISTS "jti" TEXT;
ALTER TABLE "SessionRegistry" ADD COLUMN IF NOT EXISTS "userAgent" TEXT;
-- P1 FIX: Removed DO $$ block for SessionRegistry_jti_key — constraint already created by CREATE UNIQUE INDEX IF NOT EXISTS in earlier migration
-- P1 FIX: Removed DO $$ block for SessionRegistry_userUid_idx — constraint already created by CREATE UNIQUE INDEX IF NOT EXISTS in earlier migration

-- ════════════════════════════════════════════════════════════════════════════
-- 7. ADMIN_AUDIT_LOG — add targetType, targetId, changes, ipAddress, userAgent
--    (the API writes these; current schema has only adminEmail/action/targetSlug/details).
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE "admin_audit_logs" ADD COLUMN IF NOT EXISTS "targetType" TEXT;
ALTER TABLE "admin_audit_logs" ADD COLUMN IF NOT EXISTS "targetId" TEXT;
ALTER TABLE "admin_audit_logs" ADD COLUMN IF NOT EXISTS "changes" TEXT;
ALTER TABLE "admin_audit_logs" ADD COLUMN IF NOT EXISTS "ipAddress" TEXT;
ALTER TABLE "admin_audit_logs" ADD COLUMN IF NOT EXISTS "userAgent" TEXT;

-- ════════════════════════════════════════════════════════════════════════════
-- 8. TAMPER_EVIDENCE_CHAIN — add entryId, contentHash, prevHash, chainOrder,
--    companySlug, isValid, verifiedAt. Schema currently has only
--    (id, entityType, entityId, hash, previousHash, timestamps).
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE "TamperEvidenceChain" ADD COLUMN IF NOT EXISTS "entryId" TEXT;
ALTER TABLE "TamperEvidenceChain" ADD COLUMN IF NOT EXISTS "contentHash" TEXT;
ALTER TABLE "TamperEvidenceChain" ADD COLUMN IF NOT EXISTS "prevHash" TEXT;
ALTER TABLE "TamperEvidenceChain" ADD COLUMN IF NOT EXISTS "chainOrder" INTEGER;
ALTER TABLE "TamperEvidenceChain" ADD COLUMN IF NOT EXISTS "companySlug" TEXT;
ALTER TABLE "TamperEvidenceChain" ADD COLUMN IF NOT EXISTS "isValid" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "TamperEvidenceChain" ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3);
-- P1 FIX: Removed DO $$ block for TamperEvidenceChain_chainOrder_idx — constraint already created by CREATE UNIQUE INDEX IF NOT EXISTS in earlier migration

-- ════════════════════════════════════════════════════════════════════════════
-- 9. IDEMPOTENCY_KEYS — add endpoint, companySlug, responseJson columns.
--    Schema currently has (id, key, method, path, statusCode, responseBody, timestamps).
--    The API uses `findUnique({ where: { companySlug_endpoint_key: ... } })` which
--    requires a compound unique constraint.
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE "idempotency_keys" ADD COLUMN IF NOT EXISTS "endpoint" TEXT;
ALTER TABLE "idempotency_keys" ADD COLUMN IF NOT EXISTS "companySlug" TEXT;
ALTER TABLE "idempotency_keys" ADD COLUMN IF NOT EXISTS "responseJson" TEXT;
-- P1 FIX: Removed DO $$ block for idempotency_keys_companySlug_endpoint_key_key — constraint already created by CREATE UNIQUE INDEX IF NOT EXISTS in earlier migration

-- ════════════════════════════════════════════════════════════════════════════
-- 10. PAYMENT_TRANSACTIONS — add plan, provider, currency, providerPaymentId,
--     providerOrderId, checkoutUrl, createdBy, metadata.
--     Schema currently has (id, invoiceId, amount, method, reference, date,
--     status, companySlug, companyId, timestamps).
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE "payment_transactions" ADD COLUMN IF NOT EXISTS "plan" TEXT;
ALTER TABLE "payment_transactions" ADD COLUMN IF NOT EXISTS "provider" TEXT;
ALTER TABLE "payment_transactions" ADD COLUMN IF NOT EXISTS "currency" TEXT;
ALTER TABLE "payment_transactions" ADD COLUMN IF NOT EXISTS "providerPaymentId" TEXT;
ALTER TABLE "payment_transactions" ADD COLUMN IF NOT EXISTS "providerOrderId" TEXT;
ALTER TABLE "payment_transactions" ADD COLUMN IF NOT EXISTS "checkoutUrl" TEXT;
ALTER TABLE "payment_transactions" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
ALTER TABLE "payment_transactions" ADD COLUMN IF NOT EXISTS "metadata" TEXT;

-- ════════════════════════════════════════════════════════════════════════════
-- 11. SETUP_WIZARD_PROGRESS — add `data` JSON column (wizard saves step data).
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE "setup_wizard_progress" ADD COLUMN IF NOT EXISTS "data" TEXT;

-- ════════════════════════════════════════════════════════════════════════════
-- 12. MODULES — add `identifier` column (API uses it as the lookup key).
--     Current schema has `key @unique` but API uses `where: { identifier }`.
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE "modules" ADD COLUMN IF NOT EXISTS "identifier" TEXT;
-- P1 FIX: Removed DO $$ block for modules_identifier_key — constraint already created by CREATE UNIQUE INDEX IF NOT EXISTS in earlier migration

-- ════════════════════════════════════════════════════════════════════════════
-- 13. ACCOUNTS — add nameAr / nameEn columns (used by onboarding wizard when
--     creating chart of accounts).
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "nameAr" TEXT;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "nameEn" TEXT;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "currency" TEXT;

-- ════════════════════════════════════════════════════════════════════════════
-- 14. LANDING_CONTENT — add `key` and `value` columns (API uses these instead
--     of `section`/`title`/etc.).
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE "landing_content" ADD COLUMN IF NOT EXISTS "key" TEXT;
ALTER TABLE "landing_content" ADD COLUMN IF NOT EXISTS "value" TEXT;

-- ════════════════════════════════════════════════════════════════════════════
-- 15. CLIENTS — add clientCompany + notes (API writes these).
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "clientCompany" TEXT;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "notes" TEXT;
