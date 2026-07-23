# Task: GarfiX ERP Accounting Module — Phase 3 (Banking), Phase 4 (Payroll & WPS), Phase 5 (Fixed Assets)

## Summary

Created complete business logic and API routes for three phases of the GarfiX ERP accounting module. All files follow existing patterns from the journal-entries reference route.

## Files Created

### Phase 3 — Banking (7 files)

1. **`src/lib/accounting/banking.ts`** — Bank reconciliation engine with:
   - `reconcileBankAccount()` — Auto-matches bank transactions to GL entries by amount, date, and reference; calculates book balance, adjusted balance, and difference
   - `importBankStatement()` — Parses CSV rows, creates BankTransaction records, auto-tags deposit/withdrawal/fee
   - `transferBetweenAccounts()` — Creates withdrawal + deposit BankTransactions, JE (Debit dest, Credit source), updates balances in transaction

2. **`src/app/api/accounting/bank-accounts/route.ts`** — GET (list) + POST (create bank account)
3. **`src/app/api/accounting/bank-accounts/[id]/route.ts`** — GET/PATCH/DELETE (soft-delete via isActive=false)
4. **`src/app/api/accounting/bank-reconciliation/route.ts`** — GET (list) + POST (start reconciliation using engine)
5. **`src/app/api/accounting/bank-reconciliation/[id]/route.ts`** — GET/PATCH (complete/approve with status transition validation)
6. **`src/app/api/accounting/bank-import/route.ts`** — POST (import bank statement CSV)
7. **`src/app/api/accounting/bank-transfer/route.ts`** — POST (transfer between accounts)

### Phase 4 — Payroll & WPS (4 files)

8. **`src/lib/accounting/payroll-wps.ts`** — WPS file generation and payroll calculation with:
   - `calculateSocialInsurance()` — Per-country rates (KW PIFSS 5.5%/11%, SA GOSI 9.75%/11.75%, AE GPSSA 5%/12.5%, BH, OM, QA)
   - `calculateNetSalary()` — Full breakdown: gross, basic, housing/transport/other allowances, social insurance, deductions, net, gratuity provision
   - `generateWpsFile()` — Country-specific format generators for KW (Kuwait Central Bank), SA (MHRSD), AE (Ministry of HR), plus generic CSV

9. **`src/app/api/accounting/wps/route.ts`** — GET (list WPS files) + POST (generate)
10. **`src/app/api/accounting/wps/[id]/route.ts`** — GET (download content) + PATCH (submit/accept/reject)
11. **`src/app/api/accounting/payroll/route.ts`** — POST (calculate payroll, creates Salary records)

### Phase 5 — Fixed Assets (4 files)

12. **`src/lib/accounting/fixed-assets.ts`** — Depreciation engine with:
   - `calculateDepreciation()` — Straight-line and declining balance methods
   - `runDepreciationForPeriod()` — Batch depreciation for all active assets; creates DepreciationEntry records; optionally posts JEs
   - `disposeAsset()` — Marks inactive, creates disposal JE with gain/loss recognition

13. **`src/app/api/accounting/fixed-assets/route.ts`** — GET (list) + POST (create asset)
14. **`src/app/api/accounting/fixed-assets/[id]/route.ts`** — GET/PATCH (update or dispose via action=dispose)
15. **`src/app/api/accounting/depreciation/route.ts`** — GET (list entries) + POST (run depreciation)

## Patterns Followed

- All monetary values as String using `num()` from money.ts
- All endpoints use `requirePermissionForCompany` + `withErrorHandler`
- All mutations log audit via `logAudit()`
- All validations use Zod schemas
- Database operations wrapped in `db.$transaction()` for multi-step mutations
- Consistent error handling with `apiError()` / `apiOk()`

## Verification

- TypeScript compilation: 0 errors in all new files
- ESLint: 0 errors/warnings in all new files
- Pre-existing errors in other files (status page, etc.) are not affected
