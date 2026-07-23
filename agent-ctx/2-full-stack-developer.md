---
Task ID: 2
Agent: full-stack-developer
Task: Build complete MyFatoorah + Paymob payment gateway integration

Work Log:
- Read existing project files: schema.prisma, myfatoorah.ts, types.ts, index.ts, plans.ts, initiate/route.ts, callback/route.ts, queues.ts, schedulerWorker.ts, logger.ts, cryptoVault.ts, api.ts, db.ts, registry.ts
- Updated Prisma schema:
  - Added Company fields: mociNumber, hijriDateRequired, arabicMandatory, recordRetentionYears, paymobCustomerId, myfatoorahCustomerId, currentBillingCycleEnd
  - Updated PaymentTransaction: method field comment (myfatoorah/paymob methods), provider comment (myfatoorah/paymob), default currency from EGP → KWD
  - Added RefundTransaction model (linked to PaymentTransaction and Company)
  - Added SubscriptionSchedule model (recurring billing schedule)
  - Added missing back-relation fields for PurchaseReturn→PurchaseInvoice and PurchaseReturn→Supplier
  - Added indexes for new fields
  - Ran npx prisma format successfully
- Created src/lib/billing/pricing.ts:
  - Country-specific pricing (KW/KWD, SA/SAR, AE/AED, BH/BHD, OM/OMR, QA/QAR, EG/EGP, DEFAULT/USD)
  - getCountryPricing(), getCountryPlanPrices(), getCountryCurrency(), getAllCountryPricing()
- Created src/lib/billing/subscription-engine.ts:
  - createSubscription() — creates recurring payment schedule with dunning config
  - processScheduledCharge() — processes due charges with retry/downgrade logic (dunning: 3 retries over 1/3/7 days)
  - cancelSubscription() — sets status to cancelled
  - reactivateSubscription() — reactivates cancelled or creates new
  - findDueSchedules() — finds schedules due for charging
  - Supports both MyFatoorah and Paymob providers
- Created src/lib/integrations/myfatoorah-refund.ts:
  - initiateRefund() — creates RefundTransaction, calls MyFatoorah Refund API with SSRF validation
  - getRefundStatus() — checks local/provider refund status with optional refresh
  - Zod schemas for validation
- Created src/lib/integrations/myfatoorah-webhook.ts:
  - verifyWebhookSignature() — HMAC-SHA256 verification with safeCompare
  - parseWebhookEvent() — maps InvoiceStatus → payment_success/payment_failed/refund_completed
  - processWebhookEvent() — updates DB based on event type
  - Rate limiting (100/min per provider)
- Created src/lib/integrations/paymob.ts:
  - PaymobProvider implementing IntegrationProvider (connect/disconnect/testConnection/healthCheck)
  - Same SSRF-safe base_url validation pattern as MyFatoorah
  - initiatePaymobPayment() helper (auth → order → payment key → checkout URL)
- Updated src/lib/integrations/types.ts:
  - Added PAYMOB to INTEGRATION_TYPES
  - Added INTEGRATION_INFO for Paymob with Arabic description
- Updated src/lib/integrations/index.ts:
  - Imported and registered paymobProvider
- Updated src/app/api/saas/payments/initiate/route.ts:
  - Added country-specific pricing lookup via getCountryPricing()
  - Auto-determines provider (MyFatoorah for Gulf, Paymob for Egypt)
  - Supports Paymob payment flow alongside MyFatoorah
  - Uses company country to determine currency and pricing
- Created test files:
  - src/lib/billing/__tests__/subscription-engine.test.ts
  - src/lib/integrations/__tests__/paymob.test.ts
  - src/lib/integrations/__tests__/myfatoorah-refund.test.ts
  - src/lib/integrations/__tests__/myfatoorah-webhook.test.ts
- Ran bun run lint — no new errors introduced (pre-existing lint error in status/page.tsx)
- Ran npx prisma format — successful after fixing pre-existing schema relation issues

Stage Summary:
- Complete MyFatoorah + Paymob payment gateway integration built
- 7 new TypeScript modules created (subscription-engine, pricing, myfatoorah-refund, myfatoorah-webhook, paymob, and 4 test files)
- 3 existing files modified (types.ts, index.ts, initiate/route.ts)
- Prisma schema updated with 2 new models (RefundTransaction, SubscriptionSchedule) and 8 new Company fields
- PaymentTransaction default currency changed from EGP → KWD
- Country-specific pricing implemented for KW, SA, AE, BH, OM, QA, EG + USD default
- SSRF-safe validation pattern applied consistently to Paymob (matching MyFatoorah)
- Subscription engine implements dunning: 3 retries over 1/3/7 days, then downgrade
- Webhook signature verification uses HMAC-SHA256 with constant-time comparison
