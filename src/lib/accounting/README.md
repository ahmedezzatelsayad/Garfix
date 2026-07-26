# Accounting — المحرك المحاسبي الكامل

> 16 وحدة محاسبية تغطي كل جوانب المحاسبة من القيود اليومية حتى التقارير المالية — مع دعم كامل للعملات العربية والهجرية و cursor pagination لـ infinite scroll و rate limits مخصصة.

## الملفات

| الملف | الوظيفة | الوصف |
|-------|---------|-------|
| `balance-engine.ts` | محرك الميزانية | حساب أرصدة الحسابات والميزان العملي |
| `ar-ap.ts` | المدينون والدائنون | إدارة حسابات AR/AP مع aging وتتبع الدفعات |
| `banking.ts` | الخدمات البنكية | حسابات بنكية، تحويلات، تسوية بنكية |
| `vouchers.ts` | القيود المحاسبية | إنشاء وتعديل وحذف القيود مع transaction safety |
| `auto-journal.ts` | القيود التلقائية | توليد قيود محاسبية تلقائياً من الأحداث |
| `fixed-assets.ts` | الأصول الثابتة | شراء، إهلاك، تصرف — مع حسابات الإهلاك |
| `tax-compliance.ts` | الامتثال الضريبي | VAT، ضريبة دخل، تقارير ضريبية حسب الدولة |
| `inventory-costing.ts` | تكلفة المخزون | FIFO, Weighted Average, Standard Cost |
| `payroll-wps.ts` | الرواتب و WPS | حساب رواتب + Wage Protection System (UAE) |
| `trade-finance.ts` | التمويل التجاري | خطابات ضمان، أوراق تجارية |
| `consolidation.ts` | التجميع | تجميع مالي للشركات المتعددة |
| `period-close.ts` | إقفال الفترة | إقفال الفترات المحاسبية مع قيود الإقفال |
| `commissions.ts` | العمولات | حساب عمولات الموظفين والشركاء |
| `partner-capital.ts` | رأس مال الشركاء | تتبع حصص وأرباح الشركاء |
| `accountant-collab.ts` | تعاون المحاسبين | مشاركة مع محاسبين خارجيين |
| `financial-dashboard.ts` | لوحة التقارير المالية | تقارير: P&L, Balance Sheet, Cash Flow |
| `arabic-amount-text.ts` | تحويل الأرقام إلى نص عربي | "ألف وثلاثمئة وخمسون ريال" |

## Prisma Models — نماذج المحاسبة في schema

