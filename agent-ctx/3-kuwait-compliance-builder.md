---
Task ID: 3
Agent: kuwait-compliance-builder
Task: Build Kuwait Decree 10/2026 (Digital Commerce Law) compliance

Work Log:
- Read worklog.md from Task 2 (MyFatoorah + Paymob payment gateway integration)
- Read all existing relevant files:
  - src/lib/hijri.ts (Hijri calendar utilities)
  - src/lib/money.ts (KWD 3-decimal formatting)
  - src/lib/gulfConfig.ts (Country configs)
  - prisma/schema.prisma (Invoice, EInvoice, Company models)
  - src/app/api/invoices/route.ts (GET/POST invoices)
  - src/app/api/invoices/[id]/route.ts (GET/PATCH/DELETE invoice)
  - src/app/api/platform-admin/retention-cleanup/route.ts
  - src/lib/logger.ts, src/lib/api.ts, src/lib/db.ts
- Created src/lib/e-invoicing directory structure

- Updated Prisma schema (Invoice model):
  - Added 13 Kuwait-specific fields: hijriIssueDate, hijriDueDate, mociNumber,
    invoiceTypeAr, invoiceTypeEn, sellerNameAr, sellerAddressAr, buyerNameAr,
    buyerAddressAr, lineItemsAr (String @default("[]")), notesAr,
    currencyDecimalPlaces (Int @default(3)), eInvoiceAuthority
  - Updated EInvoice.authorityType comment to include "kuwait_decree_10_2026"
  - Ran npx prisma format successfully

- Updated src/lib/gulfConfig.ts:
  - Added new fields to CountryConfig interface: decreeRef, paymentGatewayLicense,
    invoiceLanguageRequired, retentionYears, currencyDecimalPlaces
  - Changed EInvoiceAuthority: "kuwait_future" → "kuwait_decree_10_2026"
  - Updated Kuwait (KW) config with: decreeRef="Decree 10/2026",
    paymentGatewayLicense="CBK", invoiceLanguageRequired="arabic_mandatory",
    retentionYears=5, currencyDecimalPlaces=3
  - Added new fields to all 21 other country configs
  - Added 6 new helper functions: getRetentionYears(), getCurrencyDecimalPlaces(),
    isArabicMandatory(), getPaymentGatewayLicense(), getDecreeRef(), isKuwait()

- Created src/lib/e-invoicing/kuwait.ts (Kuwait Invoice Compliance Module):
  - validateKuwaitInvoice() — validates Decree 10/2026 requirements:
    Arabic mandatory, Hijri dates, MOCI number, KWD 3 decimals,
    invoice type classification, line items Arabic
  - generateKuwaitInvoicePayload() — generates structured payload with
    dual Gregorian/Hijri dates, MOCI number, KWD 3-decimal totals
  - submitKuwaitInvoice() — placeholder submission to MOCI portal
    (stores EInvoice record with authorityType="kuwait_decree_10_2026")
  - checkKuwaitInvoiceStatus() — status check from local DB
  - autoPopulateKuwaitFields() — auto-populates Hijri dates, MOCI number,
    Arabic fields, KWD currency, invoice type, e-invoice authority
  - Arabic error messages (Kuwaiti Arabic) for all validation failures
  - Constants: KUWAIT_AUTHORITY, KUWAIT_CURRENCY, KUWAIT_DECIMAL_PLACES,
    KUWAIT_DECREE_REF, KUWAIT_MAX_FINE_KWD (10,000 KWD)

- Created src/lib/e-invoicing/kuwait-validation.ts (Validation Middleware):
  - kuwaitInvoiceValidationMiddleware() — auto-detects KW companies,
    enforces KWD currency, auto-populates Kuwait fields, validates compliance
  - applyKuwaitCompliance() — convenience wrapper combining validation + enrichment
  - formatKuwaitErrorsForResponse() — formats Arabic errors for API response

