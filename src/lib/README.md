# lib — المكتبات المشتركة

> البنية التحتية المشتركة التي تستخدمها جميع الوحدات والـ API handlers في GarfiX — **45 ملف جذر + 10 مكتبات فرعية** تغطي الأمان، المحاسبة، الفوترة، الذكاء الاصطناعي، الفوائر الإلكترونية، والتكاملات.

---

## 📁 الملفات الجذرية (45 ملف)

### الأمان والمصادقة

| الملف | الوظيفة |
|-------|---------|
| `auth.ts` | JWT + token versioning + session management — إدارة الجلسات وتحقق التوكن |
| `mfa.ts` | المصادقة الثنائية (2FA) — TOTP/backup codes |
| `rbac.ts` | نظام الصلاحيات المتقدم (RBAC) — roles, permissions, hierarchical access |
| `permissions.ts` | صلاحيات الوصول — checks & enforcement layer |
| `tenantScope.ts` | عزل بيانات المستأجرين — multi-tenant data isolation |
| `ssrf.ts` | حماية SSRF — validation & blocking of internal URL requests |
| `cryptoVault.ts` | تشفير/فك تشفير البيانات الحساسة — AES-256 envelope encryption |
| `secretsManager.ts` | إدارة الأسرار — rotation, env-based resolution, production safety |
| `passwordPolicy.ts` | سياسة كلمات المرور — strength validation, expiry, history |
| `cookies.ts` | إدارة cookies — secure, signed, httpOnly cookie handling |
| `webhooks.ts` | نظام Webhooks — registration, delivery, retry, verification |

### البنية التحتية والوسائط

| الملف | الوظيفة |
|-------|---------|
| `middleware.ts` | Auth middleware + tenant resolution + CSRF protection |
| `api.ts` | API helpers: `requirePermissionForCompany()`, `resolveSecret()`, error formatting |
| `rateLimit.ts` | 7 حدود rate limiting مخصصة — per-endpoint, per-tenant |
| `logger.ts` | Structured logging (Pino) — request tracing, audit events |
| `db.ts` | Prisma client مع pool config (SQLite dev / PostgreSQL prod) |
| `valkey.ts` | Valkey/Redis client — cache + pub/sub + rate limit + session store |
| `cache.ts` | طبقة cache عالية المستوى — invalidation, TTL, multi-tenant keys |
| `pubSub.ts` | Pub/Sub نظام — cross-module event broadcasting |
| `queues.ts` | BullMQ queue setup و worker registration |
| `queue-pgboss.ts` | PgBoss queue system — PostgreSQL-backed job queue alternative |
| `storage.ts` | ملفات التخزين — upload, download, signed URLs |

### المراجعة والتتبع

| الملف | الوظيفة |
|-------|---------|
| `audit.ts` | Audit trail — تسجيل كل عملية مع full context |
| `auditExport.ts` | تصدير سجلات المراجعة — CSV, PDF, JSON formats |
| `tamperAudit.ts` | حماية من التلاعب — hash chains, integrity verification |
| `observatory.ts` | مرصد المراقبة — real-time system health & metrics dashboard data |
| `usageMeter.ts` | قياس الاستخدام — per-tenant feature & API usage metering |
| `startupCheck.ts` | فحص بدء التشغيل — dependency verification, config validation |

### الذكاء الاصطناعي (ملفات الجذر)

| الملف | الوظيفة |
|-------|---------|
| `aiProvider.ts` | مزود الذكاء الاصطناعي — provider abstraction & failover |
| `aiConfig.ts` | إعدادات AI — model config, feature flags, tenant overrides |
| `aiProductResolver.ts` | محلل المنتجات AI — intelligent product matching via LLM |
| `aiAgents.ts` | وكلاء AI — autonomous agent orchestration for multi-step tasks |
| `embeddingCache.ts` | تخزين مؤقت للـ embedding vectors — semantic similarity reuse |

### المحاسبة والمالية