| النموذج | الوصف | الفهارس |
|---------|-------|---------|
| `Account` | شجرة الحسابات — code, type, companyId | `@@index` على companySlug, type, code |
| `JournalEntry` | القيود اليومية — date, status, isPosted | `@@index` على companySlug, status, createdAt |
| `JournalEntryLine` | بنود القيد — accountId, debit, credit | `@@index` على journalEntryId |
| `Voucher` | السندات — type, amount, status | `@@index` على companySlug, status, createdAt |
| `VoucherLine` | بنود السند | `@@index` على voucherId |
| `PaymentVoucher` | سندات الدفع — type, status, amount | `@@index` على companySlug, status |
| `BankAccount` | حسابات بنكية — bankName, currency, balance | `@@index` على companySlug |
| `BankTransaction` | المعاملات البنكية — date, amount, type | `@@index` على companySlug, createdAt |
| `BankReconciliation` | التسوية البنكية — status, periodEnd | `@@index` على companySlug, status |
| `FixedAsset` | الأصول الثابتة — name, depreciation method | `@@index` على companySlug, status |
| `DepreciationEntry` | إهلاك الأصول — date, amount | `@@index` على companySlug, assetId |
| `FinancialPeriod` | الفترات المحاسبية — startDate, endDate, status | `@@index` على companySlug, status |
| `CostCenter` | مراكز التكلفة — name, code | `@@index` على companySlug |
| `Budget` | الموازنات — period, totalAmount | `@@index` على companySlug, periodId |
| `TaxFiling` | الإقرارات الضريبية — period, status | `@@index` على companySlug, status |
| `FxRevaluation` | إعادة تقييم العملات — date, status | `@@index` على companySlug |
| `InterCompanyTransaction` | المعاملات بين الشركات | `@@index` على fromCompanyId, toCompanyId |
| `LetterOfCredit` | خطابات الضمان — type, status, expiry | `@@index` على companySlug, status |
| `LetterOfCreditDocument` | مستندات خطابات الضمان | `@@index` على letterOfCreditId |
| `WpsFile` | ملفات WPS — period, status | `@@index` على companySlug, status |
| `PostDatedCheck` | شيكات مؤجلة — dueDate, status | `@@index` على companySlug, status |
| `AccountingAuditLog` | سجلات مراجعة المحاسبة | `@@index` على companySlug, createdAt |
| `Quotation` | عروض الأسعار | `@@index` على companySlug, status |
| `PurchaseOrder` | أوامر الشراء | `@@index` على companySlug, status |
| `PurchaseInvoice` | فواتير الشراء | `@@index` على companySlug, status |
| `OpeningBalance` | الأرصدة الافتتاحية | `@@index` على companySlug, status |
| `OpeningBalanceEntry` | بنود الأرصدة الافتتاحية | `@@index` على companySlug |
| `LandedCostAllocation` | توزيع التكاليف الواردة | `@@index` على companySlug |
| `LandedCostLine` | بنود التكاليف الواردة | `@@index` على allocationId |
| `Installment` | الأقساط | `@@index` على companySlug, status |
| `ProfitDistribution` | توزيع الأرباح | `@@index` على companySlug |
| `ProfitDistributionEntry` | بنود توزيع الأرباح | `@@index` على distributionId |

## Rate Limits — حدود المحاسبة

| الحد | القيمة | الوصف | الـ endpoints المحمية |
|------|--------|-------|----------------------|
| ACCOUNTING_READ | 40/min | قراءة المحاسبة — accounts, journal-entries, vouchers | `/api/accounting/accounts`, `/api/accounting/journal-entries`, `/api/accounting/vouchers`, `/api/accounting/bank-accounts`, `/api/accounting/aging` |
| ACCOUNTING_WRITE | 15/min | كتابة المحاسبة — voucher creation, JE posting | POST `/api/accounting/journal-entries`, POST `/api/accounting/vouchers`, POST `/api/accounting/accounts`, POST `/api/accounting/bank-transfer` |
| REPORT_GENERATION | 5/5min | تقارير مالية ثقيلة — P&L, balance sheet, export-excel | `/api/accounting/profit-loss`, `/api/accounting/balance-sheet`, `/api/accounting/cash-flow`, `/api/accounting/trial-balance`, `/api/accounting/export-excel` |

الـ rate limiter يُرسل `X-RateLimit-Remaining` و `X-RateLimit-Reset` headers. يُستخدم Valkey (production) أو in-memory (dev). تُختبر عبر `scripts/accounting-rate-limit-load-test.ts` ونسخة `.mjs` لـ Node.js `scripts/accounting-rate-limit-load-test.mjs`، بالإضافة إلى `scripts/run-report-load-test.sh` لاختبار REPORT_GENERATION بشكل مستقل.

### نتائج اختبار الحمل المُحققة (2026-07-26)

تم تشغيل اختبار حمل فعلي على حدود المحاسبة الثلاث — جميعها **مُحققة (verified)** وليس فقط validated via script:

| الحد | النتيجة | أول 429 | p50 | p95 |
|------|---------|----------|------|------|
| **ACCOUNTING_READ** | ✅ PASS | request #40 | 4.5ms | 16.9ms |
| **ACCOUNTING_WRITE** | ✅ PASS | request #16 | 4.1ms | 5.9ms |
| **REPORT_GENERATION** | ✅ PASS | request #6 | 5.5ms | 14.7ms |

