# Scripts — أدوات البذرة، الاختبار، والأتمتة

> ~35 سكريبت TypeScript و Shell لأداء مهام التطوير: بذر البيانات، اختبار الأداء، النسخ الاحتياطي، والتوليد التلقائي للاختبارات، بما في ذلك سكريبتات ترحيل Decimal واختبارات التجاوب.

## الفئات

### بذر البيانات والنسخ الاحتياطي

| الملف | الوظيفة |
|-------|---------|
| `seed.ts` | بذر قاعدة البيانات بشركات وبيانات واقعية (10 → 25,000 شركة) |
| `seed-model-registry.ts` | بذر سجل نماذج AI الافتراضية |
| `backup.ts` | نسخ احتياطي لقاعدة البيانات |
| `archiveAuditLogs.ts` | أرشفة سجلات التدقيق القديمة |

### اختبار الأداء (Benchmarks)

| الملف | الوظيفة |
|-------|---------|
| `bench-free-models.ts` | اختبار سرعة النماذج المجانية |
| `bench-ai-effectiveness.ts` | قياس فعالية AI في الاستخراج |
| `bench-deepseek-focused.ts` | اختبار مُركّز على DeepSeek |
| `bench-openrouter-free-speed.ts` | سرعة النماذج المجانية عبر OpenRouter |
| `bench-productMatcher.ts` | اختبار مطابقة المنتجات بالـ AI |
| `capability-benchmark.ts` | اختبار قدرات النماذج المتعددة |
| `auto-benchmark.ts` | تشغيل تلقائي للـ benchmarks |
| `production-benchmarks.ts` | اختبارات أداء بيئة الإنتاج |
| `production-load-benchmark.ts` | اختبار تحميل إنتاجي |

### اختبار التحميل والبنية التحتية

| الملف | الوظيفة |
|-------|---------|
| `scale-load-test.ts` | اختبار تحميل متدرج (100 → 10000 طلب) |
| `load-test.ts` | اختبار تحميل إنتاجي على الـ API (p50/p90/p95/p99) |
| `load-test.sh` | اختبار تحميل Shell باستخدام curl/ab/k6 |
| `test-infra.ts` | فحص صحة البنية التحتية (Valkey, DB, Queues) |
| `load-model-probe.ts` | فحص تحميل النماذج والـ providers |
| `test-vault.ts` | اختبار نظام التخزين الآمن (Vault) |
| `digital-twin.ts` | محاكاة Digital Twin للنظام |

### Invoice Brain Tests

| الملف | الوظيفة |
|-------|---------|
| `test-invoice-brain-100.ts` | اختبار Invoice Brain بـ 100 فاتورة |
| `test-invoice-brain-normalization.ts` | اختبار توحيد البيانات (عملات، تواريخ، أسماء) |

### اتصال AI والتحقق

| الملف | الوظيفة |
|-------|---------|
| `test-deepseek-connection.ts` | اختبار سريع: التحقق من اتصال OpenRouter + DeepSeek |
| `verification_tests.ts` | اختبارات تحقق runnable لكل بند في التقرير التقني v12.1.0 |
| `founder-validation-suite.ts` | تشغيل Founder Validation Suite الكامل (11 قسم) |

### ترحيل Decimal والتجاوب

> سكريبتات مرتبطة بترحيل الحقول المالية من String إلى Decimal (ADR 002) واختبارات التجاوب مع الأجهزة.

| الملف | الوظيفة |
|-------|---------|
| *(سكريبتات ترحيل Decimal)* | ترحيل الحقول المالية (`String → Decimal`) — تُشغّل بالتتابع مع seed |
| *(اختبارات التجاوب)* | اختبار أحجام الشاشة (viewport) في Playwright — تُشغّل عبر `bunx playwright test --project=mobile` |

> **ملاحظة**: سكريبتات ترحيل Decimal واختبارات التجاوب قد تُضاف لاحقاً كملفات مستقلة أو تُدار عبر الـ ADR (انظر `docs/adr/002-decimal-monetary-fields.md` و `docs/MOBILE_RESPONSIVE_REPORT.md`).

### التوليد التلقائي والصيانة

| الملف | الوظيفة |
|-------|---------|
| `write-tests.sh` | توليد اختبارات تلقائياً |
| `write-tests-b.sh` | توليد مجموعة B من الاختبارات |
| `write-tests-c.sh` | توليد مجموعة C من الاختبارات |
| `write-test-batch-a.sh` | توليد دفعة A |
| `write-test-batch-b.sh` | توليد دفعة B |
| `write-test-batch-c.sh` | توليد دفعة C |
| `fix-deep-tests.sh` | إصلاح الاختبارات العميقة |
| `rewrite-deep.sh` | إعادة كتابة الاختبارات العميقة |
| `configure-openrouter-deepseek.ts` | إعداد OpenRouter + DeepSeek |

### أدوات إضافية

| الملف | الوظيفة |
|-------|---------|
| `generate-evidence-pack.ts` | توليد حزمة أدلة للتدقيق |

## التشغيل

```bash
# بذر البيانات
bun run scripts/seed.ts

# اختبار الأداء
bun run scripts/bench-free-models.ts

# اختبار التحميل (TypeScript)
bun run scripts/load-test.ts

# اختبار التحميل (Shell)
bash scripts/load-test.sh

# اختبار البنية التحتية
bun run scripts/test-infra.ts

# اتصال DeepSeek
bun run scripts/test-deepseek-connection.ts

# اختبارات التحقق التقني
bun test scripts/verification_tests.ts

# Founder Validation Suite
bun run scripts/founder-validation-suite.ts

# توليد اختبارات
bash scripts/write-tests.sh
```
