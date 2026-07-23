# Task: Create 5 bun:test test files for accounting business logic

## Task ID: accounting-tests-001
## Agent: test-writer

## Summary

Created 5 bun:test test files for the GarfiX ERP accounting module, covering pure business logic extracted from each source file. All 245 tests pass (0 failures, 469 expect() calls).

## Test Files Created

### 1. `src/lib/accounting/__tests__/auto-journal.test.ts` (43 tests)
- **makeLine helper**: debit/credit line construction with 3 decimal formatting
- **JE balance validation (توازن القيد)**: balanced/unbalanced/tolerance checks
- **Expense category mapping (تصنيف المصاريف)**: 11 category-to-code mappings
- **Invoice JE line construction (قيد الفاتورة)**: paid/unpaid/VAT/partial scenarios
- **Salary JE calculations (حسابات الرواتب)**: social insurance 9.5%, gratuity 5%, balance validation
- **Asset disposal gain/loss (تخلص من الأصل)**: book value, gain, loss, fully depreciated
- **Reversal (swap debit/credit) — إلغاء القيد**: swap, balance, VAT preservation
- **Purchase JE line construction (قيد المشتريات)**: net/VAT/AP, VAT receivable flag
- **VAT return JE**: 2-line balanced entry
- **AutoJESourceType coverage**: 21 valid source types

### 2. `src/lib/accounting/__tests__/local-payment-rails.test.ts` (63 tests)
- **COUNTRY_METHODS configuration (طرق الدفع المحلية)**: 7 Gulf countries, method counts, Arabic names, valid providers
- **Fee calculation (حساب الرسوم)**: percentage-based (credit cards) vs flat (others)
- **Currency cents conversion (تحويل العملة)**: KWD/BHD/OMR (mill) vs SAR/EGP (cents)
- **Payment amount validation (التحقق من المبلغ)**: positive/zero/negative/null
- **Method lookup by country and ID (بحث عن طريقة الدفع)**: cross-country, non-existent
- **MyFatoorah method mapping**: 9 method IDs → payment names
- **Paymob integration mapping**: 5 EG methods → integration ID 4305
- **Provider determination by country**: myfatoorah (Gulf) vs paymob (Egypt)
- **Payment method types coverage**: 5 types (debit_card, credit_card, digital_wallet, bank_transfer, mobile_wallet)

### 3. `src/lib/accounting/__tests__/partner-capital.test.ts` (36 tests)
- **Ownership percentage extraction (استخراج نسبة الملكية)**: regex parsing, null, 0%
- **Capital account identification (تحديد حساب رأس المال)**: Arabic/English keywords, retained earnings exclusion
- **Profit distribution calculation (حساب توزيع الأرباح)**: explicit/equal/mixed percentages, normalization, zero profit
- **Net profit calculation (حساب صافي الربح)**: revenue/expense/contra-revenue, reversed multiplier, loss scenario
- **Profit distribution validation (التحقق من توزيع الأرباح)**: positive profit, partners, errors
- **JE line construction (قيد توزيع الأرباح)**: balanced, debit retained earnings, credit partners, Arabic descriptions
- **Monetary values**: 3-decimal strings for amounts, 2-decimal for percentages

### 4. `src/lib/accounting/__tests__/accountant-collab.test.ts` (47 tests)
- **Access level permissions (مستويات الوصول)**: read_only/limited_edit/full_edit hierarchy
- **Role name generation (توليد اسم الدور)**: email sanitization, company slug encoding
- **Export file naming (تسمية ملفات التصدير)**: Arabic prefixes (ميزان_مراجعة, دفتر_الأستاذ, قيود_يومية, حزمة_كاملة)
- **Trial balance data (حساب ميزان المراجعة)**: posted/draft/reversed entries, date filtering, grand totals
- **General ledger running balance (الرصيد المتجمع)**: debit-normal vs credit-normal accounts
- **Audit trail filter construction**: entity/entityId/date filters → where clause
- **Audit state serialization**: JSON.stringify/parse, null handling, invalid JSON fallback, round-trip
- **Company validation and display**: null check, Arabic name precedence

### 5. `src/lib/accounting/__tests__/commissions.test.ts` (50 tests)
- **Commission rate extraction (استخراج معدل العمولة)**: regex from description, default 5%, case-insensitive
- **Commission amount calculation (حساب مقدار العمولة)**: sales × rate / 100, rounding
- **Salesperson aggregation (تجميع المبيعات حسب البائع)**: email matching, null/unknown filtering
- **Commission entries building (بناء سجلات العمولات)**: monetary string formatting
- **Total commissions calculation (مجموع العمولات)**: sum, 3-decimal strings
- **JE validation (التحقق من قيد العمولات)**: positive total, zero/empty error
- **JE line construction (بناء قيد العمولات)**: balanced debit/credit, Arabic descriptions
- **JE reference and description**: COMM prefix, period range
- **Commission record description**: rate embedding, round-trip extraction
- **Edge cases**: zero sales, 0% rate, negative sales, 100% rate, very small amounts

## Test Methodology

Following the existing test pattern (banking.test.ts, vouchers.test.ts), all tests:
- Use `import { describe, test, expect } from "bun:test"` (NOT vitest)
- Replicate pure business logic locally (no DB/Prisma imports)
- Test monetary values as 3-decimal strings matching `num()` pattern
- Include Arabic labels in test descriptions
- Cover edge cases (null, zero, negative, rounding)
