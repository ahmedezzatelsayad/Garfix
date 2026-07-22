# Scripts — أدوات البذرة، الاختبار، والأتمتة

> ~30 سكريبت TypeScript و Shell لأداء مهام التطوير: بذر البيانات، اختبار الأداء، النسخ الاحتياطي، والتوليد التلقائي للاختبارات.

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
| `test-infra.ts` | فحص صحة البنية التحتية (Valkey, DB, Queues) |
| `load-model-probe.ts` | فحص تحميل النماذج والـ providers |
| `test-vault.ts` | اختبار نظام التخزين الآمن (Vault) |
| `digital-twin.ts` | محاكاة Digital Twin للنظام |

### Invoice Brain Tests

| الملف | الوظيفة |
|-------|---------|
| `test-invoice-brain-100.ts` | اختبار Invoice Brain بـ 100 فاتورة |
| `test-invoice-brain-normalization.ts` | اختبار توحيد البيانات (عملات، تواريخ، أسماء) |

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
| `founder-validation-suite.ts` | تشغيل Founder Validation Suite الكامل (11 قسم) |

## التشغيل

```bash
# بذر البيانات
bun run scripts/seed.ts

# اختبار الأداء
bun run scripts/bench-free-models.ts

# اختبار البنية التحتية
bun run scripts/test-infra.ts

# Founder Validation Suite
bun run scripts/founder-validation-suite.ts

# توليد اختبارات
bash scripts/write-tests.sh
```