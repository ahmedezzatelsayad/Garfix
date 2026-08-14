# Prisma — قاعدة البيانات

> Schema يحتوي على **106 نموذج** يغطي كل نطاقات النظام.
> Provider: PostgreSQL (في الإنتاج والتطوير).

## النماذج الرئيسية

| النموذج | الوصف |
|---------|-------|
| `Company` | بيانات الشركة المستأجرة |
| `AppUser` | المستخدمون مع أذونات (uid + email + role) |
| `Invoice` | الفواتير (مع optimistic locking عبر `version`) |
| `Client` | العملاء |
| `Supplier` | الموردين |
| `Warehouse` | المستودعات |
| `InventoryItem` | عناصر المخزون |
| `Employee` | موظفو HR |
| `JournalEntry` | القيود المحاسبية |
| `Account` | الحسابات المحاسبية |

## جداول AI Fabric

| النموذج | الوظيفة |
|---------|---------|
| `AIRequestLog` | تسجيل كل طلب AI |
| `CacheEntry` | ذاكرة التخزين المؤقت |
| `AIMemoryEntry` | ذاكرة التعلم (أنماط محفوظة) |
| `RuleCandidate` | القواعد المُتعلمة تلقائياً |
| `BudgetConfig` | إعدادات الميزانية لكل شركة |
| `JobQueue` | حالة وظائف BullMQ |
| `CompanyRuntime` | بيانات التشغيل لكل مستأجر |

## نظام الـ Webhooks

| النموذج | الوظيفة |
|---------|---------|
| `WebhookEndpoint` | نقاط الـ webhook المسجّلة لكل شركة (secret مشفّر AES-256) |
| `WebhookDelivery` | سجل تسليم كل طلب webhook (status: pending/success/failed) |

## الفوترة الإلكترونية (E-Invoicing)

| النموذج | الوظيفة |
|---------|---------|
| `EInvoice` | بيانات الفوترة الإلكترونية (UUID, clearanceStatus) |
| `ZATCACertificate` | شهادات ZATCA (CCD + signing) |
| جداول e-invoicing الأخرى | التقارير الضريبية لكل دولة |

## المحاسبة

| النموذج | الوظيفة |
|---------|---------|
| `Account` | شجرة الحسابات المحاسبية |
| `JournalEntry` | القيود اليومية (مع immutable trigger) |
| `FiscalPeriod` | الفترات المالية (open/closed) |
| جداول المحاسبة | ميزان المراجعة، الأرباح/الخسائر، التدفق النقدي |

## RBAC

| النموذج | الوظيفة |
|---------|---------|
| `AppUser` | role: viewer/employee/editor/admin/founder |
| `MFASecret` | أسرار TOTP (مشفّرة) + recovery codes |
| `SessionRegistry` | جلسات نشطة مع JTI للإلغاء |
| `IdempotencyKey` | مفاتيح idempotency للدفعات (منع double-charge) |

## ملاحظات مهمة

### أنواع الأعمدة المالية
جميع الحقول المالية (`total`, `paid`, `subtotal`, `taxAmount`, etc.) تستخدم
نوع `Decimal` (ليس `String` أو `Float`) لضمان دقة الحسابات المالية.

### Optimistic Locking
جداول `Invoice` وغيرها تستخدم عمود `version` (Int) مع `updateMany` +
فلتر `version = expectedVersion` لمنع lost updates.

### Soft Delete
معظم الجداول تستخدم `deletedAt` (DateTime?) للـ soft delete بدلاً من
الحذف الفعلي. Prisma client مُهيّأ لتصفية `deletedAt: null` تلقائياً.

### Multi-Tenancy (RLS)
- جميع الجداول تحتوي على `companySlug` للعزل
- PostgreSQL Row Level Security (RLS) مُفعّل مع 72 policy
- `platform_admin_bypass` للـ founder/admin لتجاوز RLS

## البيئة

- **Development & Production:** PostgreSQL 17+ (نفس الـ provider)
- migrations مجرّبة على PostgreSQL فقط (لا تدعم SQLite)

## الأوامر

```bash
# إنشاء migration جديد (بعد تعديل schema.prisma)
bunx prisma migrate dev --name my_migration

# تطبيق migrations في الإنتاج (أو عبر setup wizard)
bunx prisma migrate deploy

# فتح Prisma Studio (واجهة لإدارة البيانات)
bunx prisma studio

# توليد Prisma Client (مطلوب بعد كل تعديل للـ schema)
bunx prisma generate

# إعادة تعيين قاعدة البيانات (تحذير: يمسح كل البيانات)
bunx prisma migrate reset
```

## الـ Seed

```bash
# تشغيل الـ seeder (10-25000 شركة)
bun run scripts/seed.ts

# بذر سجل نماذج AI
bun run scripts/seed-model-registry.ts
```

## الترتيب مع Setup Wizard

عند استخدام setup wizard (Path A في README الرئيسي):
1. الـ wizard يختبر اتصال DB عبر `/api/setup/test-db`
2. يُشغّل migrations عبر `/api/setup/run-migrations`
3. يُنشئ founder + company عبر `/api/setup/create-founder`
4. يكتب `.setup-complete` marker لمنع إعادة التشغيل

عند استخدام `.env` يدوياً (Path B):
```bash
bunx prisma migrate deploy  # يطبّق migrations
bunx prisma generate        # يولّد Prisma Client
```