| الملف | الوظيفة |
|-------|---------|
| `money.ts` | حسابات مالية — عملات، ضريبة، خصم، rounding (Decimal) |
| `hijri.ts` | تحويل التواريخ الهجرية — Umm al-Qura calendar |
| `gulfConfig.ts` | إعدادات الخليج — VAT rates, currencies, locale per country |
| `accountTemplates.ts` | قوالب الحسابات — Arabic chart of accounts templates per country |
| `plans.ts` | خطط الاشتراك — feature tiers, pricing, limits |
| `gratuity.ts` | نظام المكافآت — referral credits, loyalty bonuses |

### التكاملات والعمليات

| الملف | الوظيفة |
|-------|---------|
| `productMatcher.ts` | مطابقة المنتجات — fuzzy search + AI semantic matching |
| `inventorySync.ts` | مزامنة المخزون — real-time stock level updates |
| `notifications.ts` | نظام الإشعارات — push, SMS, in-app notification dispatch |
| `email.ts` | إرسال البريد الإلكتروني — template rendering, queue-based delivery |
| `backup.ts` | نسخ احتياطي واستعادة — scheduled backups, disaster recovery |
| `founder.ts` | بيانات المؤسس — founder profile & onboarding state |
| `utils.ts` | أدوات مساعدة — shared utility functions (formatting, validation, etc.) |

---

## 📂 المكتبات الفرعية (10 وحدات)

### `ai/` — طبقة الذكاء الاصطناعي (6 ملفات)

التوجيه الذكي، تتبع التكلفة، تحسين النفقات، وإدارة سجل النماذج.

| الملف | الوظيفة |
|-------|---------|
| `smartRouter.ts` | موجه ذكي يختار أفضل model/provider |
| `costTracker.ts` | تتبع تكلفة كل طلب AI |
| `costOptimizer.ts` | محسّن التكلفة: أرخص provider |
| `modelRegistry.ts` | سجل النماذج: capabilities, pricing |
| `contextWindow.ts` | ضغط/تقليم نافذة السياق |
| `context.ts` | بناء سياق الطلب (prompt + history) |

▶ _README مفصل: [`ai/README.md`](./ai/README.md)_

### `ai-fabric/` — محرك الـ 20-phase Cascade (20 ملف)

المحرك الأساسي: cascade pipeline لتقليل تكلفة AI، مع worker prediction، marketplace، digital twin، وprofit engine.

| الملف | الوظيفة |
|-------|---------|
| `gateway.ts` | بواب الـ cascade — البحث، الاستدعاء، التخزين |
| `learning-engine.ts` | محرك التعلم — pattern match + memory retrieval |
| `cost-optimizer.ts` | محسّن التكلفة — rule evaluation (regex, heuristics) |
| `budget-engine.ts` | محرك الميزانية — budget gate + monthly tracking |
| `provider-optimizer.ts` | محسّن المزود — selection + scoring |
| `cost-per-invoice.ts` | تكلفة الفاتورة — estimation + tracking |
| `ai-economy-engine.ts` | محرك الاقتصاد — AI economy logging & analytics |
| `ai-score.ts` | تسجيل جودة الرد — AI response scoring |
| `scheduler.ts` | جدولة المهام — cron-based task scheduling |
| `cron-runner.ts` | مشغل Cron — periodic cascade maintenance |
| `worker-prediction.ts` | توقع الطلب على AI workers — demand forecasting |
| `worker-marketplace.ts` | سوق العمال — AI capacity trading marketplace |
| `ai-compiler.ts` | مترجم AI — compile tasks into optimized execution plans |
| `digital-twin.ts` | التوأم الرقمي — simulation for cost/quality modeling |
| `profit-engine.ts` | محرك الربح — profit optimization & margin analysis |
| `heat-map.ts` | خريطة حرارية — visual resource utilization heat map |
| `worker-scaler.ts` | مقياس العمال — auto-scaling AI worker capacity |
| `cross-company-intelligence.ts` | ذكاء مشترك — cross-tenant pattern sharing |
| `types.ts` | أنواع TypeScript — CascadePhase, config interfaces |
| `index.ts` | المدخل الرئيسي — unified exports |