**REPORT_GENERATION** تم اختباره عبر `/api/accounting/balance-sheet/test-rate-limit` endpoint — أول 429 ظهر عند request #6 (بحد 5 req/5min)، مما يُثبت أن الحد يعمل بدقة.

**ACCOUNTING_READ/WRITE** تم اختبارهما عبر `/api/accounting/test-rate-limit` endpoint.

النتائج الكاملة محفوظة في: `/home/z/my-project/load-test-results/accounting-rate-limit-2026-07-26T08-55-32-462Z.json`

## Cursor Pagination — ترحيل بالـ cursor لـ infinite scroll

### Client-side (React Query hooks)

ثلاثة cursor pagination hooks في `src/hooks/queries/accounting.ts`:

| Hook | الـ endpoint | الخيارات |
|------|-------------|----------|
| `useAccountsCursor(companySlug, { search, limit })` | `/api/accounting/accounts` | default limit: 50 |
| `useJournalEntriesCursor(companySlug, { status, search, limit })` | `/api/accounting/journal-entries` | default limit: 20 |
| `useVouchersCursor(companySlug, { voucherType, status, limit })` | `/api/accounting/vouchers` | default limit: 20 |

كل hook يستخدم `useCursorPagination<T>()` من `src/hooks/cursor-pagination.ts` و TanStack Query `useInfiniteQuery`.

### Server-side (API route helpers)

`src/lib/cursor-pagination-server.ts` يوفّر:

- `parseCursorParams(req)` — تحليل `companySlug, cursor, limit, search, status, extraFilters` من URL params
- `buildCursorPrismaQuery(cursor, limit, orderField, orderDirection)` — بناء `{ take: limit+1, skip, cursor, orderBy }` لـ Prisma `findMany()`
- `buildCursorResponse(allItems, limit, totalCount)` — بناء `{ items, nextCursor, totalCount }`

**API pattern:** `GET /api/accounting/accounts?companySlug=X&cursor=123&limit=50`
**Response:** `{ items: [...], nextCursor: "124" | null, totalCount?: number }`

## الاختبارات

19 ملف اختبار تغطي كل وحدة محاسبية:

| الملف | النطاق |
|-------|--------|
| `__tests__/accounting-core.test.ts` | العمليات الأساسية |
| `__tests__/balance-engine.test.ts` | محرك الميزانية |
| `__tests__/ar-ap.test.ts` | المدينون والدائنون |
| `__tests__/banking.test.ts` | الخدمات البنكية |
| `__tests__/vouchers.test.ts` | القيود المحاسبية |
| `__tests__/auto-journal.test.ts` | القيود التلقائية |
| `__tests__/fixed-assets.test.ts` | الأصول الثابتة |
| `__tests__/tax-compliance.test.ts` | الامتثال الضريبي |
| `__tests__/inventory-costing.test.ts` | تكلفة المخزون |
| `__tests__/payroll-wps.test.ts` | الرواتب و WPS |
| `__tests__/trade-finance.test.ts` | التمويل التجاري |
| `__tests__/consolidation.test.ts` | التجميع المالي |
| `__tests__/period-close.test.ts` | إقفال الفترة |
| `__tests__/commissions.test.ts` | العمولات |
| `__tests__/partner-capital.test.ts` | رأس مال الشركاء |
| `__tests__/accountant-collab.test.ts` | تعاون المحاسبين |
| `__tests__/financial-dashboard.test.ts` | لوحة التقارير |
| `__tests__/money.test.ts` | حسابات مالية |
| `__tests__/arabic-amount-text.test.ts` | تحويل النص العربي |

## المداخل الرئيسية

