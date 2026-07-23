# E-Invoicing — الفوترة الإلكترونية لمنطقة MENA

> نظام فوترة إلكتروني شامل يغطي 6 دول في منطقة الخليج والشرق الأوسط — مع validation، retention، و routing.

## التغطية

| الدولة | الملف | المعيار | ملف Validation |
|--------|-------|---------|---------------|
| السعودية | `zatca.ts` | ZATCA Phase 2 | `zatca-validation.ts` |
| الإمارات | `uae-fta.ts` | UAE FTA | `uae-fta-validation.ts` |
| مصر | `egypt-eta.ts` | Egyptian Tax Authority | `egypt-eta-validation.ts` |
| الكويت | `kuwait.ts` | Kuwait Decree 10/2026 | `kuwait-validation.ts` |
| البحرين | `bahrain-nbr.ts` | Bahrain NBR | — |
| عمان | `oman-tax.ts` | Oman Tax Authority | — |
| التوجيه | `router.ts` | Unified routing per country | — |
| الأرشفة | `retention.ts` | Retention policies per jurisdiction | — |

## الملفات الإضافية

| الملف | الوظيفة |
|-------|---------|
| `zatca-certs.ts` | إدارة شهادات ZATCA (generation, signing, verification) |

## ملفات الاختبار

7 ملفات اختبار تغطي كل دولة + التوجيه:

| الملف | النطاق |
|-------|--------|
| `__tests__/zatca.test.ts` | السعودية — ZATCA |
| `__tests__/uae-fta.test.ts` | الإمارات — FTA |
| `__tests__/egypt-eta.test.ts` | مصر — ETA |
| `__tests__/kuwait.test.ts` | الكويت |
| `__tests__/bahrain-nbr.test.ts` | البحرين |
| `__tests__/oman-tax.test.ts` | عمان |
| `__tests__/router.test.ts` | التوجيه بين الدول |

## كيف يعمل

```
فاتورة صادرة
    │
    ▼
router.ts ──► تحديد الدولة (حسب company.country أو إعداد)
    │
    ▼
{country}.ts ──► إنشاء XML/JSON بتنسيق الدولة
    │
    ▼
{country}-validation.ts ──► التحقق من:
    │   ├─ Schema validation (Zod/JSON Schema)
    │   ├─ Business rules (required fields, amounts, tax rates)
    │   ├─ Digital signature (ZATCA: ECDSA, UAE: HMAC)
    │   └─ Encoding (Arabic UTF-8, special characters)
    │
    ▼
submit() ──► إرسال للجهة الحكومية
    │
    ▼
retention.ts ──► تخزين حسب سياسة الأرشفة للدولة
```

## المداخل الرئيسية

```ts
import { routeEInvoice } from '@/lib/e-invoicing/router';
import { generateZATCAInvoice } from '@/lib/e-invoicing/zatca';
import { validateZATCAInvoice } from '@/lib/e-invoicing/zatca-validation';
import { generateUAEInvoice } from '@/lib/e-invoicing/uae-fta';
import { validateUAEInvoice } from '@/lib/e-invoicing/uae-fta-validation';
import { generateEgyptETAInvoice } from '@/lib/e-invoicing/egypt-eta';
import { validateEgyptETAInvoice } from '@/lib/e-invoicing/egypt-eta-validation';
import { generateKuwaitInvoice } from '@/lib/e-invoicing/kuwait';
import { validateKuwaitInvoice } from '@/lib/e-invoicing/kuwait-validation';
import { generateBahrainInvoice } from '@/lib/e-invoicing/bahrain-nbr';
import { generateOmanInvoice } from '@/lib/e-invoicing/oman-tax';
import { applyRetentionPolicy } from '@/lib/e-invoicing/retention';
```

## التكامل مع Invoice Brain

البيانات المستخرجة من Invoice Brain تُمرّر عبر validation layer قبل توليد e-invoice:

```
Invoice Brain ──► extractInvoice() ──► verifyExtraction()
                                              │
                                              ▼
                                    e-invoicing/router.ts
                                              │
                                              ▼
                                    {country}-validation.ts
                                              │
                                              ▼
                                    {country}.ts ──► submit()
```

## إضافة دولة جديدة

1. أنشئ ملف `src/lib/e-invoicing/{country}.ts` — توليد الـ e-invoice
2. أنشئ ملف `src/lib/e-invoicing/{country}-validation.ts` — validation rules
3. أضف الدولة في `router.ts` ضمن country routing logic
4. أضف سياسة retention في `retention.ts`
5. أنشئ اختبار `__tests__/{country}.test.ts`
6. أضف الدعم في `gulfConfig.ts`
