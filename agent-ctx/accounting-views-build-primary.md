# Task: Build 3 Frontend View Modules for GarfiX Accounting

## Task ID: accounting-views-build

## Summary

Built 3 complete functional frontend view modules for the GarfiX Accounting Module following the exact pattern from `AccountingView.tsx`:

### 1. ArApView.tsx (~540 lines)
**Tabs:**
- **aging** — Fetches `/api/accounting/aging?companySlug=X&direction=receivable|payable` with direction toggle. Shows per-client/supplier rows with columns: Name | Current | 30 days | 60 days | 90+ days | Total. Summary cards for totals.
- **client-statement** — Select client dropdown → fetch `/api/accounting/client-statement?companySlug=X&clientId=Y`. Shows invoice list + payments + running balance with summary cards (opening balance, total debit/credit, closing balance).
- **supplier-statement** — Same for suppliers with `/api/accounting/supplier-statement?companySlug=X&supplierId=Y`.
- **pdc** — Post-dated checks: fetch `/api/accounting/post-dated-checks?companySlug=X`. List table with status badges (pending/yellow, deposited/blue, cleared/green, returned/red). Create dialog with direction field (receivable/payable). Action buttons: deposit, clear, return.
- **installments** — Installment scheduling with summary cards, list table, and create form.

### 2. BankingView.tsx (~535 lines)
**Tabs:**
- **accounts** — Bank accounts list with summary cards (total cash, count). Create dialog with: bankName, accountName, accountNumber, iban, currency, accountType (checking/savings/overdraft/loan), glAccountId (from GL account dropdown), balance.
- **reconciliation** — Bank reconciliation with account selector dropdown. Fetch `/api/accounting/bank-reconciliation?companySlug=X&bankAccountId=Y`. Shows matched/unmatched items with summary cards (bank total, book total, difference, match count). Match button per item. Complete button when all matched.
- **import** — CSV import with textarea for CSV content (not file upload), bank account selector, import button → POST `/api/accounting/bank-import` with JSON body `{accountId, csvContent, companySlug}`. Result display with imported/skipped/errors.
- **transfer** — Transfer form with: fromAccount, toAccount (shows balance per account), amount, currency (auto-sets from source account), date, description → POST `/api/accounting/bank-transfer`. Transfer list table with all columns.

### 3. PayrollWpsView.tsx (~385 lines)
**Tabs:**
- **payroll** — Select month + POST `/api/accounting/payroll` to calculate. Summary cards: total basic, allowances, social insurance, deductions, net. Employee list table with full breakdown columns (basic, allowances, social insurance, deductions, net, currency, status). Calculate button and refresh button.
- **wps** — WPS files grouped per country (KW/SA/AE). Country selector + month input + generate button per country → POST `/api/accounting/wps`. Per-country sections with header showing country total. Table per country: month, employee count, amount, generated date, status badge, action buttons (submit/download). Overall summary cards.

## Pattern Compliance
- "use client" components ✓
- `const { activeCompany } = useBrand()` for tenant ✓
- `authedFetch(url)` for API calls ✓
- `toast` from "sonner" for notifications ✓
- `cn()` from "@/lib/utils" for conditional classes ✓
- Inline useState for all form fields ✓
- RTL Arabic labels everywhere ✓
- Shared style constants (thStyle, tdStyle, inputStyle, labelStyle) ✓
- lucide-react icons ✓
- eslint-disable comments for setState-in-effect rule ✓

## Lint Status
- All 3 files pass ESLint with zero errors ✓
- Dev server compiles successfully ✓
