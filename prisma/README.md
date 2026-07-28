# Prisma — قاعدة البيانات

> Schema يحتوي على **83 نموذج** مع **32 @@index directive** يغطي كل نطاقات النظام. تم تصميم الفهارس لتسريع الاستعلامات على companySlug, status, createdAt, والحقول المركبة (composite fields).

## النماذج الرئيسية (Core Business)

| النموذج | الوصف | الفهارس الرئيسية |
|---------|-------|------------------|
| `Company` | بيانات الشركة المستأجرة — slug, plan, currency, country, vatNumber | `@@unique` على slug, code |
| `User` | المستخدمون مع أذونات — role, companyId, email | `@@unique` على email |
| `AppUser` | المستخدمون على مستوى المنصة — platform-level auth | `@@unique` على email |
| `Invoice` | الفواتير — Decimal total, status, companyId | `@@index` على companySlug, status, createdAt |
| `ProductCatalog` | دليل المنتجات — name, category, pricing | `@@index` على companySlug, category |
| `Client` | العملاء — name, email, companySlug | `@@index` على companySlug, status |
| `Supplier` | الموردين — name, contact, companySlug | `@@index` على companySlug |
| `Warehouse` | المستودعات — name, location, companySlug | `@@index` على companySlug |
| `InventoryItem` | عناصر المخزون — stock levels, reorder thresholds | `@@index` على companySlug, warehouseId |
| `StockMovement` | حركات المخزون — type, quantity, date | `@@index` على companySlug, createdAt |
| `Employee` | موظفو HR — name, department, salary | `@@index` على companySlug, department |
| `Post` | بيانات التوافق (compatibility) — title, content | — |

## المحاسبة (Accounting Models — 30+ نماذج)

| النموذج | الوصف | الفهارس |
|---------|-------|---------|
| `Account` | شجرة الحسابات المحاسبية — code, type, companyId | `@@index` على companySlug, type, code |
| `JournalEntry` | القيود اليومية — date, status, isPosted | `@@index` على companySlug, status, createdAt |
| `JournalEntryLine` | بنود القيد — accountId, debit, credit | `@@index` على journalEntryId |
| `Voucher` | السندات — type, amount, status | `@@index` على companySlug, status, createdAt |
| `VoucherLine` | بنود السند — accountId, debit, credit | `@@index` على voucherId |
| `PaymentVoucher` | سندات الدفع — type, status, amount, payee, reference | `@@index` على companySlug, status |
| `BankAccount` | حسابات بنكية — bankName, currency, balance | `@@index` على companySlug |
| `BankTransaction` | المعاملات البنكية — date, amount, type | `@@index` على companySlug, createdAt |
| `BankReconciliation` | التسوية البنكية — status, periodEnd | `@@index` على companySlug, status |
| `FixedAsset` | الأصول الثابتة — name, depreciation method | `@@index` على companySlug, status |
| `DepreciationEntry` | إهلاك الأصول — date, amount | `@@index` على companySlug, assetId |
| `FinancialPeriod` | الفترات المحاسبية — startDate, endDate, status | `@@index` على companySlug, status |
| `CostCenter` | مراكز التكلفة — name, code | `@@index` على companySlug |
| `Budget` | الموازنات — period, totalAmount | `@@index` على companySlug, periodId |
| `TaxFiling` | الإقرارات الضريبية — period, status | `@@index` على companySlug, status |
| `FxRevaluation` | إعادة تقييم العملات — date, status | `@@index` على companySlug |
| `InterCompanyTransaction` | المعاملات بين الشركات — fromCompany, toCompany | `@@index` على fromCompanyId, toCompanyId |
| `LetterOfCredit` | خطابات الضمان — type, status, expiry | `@@index` على companySlug, status |
| `LetterOfCreditDocument` | مستندات خطابات الضمان — documentType, fileName | `@@index` على letterOfCreditId |
| `WpsFile` | ملفات WPS — period, status | `@@index` على companySlug, status |
| `PostDatedCheck` | شيكات مؤجلة — dueDate, status | `@@index` على companySlug, status |
| `AccountingAuditLog` | سجلات مراجعة المحاسبة | `@@index` على companySlug, createdAt |
| `Quotation` | عروض الأسعار — number, client, status | `@@index` على companySlug, status |
| `PurchaseOrder` | أوامر الشراء — number, supplier, status | `@@index` على companySlug, status |
| `PurchaseInvoice` | فواتير الشراء — number, status, vendor | `@@index` على companySlug, status |
| `OpeningBalanceEntry` | بنود الأرصدة الافتتاحية | `@@index` على companySlug |
| `LandedCostAllocation` | توزيع التكاليف الواردة — shipment, totalCost | `@@index` على companySlug |
| `LandedCostLine` | بنود التكاليف الواردة — costType, amount | `@@index` على allocationId |
| `Installment` | الأقساط — number, amount, dueDate, status | `@@index` على companySlug, status |
| `OpeningBalance` | الأرصدة الافتتاحية — period, status | `@@index` على companySlug, status |
| `ProfitDistribution` | توزيع الأرباح — period, totalAmount | `@@index` على companySlug |
| `ProfitDistributionEntry` | بنود توزيع الأرباح — partnerId, amount | `@@index` على distributionId |

## جداول AI Fabric

