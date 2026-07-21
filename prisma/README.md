# Prisma — قاعدة البيانات

> Schema يحتوي على ~1777 سطر يغطي كل نطاقات النظام.

## النماذج الرئيسية

| النموذج | الوصف |
|---------|-------|
| `Company` | بيانات الشركة المستأجرة |
| `User` | المستخدمون مع أذونات |
| `Invoice` | الفواتير |
| `InvoiceItem` | بنود الفاتورة |
| `ProductCatalog` | دليل المنتجات |
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

## البيئات

- **Development:** SQLite مع WAL mode
- **Production:** PostgreSQL

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
```

## الـ Seed

```bash
# تشغيل الـ seeder (10-25000 شركة)
bun run scripts/seed.ts
```