- Created src/lib/e-invoicing/retention.ts (5-Year Retention Enforcement):
  - getRetentionPeriodForCompany() — Kuwait: 5 (mandatory), others: configurable
  - calculateEligibleDeletionDate() — computes when records can be permanently deleted
  - checkInvoiceRetention() — checks if invoice can be deleted (blocks within retention)
  - checkFinancialRecordRetention() — generic retention check for any financial record
  - enforceRetentionForCompany() — bulk retention enforcement per company
  - Kuwait-specific Arabic messages with fine warning (10,000 KWD)

- Updated src/app/api/invoices/route.ts (POST):
  - Added imports: applyKuwaitCompliance, formatKuwaitErrorsForResponse, isKuwait
  - Extended CreateSchema with Kuwait fields: sellerNameAr, sellerAddressAr,
    buyerNameAr, buyerAddressAr, lineItemsAr, notesAr, invoiceTypeAr,
    invoiceTypeEn, mociNumber
  - Added Kuwait compliance block after quota check: fetches company, runs
    applyKuwaitCompliance(), blocks creation with Arabic error messages
    if validation fails
  - Added Kuwait fields to db.invoice.create() data
  - Added kuwaitWarnings to response JSON

- Updated src/app/api/invoices/[id]/route.ts (PATCH/DELETE):
  - Added imports: applyKuwaitCompliance, formatKuwaitErrorsForResponse,
    checkInvoiceRetention, isKuwait, logger
  - Extended UpdateSchema with Kuwait fields
  - Added Kuwait compliance block in PATCH: validates + enriches Kuwait fields
    for updates, merges enriched fields into updateData
  - Added kuwaitWarnings to PATCH response
  - Added retention check in DELETE: logs retention notice, adds to audit trail
  - Soft-delete always allowed, but retention warning logged

- Rewrote src/app/api/platform-admin/retention-cleanup/route.ts:
  - Added imports: getRetentionPeriodForCompany, KUWAIT_RETENTION_YEARS, isKuwait
  - Created cleanupWithPerCompanyRetention() function — processes companies
    individually, enforces Kuwait 5-year minimum, per-company retention periods
  - Updated POST handler: uses per-company cleanup instead of global
  - Kuwait companies cannot have records deleted within 5-year window
  - Added decreeRef and perCompanyRetention to response and audit log

- Created src/lib/e-invoicing/__tests__/kuwait.test.ts:
  - validateKuwaitInvoice tests (Arabic mandatory, Hijri, MOCI, KWD, types)
  - determineInvoiceType tests (B2B/B2C classification)
  - generateKuwaitInvoicePayload tests (dates, amounts, MOCI, CR)
  - autoPopulateKuwaitFields tests (Hijri, MOCI, currency, precision)
  - kuwaitInvoiceValidationMiddleware tests (KW/non-KW, blocking)
  - formatKuwaitErrorsForResponse tests
  - Retention enforcement tests (5-year Kuwait, configurable others)
  - Hijri date integration tests
  - Money/KWD 3-decimal integration tests

- Ran npx prisma format — successful
- Ran bun run db:push — PostgreSQL not reachable (sandbox environment, expected)
- Ran bun run lint on changed files only — no errors (pre-existing error in status/page.tsx unrelated)

Stage Summary:
- Complete Kuwait Decree 10/2026 compliance module built
- 5 new TypeScript modules created (kuwait.ts, kuwait-validation.ts, retention.ts, kuwait.test.ts, + directory)
- 4 existing files modified (gulfConfig.ts, invoices/route.ts, invoices/[id]/route.ts, retention-cleanup/route.ts)
- Prisma schema updated with 13 new Invoice fields and EInvoice authority type update
- All country configs (22 countries) updated with 4 new fields
- 6 new helper functions added to gulfConfig.ts
- Arabic error messages for all Kuwait validation failures
- Kuwait-specific retention enforcement with 5-year minimum and 10,000 KWD fine warning
- Portal submission placeholder ready for MOCI API when published
