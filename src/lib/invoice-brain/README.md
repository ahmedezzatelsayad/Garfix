# Invoice Brain — استخراج الفواتير الهجين

> Pattern-first, AI-fallback-with-learning: صفر تكلفة AI على الأشكال المتكررة.

## كيف يعمل

```
فاتورة واردة
    │
    ▼
Fingerprint (بصمة الشكل) ─── هل نعرف هذا الشكل؟
    │                              │
    ├─ نعم ──► Template Match ──► Regex Extraction (تكلفة = 0)
    │
    └─ لا ──► AI Fallback (LLM) ──► حفظ Template للمرات القادمة
                    │
                    ▼
              حفظ النمط في PatternStore
```

## المبدأ

عندما تأتي فاتورة لأول مرة من مورد جديد، يُستدعى الـ LLM مرة واحدة لاستخراج البيانات. النتيجة تُحفظ كـ template (خريطة أعمدة + regex patterns). في المرات التالية، الاستخراج يتم بالـ regex فقط — **تكلفة AI = صفر**.

## الملفات

| الملف | الوظيفة |
|-------|---------|
| `fingerprint.ts` | إنشاء بصمة فريدة لشكل الفاتورة |
| `patternStore.ts` | تخزين واسترجاع الأنماط (Prisma) |
| `patternParser.ts` | تطبيق الـ regex patterns للاستخراج |
| `aiFallback.ts` | استدعاء LLM عند عدم وجود نمط |
| `learning-engine.ts` (في ai-fabric) | تحويل نتيجة AI إلى نمط قابل للتكرار |
| `normalize.ts` | توحيد العملات والتواريخ والأسماء |
| `schema.ts` | InvoiceSchema — Zod validation |
| `verifyExtraction.ts` | فحص صحة البيانات المستخرجة |
| `extractFromSource.ts` | نقطة الدخول: يحدد نوع المصدر (PDF, Excel, image) |
| `excelParser.ts` | محلل ملفات Excel |
| `ocrAdapter.ts` | محول OCR للصور |
| `garfixAdapter.ts` | تحويل النتيجة لتناسب Schema الخاص بـ GarfiX |
| `headerMapStore.ts` | خريطة تسميات الأعمدة (عربي/إنجليزي) |

## المداخل الرئيسية

```ts
import { extractInvoice } from '@/lib/invoice-brain/extractInvoice';
import { PrismaPatternStore } from '@/lib/invoice-brain/patternStore';
import { InvoiceSchema } from '@/lib/invoice-brain/schema';
```

## API Endpoint

```
POST /api/ai/invoice-brain/extract
GET  /api/ai/invoice-brain/stats
```