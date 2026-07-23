# Founder Validation — مجموعة اختبار CTO-level

> ليست عرضاً تجريبياً — مجموعة اختبار ضغط شاملة تُستخدم لضمان جاهزية النظام للإنتاج.
> صُممت لتكشف كل نقطة ضعف قبل وصول المستخدم الأول.

## الإحصائيات

- **1855+** ملف اختبار
  - **100+** ملف اختبار رئيسي (top-level)
  - **80+** ملف اختبار عميق (deep tests)
- **1800+** حالة اختبار
- بيانات محددة بالبذور (seed-based) — نتائج حتمية قابلة للتكرار
- تغطية شاملة: من وحدة الدالة الواحدة إلى اختبارات الضغط على مستوى النظام الكامل

## التشغيل

```bash
# تشغيل كل الاختبارات
bun test src/lib/founder-validation/__tests__/

# تشغيل المجموعة الكاملة مع التقرير
bun run src/lib/founder-validation/index.ts

# عبر API
POST /api/founder-validation
GET  /api/founder-validation/report
```

## الأقسام الـ 11

| # | القسم | الوصف |
|---|-------|-------|
| 1 | **Seeder Validation** | اختبار مولّد البيانات (10, 100, 1000, 10000 شركة) |
| 2 | **Edge Cases** | 20 اختبار حافة: قيم فارغة، حد أقصى، أحرف عربية |
| 3 | **Cost Validation** | حسابات التكلفة: لكل فاتورة، provider، tenant، نموذج |
| 4 | **Metrics** | نسب error rate, cache hit, p50/p95/p99 latency |
| 5 | **Telemetry** | تسجيل الأحداث، تصفية حسب tenant/model/provider |
| 6 | **Scale Tests** | تحميل: 100 → 500 → 1000 → 5000 → 10000 طلب |
| 7 | **Report Validation** | فحص اكتمال التقرير ودقته |
| 8 | **Validation Logic** | سلامة البيانات: معرفات، علاقات، حدود |
| 9 | **Learning Validation** | اختبار محرك التعلم (pattern + memory) |
| 10 | **Failure Injection** | حقن أعطال: Valkey, Postgres, BullMQ, OpenRouter, Network, Disk |
| 11 | **Deep Tests** | 180+ اختبار عميق متخصص (تفصيل أدناه) |

## Deep Tests — 180+ اختبار عميق

القسم الحادي عشر يحتوي على **180+** اختبار عميق تغطي السيناريوهات الحرجة التي تُسبب أعطال الإنتاج إن لم تُعالج:

| المحور | عدد الاختبارات | الوصف |
|--------|---------------|-------|
| **Arabic Encoding** | 25+ | ترميز UTF-8 للنصوص العربية، اتجاه RTL، أحرف خاصة (hamza, tashkeel)، مقاطع BiDi |
| **Cross-Tenant Isolation** | 20+ | عزل بيانات tenants — لا تسريب بيانات بين مؤسسات مختلفة |
| **Concurrent Safety** | 20+ | عمليات متزامنة على نفس الموارد — race conditions, deadlocks |
| **JSON Serialization** | 15+ | دورة serialize/deserialize — فقدان البيانات، أحرف Unicode، تواريخ |
| **Boundary Values** | 15+ | القيم الحدية: صفائف فارغة، أرقام سالبة، نصوص بطول max, overflow |
| **Error Handling** | 15+ | مسارات الأخطاء: رموز HTTP صحيحة، retry منطقي، لا تسريب stack traces |
| **Memory Stability** | 10+ | تسرب الذاكرة تحت ضغط — object retention, cache eviction, GC behavior |
| **Duplicate Checks** | 10+ | كشف ومعالجة السجلات المكررة — idempotency, unique constraints |
| **Recovery & Resilience** | 15+ | استرداد النظام بعد انقطاع — graceful degradation, backoff, circuit breaker |

## ملاحظات

- جميع البيانات تُولّد بناءً على seed رقمي — نفس النتائج في كل تشغيل
- اختبارات Deep تتضمن تحقق من RTL encoding و cross-tenant isolation و concurrent safety
- Failure injection تختبر استرداد النظام تلقائياً بعد انقطاع الخدمة
- كل قسم يمكن تشغيله بشكل مستقل عبر تحديد المسار المناسب في `__tests__/`
