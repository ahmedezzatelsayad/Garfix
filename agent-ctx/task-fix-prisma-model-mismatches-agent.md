# Task: Fix Prisma Model Name Mismatches

## Summary
Fixed all TS2551 (104 errors) and TS2339 PrismaClient (89 errors) caused by Prisma model name changes in the schema expansion from 17 to 105 models.

## Starting State
- 104 TS2551 errors (Prisma model name mismatch with "Did you mean" suggestion)
- 89 TS2339 errors (PrismaClient missing properties)
- 374 total TSC errors across all error types

## Ending State
- 0 TS2551 errors (all resolved)
- 0 TS2339 PrismaClient property errors (all resolved)
- 218 total TSC errors remaining (all different types: TS17001, TS2322, TS2353, etc.)

## Changes Made

### 1. TS2551 Model Name Renames (using "Did you mean" suggestions)

| Old Name | New Name | Files Affected |
|---|---|---|
| `db.financialPeriod` | `db.fiscalPeriod` | prisma/seed.ts |
| `db.attendance` / `tx.attendance` | `db.hRAttendance` / `tx.hRAttendance` | scripts/seed.ts, src/app/api/hr/attendance/*, src/app/api/companies/[slug]/route.ts, src/app/api/platform-admin/tenants/[slug]/route.ts |
| `db.salary` / `tx.salary` | `db.hRSalary` / `tx.hRSalary` | scripts/seed.ts, src/app/api/accounting/payroll/route.ts, src/app/api/hr/salaries/*, src/app/api/companies/[slug]/route.ts, src/app/api/platform-admin/tenants/[slug]/route.ts, src/lib/accounting/payroll-wps.ts |
| `db.commission` / `tx.commission` | `db.hRCommission` / `tx.hRCommission` | src/app/api/accounting/commissions/*, src/app/api/hr/commissions/*, src/app/api/companies/[slug]/route.ts, src/app/api/platform-admin/tenants/[slug]/route.ts, src/lib/accounting/commissions.ts, src/lib/accounting/payroll-wps.ts |
| `db.platformSetting` | `db.platformSettings` | scripts/seed.ts, src/app/api/platform-admin/*, src/app/api/settings/route.ts, src/app/api/product-matching/config/route.ts, src/lib/ai/costOptimizer.ts, src/lib/aiConfig.ts, src/lib/aiProvider.ts, src/lib/integrations/registry.ts, src/lib/productMatcher.ts |
| `db.platformSettingHistory` | `db.platformSettingsHistory` | src/app/api/platform-admin/landing-content/route.ts, src/app/api/settings/route.ts, src/lib/aiProvider.ts |
| `db.leaveRequest` / `tx.leaveRequest` | `db.hRLeaveRequest` / `tx.hRLeaveRequest` | src/app/api/hr/leaves/*, src/app/api/companies/[slug]/route.ts, src/app/api/platform-admin/tenants/[slug]/route.ts |
| `db.performance` / `tx.performance` | `db.hRPerformance` / `tx.hRPerformance` | src/app/api/hr/performance/*, src/app/api/companies/[slug]/route.ts, src/app/api/platform-admin/tenants/[slug]/route.ts |
| `db.aiProcessingLog` | `db.aIProcessingLog` | src/app/api/ai/invoice-brain/*, src/app/api/ai/parse-file/route.ts, src/app/api/ai/parse-image/route.ts, src/app/api/ai/smart-parse/route.ts |
| `db.aIScoreSnapshot` | `db.aiScoreSnapshot` | src/lib/ai-fabric/ai-score.ts |

### 2. TS2339 Missing PrismaClient Properties (model not found at all)

| Old Name | New Name | Files Affected |
|---|---|---|
| `db.user` / `prisma.user` / `tx.user` | `db.appUser` / `prisma.appUser` / `tx.appUser` | prisma/seed.ts, scripts/*, src/app/api/auth/*, src/app/api/accounting/accountant-access/*, src/app/api/companies/[slug]/members/*, src/app/api/platform-admin/*, src/app/api/saas/users/*, src/lib/auth.ts, src/lib/api.ts, src/lib/middleware.ts, src/lib/notifications.ts, src/lib/usageMeter.ts |
| `db.chatMessage` | `db.chatHistory` | src/app/api/ai/chat/*, src/app/api/ai/chat/stream/route.ts |
| `db.cacheEntry` | `db.aIFabricCacheEntry` | src/lib/ai-fabric/gateway.ts |
| `db.voucher` | `db.paymentVoucher` | prisma/seed.ts |
| `db.openingBalance` | `db.openingBalanceEntry` | prisma/seed.ts, src/app/api/accounting/opening-balances/* |

### 3. Field-level Fix

| Old | New | File |
|---|---|---|
| `pi.supplierId` | `pi.supplier` | src/lib/accounting/ar-ap.ts |
| `include: { supplierEntity: true }` | removed (no such relation) | src/lib/accounting/ar-ap.ts |
| `Map<number>` | `Map<string>` | src/lib/accounting/ar-ap.ts (adjusted for string supplier field) |

### 4. Schema Addition

Added `ZatcaCertificate` model to prisma/schema.prisma (was missing entirely):
- Fields: id, companySlug, certificateType, serialNumber, expiryDate, status, certificateDataEnc, privateKeyDataEnc, createdAt, updatedAt
- Added relation `zatcaCertificates` in Company model
- Ran `bun run db:push` and `bunx prisma generate` to sync

### 5. Bug Fixes from Double-Replacement

- Fixed `platformSettingssHistory` → `platformSettingsHistory` (sed applied platformSetting→platformSettings AFTER platformSettingHistory→platformSettingsHistory)
- Fixed `openingBalanceEntryEntry` → `openingBalanceEntry` (sed applied openingBalance→openingBalanceEntry on code that already had openingBalanceEntry)

## Remaining Errors (218 total, non-Prisma-model-name)

- TS17001: 75 (duplicate JSX attributes)
- TS2322: 54 (type mismatches)
- TS2353: 41 (unknown properties in Prisma types)
- TS2339: 20 (field-level mismatches, not PrismaClient)
- TS2304: 10 (cannot find name)
- TS2345: 7 (argument type mismatches)
- TS2559: 6 (type mismatches)
- TS2561/TS2554/TS2352: 5 (misc)
