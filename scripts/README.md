# Scripts — أدوات البذرة، الاختبار، الأمان، والأتمتة

> ~50 سكريبت TypeScript و Shell و Node.js ESM لأداء مهام التطوير: بذر البيانات، اختبار الأداء، فحص الأمان، النسخ الاحتياطي، والتوليد التلقائي للاختبارات، بما في ذلك سكريبتات ترحيل Decimal، الترحيل بالـ cursor، واختبارات التجاوب.

## الفئات

### بذر البيانات والنسخ الاحتياطي

| الملف | الوظيفة |
|-------|---------|
| `seed.ts` | بذر قاعدة البيانات بشركات وبيانات واقعية (10 → 25,000 شركة) |
| `seed-model-registry.ts` | بذر سجل نماذج AI الافتراضية |
| `backup.ts` | نسخ احتياطي لقاعدة البيانات |
| `archiveAuditLogs.ts` | أرشفة سجلات التدقيق القديمة |

### فحص الأمان (Security)

| الملف | الوظيفة |
|-------|---------|
| `security-scan.sh` | فحص أمني شامل (4 فحوصات): dependency audit + secret leak detection + env validation + config hardening — يُخرج تقرير txt/json — يُستخدم في CI |

**`security-scan.sh` تفصيل الفحوصات:**

| الفحص | الوصف |
|-------|-------|
| **Dependency Audit** | `bun audit` — فحص الثغرات المعروفة في dependencies |
| **Secret Leak Detection** | regex scan لـ AWS keys, OpenAI keys, GitHub PATs, JWTs, private keys, hardcoded passwords — يستثني .env و node_modules |
| **Env Validation** | فحص وجود JWT_SECRET, DATABASE_URL, FOUNDER_EMAIL — فحص طول و entropy — كشف placeholder values — فحص JWT_SECRET ≠ JWT_REFRESH_SECRET |
| **Config Hardening** | فحص security headers في middleware.ts — فحص ACCOUNTING_READ/WRITE/REPORT_GENERATION rate limits في rateLimit.ts — فحص eslint-plugin-security |

```bash
bash scripts/security-scan.sh           # فحص كامل
bash scripts/security-scan.sh --quick   # فحص سريع (بدون bun audit)
bash scripts/security-scan.sh --json    # تقرير JSON لـ CI
```

### اختبار حدود المحاسبة (Accounting Rate Limits)

| الملف | الوظيفة |
|-------|---------|
| `accounting-rate-limit-load-test.ts` | اختبار ACCOUNTING_READ (40/min), ACCOUNTING_WRITE (15/min), REPORT_GENERATION (5/5min) تحت burst traffic — يحسب p50/p95 latency, 429 rate, throughput/min, burst detection |
| `accounting-rate-limit-load-test.mjs` | نسخة Node.js ESM من اختبار حدود المحاسبة — يستخدم `http` module مباشرة بدلاً من Bun `fetch` لتجنب stripped Cookie headers (مطلوب عند تشغيل خادم الإنتاج الفعلي) |
| `run-report-load-test.sh` | تشغيل خادم الإنتاج (`next start`) ثم اختبار REPORT_GENERATION فقط (5/5min)، ثم إيقاف الخادم — مناسب لاختبار rate limit في بيئة إنتاج حقيقية |

**الخيارات:**

```bash
bun run scripts/accounting-rate-limit-load-test.ts                          # إعدادات افتراضية
bun run scripts/accounting-rate-limit-load-test.ts --url=http://localhost:3000 --duration=120 --concurrency=5  # مخصص
bun run scripts/accounting-rate-limit-load-test.ts --auth-token=YOUR_JWT    # مع JWT token
node scripts/accounting-rate-limit-load-test.mjs                             # نسخة Node.js ESM (تدعم Cookie headers)
bash scripts/run-report-load-test.sh                                        # تشغيل خادم الإنتاج + اختبار REPORT_GENERATION فقط
```

**النتائج:** JSON report في `./load-test-results/` مع metadata, results, samples.

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
| `docker-verify.sh` | فحص بيئة Docker للإنتاج |

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

### ترحيل Cursor Pagination

| الملف | الوظيفة |
|-------|---------|
| `cursor-pagination-migration-patterns.ts` | أنماط ترحيل الـ API routes من offset pagination إلى cursor pagination |
| `deploy-cursor-pagination.py` | سكريبت Python لنشر ترحيل الـ cursor على routes عالية الحجم |

### أدوات Prisma Schema

| الملف | الوظيفة |
|-------|---------|
| `add-missing-prisma-models.py` | إضافة النماذج المفقودة إلى schema.prisma |
| `fix-prisma-relations.py` | إصلاح علاقات Prisma في schema |
| `add-prisma-indexes.py` | إضافة @@index directives للنماذج |
| `update-prisma-schema.ts` | تحديث schema.prisma من TypeScript |

### توليد المواصفات والتقارير

| الملف | الوظيفة |
|-------|---------|
| `generate-openapi-spec.ts` | توليد OpenAPI/Swagger specification من route handlers |
| `generate-evidence-pack.ts` | توليد حزمة أدلة للتدقيق |
| `generate-report.js` | توليد تقارير بتنسيق HTML/JSON |
| `garfix_verification_report.py` | توليد تقرير تحقق Python |

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

## التشغيل

```bash
# بذر البيانات
bun run scripts/seed.ts

# فحص الأمان
bash scripts/security-scan.sh
bash scripts/security-scan.sh --json    # تقرير JSON لـ CI

# اختبار حدود المحاسبة (TypeScript / Bun)
bun run scripts/accounting-rate-limit-load-test.ts

# اختبار حدود المحاسبة (Node.js ESM — يُستخدم مع خادم الإنتاج)
node scripts/accounting-rate-limit-load-test.mjs

# اختبار REPORT_GENERATION فقط مع خادم الإنتاج
bash scripts/run-report-load-test.sh

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

# توليد OpenAPI spec
bun run scripts/generate-openapi-spec.ts

# توليد اختبارات
bash scripts/write-tests.sh
```