| النموذج | الوظيفة | الفهارس |
|---------|---------|---------|
| `AIRequestLog` | تسجيل كل طلب AI — tokens, cost, provider, model | `@@index` على companySlug, model, createdAt |
| `CacheEntry` | ذاكرة التخزين المؤقت — key, ttl, hitCount | `@@index` على companySlug, key |
| `AIMemoryEntry` | ذاكرة التعلم — patternHash, confidence, resolvedBy | `@@index` على companySlug, patternHash |
| `RuleCandidate` | القواعد المُتعلمة تلقائياً — pattern, hitCount, active | `@@index` على companySlug, active |
| `BudgetConfig` | إعدادات الميزانية لكل شركة — monthlyLimit, spent, currency | `@@index` على companySlug |
| `JobQueue` | حالة وظائف BullMQ — status, attempts, createdAt | `@@index` على status, createdAt |
| `CompanyRuntime` | بيانات التشغيل لكل مستأجر — lastActivity, metricsSnapshot | `@@index` على companySlug |
| `ProviderConfig` | إعدادات AI providers — name, active, priority | `@@index` على active |
| `GlobalPattern` | الأشكال العالمية — patternHash, hitCount | `@@index` على patternHash |
| `ProfitSnapshot` | لقطات الربحية — period, revenue, cost | `@@index` على companySlug |
| `AIScoreSnapshot` | لقطات AI scores — model, score | `@@index` على companySlug |
| `CompiledRule` | القواعد المُترجمة — expression, active | `@@index` على companySlug, active |
| `AIUsageLog` | سجل استخدام AI — model, tokens, cost | — |

## نظام الـ Webhooks

| النموذج | الوظيفة | الفهارس |
|---------|---------|---------|
| `WebhookEndpoint` | نقاط الـ webhook المسجّلة — url, events, secret, active | `@@index` على companySlug, active |
| `WebhookDelivery` | سجل تسليم — status, attempts, nextRetryAt | `@@index` على endpointId, status, createdAt |

## نظام الأمان (Security Models)

| النموذج | الوظيفة |
|---------|---------|
| `AuditLog` | سجل المراجعة الشامل — userId, action, resource, companyId |
| `Permission` | الصلاحيات — resource, action, scope, level |
| `Module` | الوحدات — name, key, enabled |
| `MFASecret` | أسرار MFA — userId, secret, verified |
| `SessionRegistry` | سجل الجلسات — userId, tokenHash, expiresAt |
| `TamperEvidenceChain` | سلسلة الأدلة — hash, previousHash, data |

## الفوترة والاشتراكات (Billing/SaaS)

| النموذج | الوظيفة |
|---------|---------|
| `FeatureFlag` | مفاتيح الميزات — key, enabled, rolloutPct |
| `PlatformSettings` | إعدادات المنصة — key, value |
| `PlatformSettingsHistory` | تاريخ إعدادات المنصة — key, oldValue, newValue |
| `Notification` | الإشعارات — userId, type, message, read |

## مطابقة المنتجات (Product Matching)

| النموذج | الوظيفة |
|---------|---------|
| `ProductAlias` | أسماء المنتجات البديلة — alias, productId |
| `ProductMatchAudit` | سجل المطابقة — inputName, matchedName, confidence |
| `MatchOverride` | تعديلات المطابقة — inputName, overriddenName |

## ملاحظة مهمة — عمود `total` في Invoice

عمود `total` في جدول `Invoice` تم ترقيته من نوع `String` إلى `Decimal` لدقة الإنتاج (ADR 002). هذا يضمن حسابات مالية دقيقة بدون أخطاء التقريب. Migration: `20260801000000_decimal_migration_monetary_fields`.

## استراتيجية الفهارس (32 @@index)

الفهارس مصممة لتسريع أنماط الاستعلام الشائعة في النظام:

- **`companySlug`** — عزل multi-tenant: كل استعلام يبدأ بـ `WHERE companySlug = ?`
- **`status`** — فلترة الحالات: `WHERE status = 'posted'` أو `WHERE status = 'active'`
- **`createdAt`** — ترتيب زمني: `ORDER BY createdAt DESC` للصفحات و التقارير
- **Composite fields** — فهارس مركبة مثل `@@index([companySlug, status])` و `@@index([companySlug, createdAt])` لضمان أداء الاستعلامات المركبة
- الترحيل بالـ cursor (`nextCursor`) يستفيد من فهارس `id` + `createdAt` — `buildCursorPrismaQuery()` في `cursor-pagination-server.ts`

## البيئات

- **Development:** SQLite مع WAL mode — لا يدعم Decimal بالضبط (falls back to Float)
- **Production:** PostgreSQL — Decimal precision كامل، advisory locks لـ pg-boss

## الأوامر

```bash
# إنشاء migration جديد
bunx prisma migrate dev --name my_migration

# تطبيق migrations في الإنتاج
bunx prisma migrate deploy

# فتح Prisma Studio
bunx prisma studio

# توليد Prisma Client
bunx prisma generate

# فحص حالة migrations
bunx prisma migrate status
```

## الـ Seed

```bash
# تشغيل الـ seeder (10-25000 شركة)
bun run scripts/seed.ts
```

## العلاقة مع cursor-pagination-server.ts

`src/lib/cursor-pagination-server.ts` يوفّر ثلاث وظائف للترحيل بالـ cursor التي تستخدم Prisma directly:

- `parseCursorParams(req)` — تحليل `cursor`, `limit`, `companySlug`, `search`, `status`, `extraFilters` من URL params
- `buildCursorPrismaQuery(cursor, limit, orderField, orderDirection)` — بناء `{ take: limit+1, skip, cursor, orderBy }` لـ `findMany()`
- `buildCursorResponse(allItems, limit, totalCount)` — بناء `{ items, nextCursor, totalCount }` من النتائج

هذه الوظائف تستخدم في accounting endpoints (accounts, journal-entries, vouchers) و كل high-volume routes.
