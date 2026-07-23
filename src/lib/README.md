# lib — المكتبات المشتركة

> البنية التحتية المشتركة التي تستخدمها جميع الوحدات والـ API handlers.

## الملفات الأساسية

| الملف | الوظيفة |
|-------|---------|
| `auth.ts` | JWT + token versioning + session management |
| `db.ts` | Prisma client مع pool config (SQLite dev / PostgreSQL prod) |
| `valkey.ts` | Valkey/Redis client — cache + pub/sub + rate limit |
| `rateLimit.ts` | 7 حدود rate limiting مخصصة |
| `middleware.ts` | Auth middleware + tenant resolution |
| `logger.ts` | Structured logging (Pino) |
| `audit.ts` | Audit trail — تسجيل كل عملية |
| `api.ts` | API helpers: `requirePermissionForCompany()`, `resolveSecret()` |
| `secretsManager.ts` | إدارة الأسرار مع تشفير |
| `cryptoVault.ts` | تشفير/فك تشفير البيانات الحساسة |
| `permissions.ts` | نظام الصلاحيات (RBAC) |
| `tenantScope.ts` | عزل بيانات المستأجرين |
| `cache.ts` | طبقة cache عالية المستوى |
| `queues.ts` | BullMQ queue setup و worker registration |
| `productMatcher.ts` | مطابقة المنتجات (fuzzy + AI) |
| `mfa.ts` | المصادقة الثنائية (2FA) |
| `money.ts` | حسابات مالية (عملات، ضريبة، خصم) |
| `hijri.ts` | تحويل التواريخ الهجرية |
| `notifications.ts` | نظام الإشعارات |
| `email.ts` | إرسال البريد الإلكتروني |
| `backup.ts` | نسخ احتياطي واستعادة |
| `auditExport.ts` | تصدير سجلات المراجعة |

## الأمان

```ts
// resolveSecret() يرفض الأسرار المفقودة في بيئة الإنتاج
const key = resolveSecret('OPENROUTER_API_KEY'); // throws in prod if missing
```

## المكتبات الفرعية

- `ai/` — Router, cost tracker, model registry
- `ai-fabric/` — محرك الـ 16-phase cascade
- `invoice-brain/` — استخراج الفواتير
- `workers/` — BullMQ workers
- `integrations/` — Myfatoorah, WhatsApp, Meta Ads
- `automation/` — محرك الأتمتة
- `founder-validation/` — مجموعة اختبار الضغط