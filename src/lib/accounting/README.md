# Accounting — المحرك المحاسبي الكامل

> 16 وحدة محاسبية تغطي كل جوانب المحاسبة من القيود اليومية حتى التقارير المالية — مع دعم كامل للعملات العربية والهجرية.

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
| `accountTemplates.ts` (في lib/) | قوالب الحسابات | قوالب محاسبية مُساعدة للدول العربية |

## الاختبارات

16 ملف اختبار تغطي كل وحدة محاسبية:

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

- `/api/accounting/accounts/` — إدارة الحسابات
- `/api/accounting/journal-entries/` — القيود المحاسبية
- `/api/accounting/vouchers/` — القيود (إنشاء، تعديل، إلغاء، اعتماد)
- `/api/accounting/balance-sheet/` — ميزانية عمومية
- `/api/accounting/profit-loss/` — أرباح وخسائر
- `/api/accounting/cash-flow/` — تدفق نقدي
- `/api/accounting/aging/` — aging report
- `/api/accounting/bank-accounts/` — حسابات بنكية
- `/api/accounting/fixed-assets/` — أصول ثابتة
- `/api/accounting/budgets/` — ميزانيات
- `/api/accounting/fiscal-periods/` — فترات محاسبية
- `/api/accounting/cost-centers/` — مراكز تكلفة
- `/api/accounting/inter-company/` — بين الشركات
- `/api/accounting/consolidation/` — تجميع
- `/api/accounting/financial-dashboard/` — لوحة تقارير مالية

... وأكثر من 40 endpoint محاسبي.

## التكامل مع النظام

- كل API endpoint محمي عبر `requirePermissionForCompany()` مع صلاحيات `accounting:*`
- القيود المحاسبية transaction-safe — لا تُكتمل بدون رصيد متوازن
- `auto-journal.ts` يُستدعى تلقائياً من Automation Engine عند الأحداث (فاتورة جديدة، دفعة، شراء)
- `arabic-amount-text.ts` يُستخدم في توليد e-invoices لتحويل المبالغ إلى نص عربي
- `tax-compliance.ts` يُتكامل مع e-invoicing لكل دولة MENA