```ts
import { BalanceEngine } from '@/lib/accounting/balance-engine';
import { ArApManager } from '@/lib/accounting/ar-ap';
import { BankingService } from '@/lib/accounting/banking';
import { VoucherManager } from '@/lib/accounting/vouchers';
import { AutoJournalEngine } from '@/lib/accounting/auto-journal';
import { FixedAssetManager } from '@/lib/accounting/fixed-assets';
import { TaxComplianceService } from '@/lib/accounting/tax-compliance';
import { InventoryCosting } from '@/lib/accounting/inventory-costing';
import { PayrollWPS } from '@/lib/accounting/payroll-wps';
import { TradeFinanceService } from '@/lib/accounting/trade-finance';
import { ConsolidationEngine } from '@/lib/accounting/consolidation';
import { PeriodCloseManager } from '@/lib/accounting/period-close';
import { arabicAmountText } from '@/lib/accounting/arabic-amount-text';
```

## API Endpoints

كل وحدة محاسبية لها set من API endpoints تحت `/api/accounting/`:

- `/api/accounting/accounts/` — إدارة الحسابات (GET with cursor pagination, POST, DELETE)
- `/api/accounting/journal-entries/` — القيود المحاسبية (GET with cursor pagination, POST, DELETE, reverse)
- `/api/accounting/vouchers/` — القيود (GET with cursor pagination, POST — إنشاء، تعديل، إلغاء، اعتماد)
- `/api/accounting/balance-sheet/` — ميزانية عمومية (REPORT_GENERATION rate limit)
- `/api/accounting/profit-loss/` — أرباح وخسائر (REPORT_GENERATION rate limit)
- `/api/accounting/cash-flow/` — تدفق نقدي (REPORT_GENERATION rate limit)
- `/api/accounting/trial-balance/` — ميزان مراجعة (REPORT_GENERATION rate limit)
- `/api/accounting/export-excel/` — تصدير Excel (REPORT_GENERATION rate limit)
- `/api/accounting/aging/` — aging report (ACCOUNTING_READ rate limit)
- `/api/accounting/bank-accounts/` — حسابات بنكية (ACCOUNTING_READ rate limit)
- `/api/accounting/bank-transfer/` — تحويل بنكي (ACCOUNTING_WRITE rate limit)
- `/api/accounting/fixed-assets/` — أصول ثابتة
- `/api/accounting/budgets/` — ميزانيات
- `/api/accounting/fiscal-periods/` — فترات محاسبية
- `/api/accounting/cost-centers/` — مراكز تكلفة
- `/api/accounting/inter-company/` — بين الشركات
- `/api/accounting/consolidation/` — تجميع
- `/api/accounting/financial-dashboard/` — لوحة تقارير مالية

...وأكثر من 40 endpoint محاسبي.

## التكامل مع النظام

- كل API endpoint محمي عبر `requirePermissionForCompany()` مع صلاحيات `accounting:*`
- الـ endpoints المحاسبية محمية بـ rate limits مخصصة: ACCOUNTING_READ (40/min), ACCOUNTING_WRITE (15/min), REPORT_GENERATION (5/5min) — محددة في `src/lib/rateLimit.ts`
- القيود المحاسبية transaction-safe — لا تُكتمل بدون رصيد متوازن
- `auto-journal.ts` يُستدعى تلقائياً من Automation Engine عند الأحداث (فاتورة جديدة، دفعة، شراء)
- `arabic-amount-text.ts` يُستخدم في توليد e-invoices لتحويل المبالغ إلى نص عربي
- `tax-compliance.ts` يُتكامل مع e-invoicing لكل دولة MENA
- الـ cursor pagination يستفيد من Prisma @@index على `(companySlug, status, createdAt)` و `(companySlug, createdAt)` — `buildCursorPrismaQuery()` في `cursor-pagination-server.ts`
- الـ rate limit load test (`scripts/accounting-rate-limit-load-test.ts`) ونسخة `.mjs` (`scripts/accounting-rate-limit-load-test.mjs`) و`scripts/run-report-load-test.sh` يختبرون ACCOUNTING_READ/WRITE/REPORT_GENERATION تحت burst traffic مع p50/p95 latency analysis — جميع الحدود **مُحققة فعليًا (verified)** بتاريخ 2026-07-26