▶ _README مفصل: [`ai-fabric/README.md`](./ai-fabric/README.md)_

### `invoice-brain/` — استخراج الفواتير (13 ملف)

| الملف | الوظيفة |
|-------|---------|
| `index.ts` | المدخل الرئيسي — unified extraction API |
| `extractInvoice.ts` | المحرك الرئيسي لاستخراج الفواتير |
| `extractFromSource.ts` | استخراج من مصدر متعدد (PDF, image, Excel) |
| `fingerprint.ts` | بصمة الفاتورة — unique document identification |
| `ocrAdapter.ts` | محول OCR — multi-provider OCR abstraction |
| `aiFallback.ts` | احتياطي AI — LLM-based extraction fallback |
| `patternStore.ts` | مخزن الأنماط — learned extraction patterns |
| `patternParser.ts` | محلل الأنماط — pattern-based extraction |
| `headerMapStore.ts` | مخزن رؤوس الجداول — column header mappings |
| `garfixAdapter.ts` | محول GarfiX — transform to internal invoice format |
| `excelParser.ts` | محلل Excel — spreadsheet invoice parsing |
| `normalize.ts` | توحيد البيانات — field normalization & validation |
| `verifyExtraction.ts` | تحقق الاستخراج — confidence scoring & validation |
| `schema.ts` | مخطط TypeScript — extraction type definitions |

▶ _README مفصل: [`invoice-brain/README.md`](./invoice-brain/README.md)_

### `e-invoicing/` — الفوترة الإلكترونية (12 ملف + 7 اختبارات)

| الملف | الوظيفة |
|-------|---------|
| `router.ts` | موزع الفوترة الإلكترونية — country-specific routing |
| `zatca.ts` | ZATCA (السعودية) — generation & submission |
| `zatca-certs.ts` | شهادات ZATCA — certificate management |
| `zatca-validation.ts` | تحقق ZATCA — compliance validation |
| `uae-fta.ts` | UAE FTA — generation & submission |
| `uae-fta-validation.ts` | تحقق UAE FTA — compliance validation |
| `egypt-eta.ts` | Egypt ETA — generation & submission |
| `egypt-eta-validation.ts` | تحقق Egypt ETA — compliance validation |
| `kuwait.ts` | Kuwait — generation & submission |
| `kuwait-validation.ts` | تحقق Kuwait — compliance validation |
| `bahrain-nbr.ts` | Bahrain NBR — generation & submission |
| `oman-tax.ts` | Oman Tax — generation & submission |
| `retention.ts` | احتفاظ الفواتير — archival & retention policy |

### `accounting/` — المحاسبة (16 ملف + 16 اختبارات)

| الملف | الوظيفة |
|-------|---------|
| `balance-engine.ts` | محرك التوازن — trial balance, P&L, balance sheet |
| `financial-dashboard.ts` | لوحة المالية — KPIs, charts, dashboards |
| `ar-ap.ts` | حسابات المديونين والدائنين — AR/AP management |
| `arabic-amount-text.ts` | نص المبلغ العربي — convert numbers to Arabic text |
| `vouchers.ts` | السندات — voucher creation & management |
| `auto-journal.ts` | القيود التلقائية — auto-journal entry generation |
| `period-close.ts` | إقفال الفترة — month/year end closing |
| `fixed-assets.ts` | الأصول الثابتة — depreciation & asset tracking |
| `tax-compliance.ts` | الامتثال الضريبي — VAT returns & compliance |
| `banking.ts` | البنوك — bank reconciliation & transactions |
| `trade-finance.ts` | التجارة المالية — LC, trade finance instruments |
| `commissions.ts` | العمولات — commission calculation & tracking |
| `payroll-wps.ts` | الرواتب WPS — WPS-compliant payroll processing |
| `partner-capital.ts` | رأس مال الشركاء — capital accounts & profit distribution |
| `inventory-costing.ts` | تكلفة المخزون — FIFO, weighted average costing |
| `accountant-collab.ts` | تعاون المحاسبين — review workflow & comments |

