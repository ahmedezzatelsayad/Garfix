# Task: Phase 12 & 13 — Accountant Collaboration & Vouchers/Details

## Work Summary

Created 17 files implementing Phase 12 (Accountant Collaboration) and Phase 13 (Vouchers & Details) business logic and API routes for the GarfiX ERP accounting module.

### Phase 12 — Accountant Collaboration (4 files)

1. **`src/lib/accounting/accountant-collab.ts`** — Core business logic:
   - `createExternalAccountantAccess()` — Grants external accountant access via RolePermission system
   - `exportToAccountantExcel()` — Generates structured Excel-ready data (trial_balance, general_ledger, journal_entries, full_package) with Arabic headers
   - `logAccountingChange()` — Creates AccountingAuditLog entries with before/after states + reason
   - `getAccountingAuditTrail()` — Queries AccountingAuditLog with filters

2. **`src/app/api/accounting/accountant-access/route.ts`** — API route:
   - GET: List external accountant accesses
   - POST: Grant accountant access (Zod validated)
   - DELETE: Revoke accountant access

3. **`src/app/api/accounting/export-excel/route.ts`** — API route:
   - GET: Export data for accountant (Zod validated query params)

4. **`src/app/api/accounting/accounting-audit/route.ts`** — API route:
   - GET: Accounting audit trail with filters

### Phase 13 — Vouchers & Details (13 files)

5. **`src/lib/accounting/arabic-amount-text.ts`** — Arabic amount text conversion:
   - `numberToArabicText()` — Converts numbers to Arabic text (supports KWD, SAR, AED, EGP, BHD, OMR, QAR)
   - `getCurrencyFractionName()` — Returns fraction name (فلس/هللة/قرش)
   - `getCurrencyWholeName()` — Returns currency name with proper singular/dual/plural
   - Full Arabic grammar: gender agreement, plural rules, "لا غير" suffix

6. **`src/lib/accounting/vouchers.ts`** — Voucher processing:
   - `createVoucher()` — Creates PaymentVoucher + JE (auto-generated RV/PV-YYYY-NNNN number)
   - `cancelVoucher()` — Reverses JE, marks voucher cancelled, logs audit

7. **`src/app/api/accounting/vouchers/route.ts`** — GET list + POST create
8. **`src/app/api/accounting/vouchers/[id]/route.ts`** — GET single + PATCH (approve/cancel)
9. **`src/app/api/accounting/quotations/route.ts`** — GET list + POST create + PATCH convert
10. **`src/app/api/accounting/quotations/[id]/route.ts`** — GET/PATCH/DELETE
11. **`src/app/api/accounting/purchase-orders/route.ts`** — GET list + POST create
12. **`src/app/api/accounting/purchase-orders/[id]/route.ts`** — GET/PATCH
13. **`src/app/api/accounting/opening-balances/route.ts`** — GET list + POST create + POST /post
14. **`src/lib/accounting/commissions.ts`** — Commission calculation + JE posting
15. **`src/app/api/accounting/commissions/route.ts`** — GET calculation + POST JE
16. **`src/lib/accounting/partner-capital.ts`** — Profit distribution calculation + JE posting
17. **`src/app/api/accounting/profit-distribution/route.ts`** — GET calculation + POST JE

## Key Patterns Followed

- All monetary values stored as String, use `num()` from money.ts
- All endpoints use `requirePermissionForCompany` + `withErrorHandler`
- All mutations log audit via `logAudit`
- All validations use Zod schemas
- All accounting mutations also log via `logAccountingChange` (AccountingAuditLog)
- JE creation updates account balances in the same transaction
- Voucher cancel reverses JE (swap debit/credit) and updates balances

## Lint Status

All new files pass ESLint with zero errors/warnings.
