# Task: GarfiX ERP Accounting Module - Phase 1 & Phase 2

## Agent: Z.ai Code (Primary)

## Work Completed

### 1. Prisma Schema Updates
- Added `InstallmentSchedule` and `Installment` models to `prisma/schema.prisma`
- Added relations to `Invoice` model (`installmentSchedules`) and `Company` model (`installmentSchedules`)
- Generated Prisma Client successfully

### 2. Library Files Created (`src/lib/accounting/`)

#### auto-journal.ts
- `createInvoiceJE()` — Auto JE for invoice creation (AR/Sales/VAT)
- `createInvoicePaymentJE()` — Auto JE for payment received (Cash/AR)
- `createInvoiceCancelJE()` — Auto JE for invoice cancellation (reversal of original)
- `createExpenseJE()` — Auto JE for expenses (expense account/AP or Cash)
- `createSalaryPaymentJE()` — Auto JE for payroll (Salaries/Social Insurance/Gratuity/Cash)
- `createPurchaseJE()` — Auto JE for purchase invoices (Purchases/VAT Receivable/AP)
- `createVATReturnJE()` — Auto JE for VAT return payment (VAT Payable/Cash)
- `createAssetDisposalJE()` — Auto JE for asset disposal (Cash/AccDep/FixedAsset/GainLoss)
- All functions: use `db.$transaction`, `num()` for money, `logAudit`, `isDebitNormal` balance logic

#### period-close.ts
- `closeFiscalPeriod()` — Verifies period open, no drafts, calculates net income, creates closing JE (Revenue→Income Summary→Retained Earnings), marks period closed
- `reopenFiscalPeriod()` — Requires `period_reopen` permission, reverses closing JE, marks period open, logs reason
- `preventPostingToClosedPeriod()` — Throws error if date falls in closed/locked period

#### balance-engine.ts
- `getDerivedBalance()` — Calculates balance from posted JE lines (not stored), supports `asOfDate` filter
- `reconcileAccountBalances()` — Compares stored vs derived for all accounts, optionally fixes discrepancies
- `recalculateAndFixAllBalances()` — Force recalculates all balances from JE lines, updates stored, returns before/after

#### ar-ap.ts
- `calculateAging()` — 30/60/90+ day aging report for AR (receivable) or AP (payable)
- `getClientStatement()` — Detailed client statement with invoices, payments, running balance
- `getSupplierStatement()` — Detailed supplier statement with purchases, payments, running balance
- `scheduleInstallments()` — Breaks invoice into installment schedule with due dates

### 3. API Routes Created (`src/app/api/accounting/`)

| Route | Methods | Purpose |
|-------|---------|---------|
| `fiscal-periods/route.ts` | GET, POST, PATCH (close/reopen) | List/create/close/reopen fiscal periods |
| `fiscal-periods/[id]/route.ts` | GET, PATCH, DELETE | Single fiscal period CRUD |
| `cost-centers/route.ts` | GET, POST | List/create cost centers |
| `cost-centers/[id]/route.ts` | PATCH, DELETE | Update/delete cost center |
| `aging/route.ts` | GET | Aging report (receivable/payable) |
| `client-statement/route.ts` | GET | Client account statement |
| `supplier-statement/route.ts` | GET | Supplier account statement |
| `post-dated-checks/route.ts` | GET, POST | List/create PDCs |
| `post-dated-checks/[id]/route.ts` | GET, PATCH | Single PDC with status transitions |
| `installments/route.ts` | GET, POST | List/create installment schedules |

### Patterns Followed
- ALL endpoints use `withErrorHandler` wrapper
- ALL mutations use `requirePermissionForCompany` for auth + tenant scoping
- ALL mutations log audit via `logAudit`
- ALL validations use Zod schemas
- ALL monetary values as String (no Float), use `num()` with 3 decimal scale
- Source types include all required values per spec
- Balance updates use `isDebitNormal` pattern from existing JE route

### Lint Results
- All new files pass ESLint with zero errors
- Only pre-existing errors in unrelated files (status/page.tsx)

### Dev Server
- Running on port 3000, responding to requests successfully
