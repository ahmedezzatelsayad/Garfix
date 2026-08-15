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

## التكامل مع AI Fabric Cascade

Invoice Brain يُستدعى في **Phase 2 — Pattern Match** ضمن AI Fabric cascade المتعدد الأطوار:

```
Phase 1: Quick Rule ──► فحص القواعد السريعة (تكلفة = 0)
Phase 2: Pattern Match ──► Invoice Brain (تكلفة = 0 إن وُجد نمط)
Phase 3: AI Fallback ──► LLM extraction (تكلفة ≠ 0)
Phase 4: Human Review ──► مراجعة يدوية عند عدم الثقة
```

النظام يُحوّل الفاتورة إلى Invoice Brain في Phase 2 مباشرةً بعد أن تُرفض في Quick Rule. إن وُجد template مطابق، يُستخرج بدون تكلفة AI وينتقل إلى التحقق. إن لم يُوجد، يُمرّر إلى Phase 3 (AI Fallback) التي تستدعي `aiFallback.ts` — وبعد نجاح الاستخراج، يُسجّل النمط تلقائياً في PatternStore للاستخدام المجاني في المرات التالية.

## التكامل مع الفوترة الإلكترونية (E-Invoicing Validation)

البيانات المستخرجة تُمرّر عبر طبقة تحقق إضافية قبل الإرسال — **E-Invoicing Validation** — التي تضمن مطابقة الفاتورة للقواعد النظامية الخاصة بكل دولة:

| الجهة النظامية | البلد | نوع التحقق |
|---------------|-------|-----------|
| **ZATCA** | السعودية | مطابقة XML/JSON لمعيار ZATCA Phase 2، فحص QR code، timestamp signing |
| **UAE FTA** | الإمارات | مطابقة معيار UAE e-invoicing، فحص VAT number format، signature validation |
| **مستقبلية** | أخرى | قابلية التوسع لأي معيار جديد عبر plugin architecture |

التكامل يحدث تلقائياً بعد `verifyExtraction.ts` — إن كانت الفاتورة مُوجهة لجهة نظامية، يُضاف verify layer خاص يفحص بنية الفاتورة قبل الإرسال ويرفض أي فاتورة لا تستوفي المعيار. هذا يضمن أن البيانات المستخرجة عبر Invoice Brain **صالحة للإرسال النظامي** وليست فقط صالحة من حيث شكل البيانات.

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