### `billing/` — الفوترة (2 ملف + 1 اختبار)

| الملف | الوظيفة |
|-------|---------|
| `pricing.ts` | التسعير — plan pricing, feature costs |
| `subscription-engine.ts` | محرك الاشتراكات — billing, renewal, upgrade/downgrade |

### `integrations/` — التكاملات الخارجية (7 ملف + 3 اختبارات)

| الملف | الوظيفة |
|-------|---------|
| `index.ts` | المدخل الرئيسي — unified integration API |
| `registry.ts` | سجل التكاملات — available integrations registry |
| `types.ts` | أنواع التكاملات — shared integration interfaces |
| `myfatoorah.ts` | Myfatoorah — payment gateway integration |
| `myfatoorah-refund.ts` | Myfatoorah استرداد — refund processing |
| `myfatoorah-webhook.ts` | Myfatoorah webhook — payment event handling |
| `paymob.ts` | Paymob — alternative payment gateway |
| `whatsapp.ts` | WhatsApp — business messaging integration |
| `meta_ads.ts` | Meta Ads — Facebook/Meta advertising integration |

### `workers/` — عمال BullMQ (5 عمال)

| الملف | الوظيفة |
|-------|---------|
| `emailWorker.ts` | عامل البريد — queue-based email sending |
| `whatsappWorker.ts` | عامل WhatsApp — message delivery |
| `aiProductMatchWorker.ts` | عامل مطابقة المنتجات AI — background product matching |
| `backupWorker.ts` | عامل النسخ الاحتياطي — scheduled backup execution |
| `schedulerWorker.ts` | عامل الجدولة — cron-based task execution |

### `automation/` — محرك الأتمتة (1 ملف)

| الملف | الوظيفة |
|-------|---------|
| `engine.ts` | محرك الأتمتة — trigger-based workflow execution |

### `founder-validation/` — مجموعة اختبار الضغط

مجموعة اختبارات شاملة (>120 اختبار) لتحقق من جودة البيانات، تكلفة AI، المقاييس، والتقارير في بيئة الإنتاج. تشمل:
- **اختبارات التحقق** — data integrity, null safety, type safety
- **اختبارات التكلفة** — per-invoice, per-provider, per-model, annual projection
- **اختبارات المقاييس** — latency, cache hit, error rate, budget analysis
- **اختبارات التلماتري** — recording, aggregation, percentile, filtering
- **اختبارات الضغط** — load tests (100, 500, 1000, 5000, 10000)
- **اختبارات الفشل** — failure injection (Valkey, BullMQ, PostgreSQL, disk, network)
- **اختبارات عميقة** — edge cases, boundary values, Arabic encoding, cross-tenant safety

---

## 🔗 مثال الأمان

```ts
// resolveSecret() يرفض الأسرار المفقودة في بيئة الإنتاج
const key = resolveSecret('OPENROUTER_API_KEY'); // throws in prod if missing

// rbac: فحص الصلاحيات المتقدم
const allowed = await checkPermission(userId, 'invoices.create', companyId);

// ssrf: حماية من الطلبات الداخلية
const safe = validateExternalUrl(userProvidedUrl); // blocks internal IPs
```

## 📊 الإحصائيات

| الفئة | العدد |
|-------|-------|
| ملفات الجذر | 45 |
| `ai/` | 6 |
| `ai-fabric/` | 20 |
| `invoice-brain/` | 13 |
| `e-invoicing/` | 12 |
| `accounting/` | 16 |
| `billing/` | 2 |
| `integrations/` | 7 |
| `workers/` | 5 |
| `automation/` | 1 |
| **الإجمالي (مصدر)** | **112** |
