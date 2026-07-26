# API — مسارات واجهة البرمجة

> جميع endpoint handlers لـ GarfiX — 210 route handler files، 177+ documented endpoints محمية ومُوثّقة، مع rate limits مخصصة وcursor pagination على routes عالية الحجم.

## نمط المصادقة — RBAC

كل handler محمي يمر عبر `requirePermissionForCompany()` مع صلاحيات دقيقة (`resource:action`):

```ts
const { user, company } = await requirePermissionForCompany(
  req,
  'invoices:write',  // الصلاحية المطلوبة — resource:action
  companySlug        // slug الشركة
);
```

النظام يطبق **RBAC شامل** (Role-Based Access Control) — كل مسار مرتبط بصلاحية محددة، ولا يمكن الوصول بدون دور مناسب. الصلاحيات مبنية على نمط `resource:action` مثل `invoices:read`, `invoices:write`, `invoices:delete`, `hr:manage`, `founder:access`, إلخ.

## حماية CSRF

جميع مسارات `POST`, `PUT`, `PATCH`, `DELETE` محمية بـ **CSRF token** عبر middleware مخصص. الـ token يتم التحقق منه تلقائياً من الـ cookie والـ header لضمان أن الطلب صادر من الجلسة نفسها.

## Rate Limiting — حدود معدل الطلب

الـ middleware (`src/middleware.ts`) يطبق **حدود rate limiting مخصصة** حسب نوع الـ endpoint وخطورة البيانات. النظام يستخدم Valkey (Redis) في الإنتاج أو in-memory fallback في التطوير، مع spoofing-resistant `getClientIp()` و`TRUSTED_PROXIES` support.

### حدود المحاسبة (P0 Hardening)

| الحد | الـ endpoints | القيمة | السبب |
|------|-------------|--------|-------|
| **ACCOUNTING_READ** | `/api/accounting/*` (GET) | 40 req/min | حماية بيانات مالية حساسة |
| **ACCOUNTING_WRITE** | `/api/accounting/*` (POST/PUT/PATCH/DELETE) | 15 req/min | تقييد إنشاء القيود والسندات |
| **REPORT_GENERATION** | 14 routes تقارير ثقيلة | 5 req/5min | حماية من استعلامات balance sheet/P&L/export |

### حدود عامة

| الحد | الـ endpoints | القيمة |
|------|-------------|--------|
| LOGIN | `/api/auth/login` | 5/15min per IP (lockout) |
| REGISTER | `/api/auth/register` | 3/hour per IP |
| OTP_VERIFY | `/api/auth/otp-verify` | 5/5min per email |
| PASSWORD_RESET | `/api/auth/forgot-password` | 3/hour per email |
| AI_CHAT | `/api/ai/*` | 10/min |
| AI_BULK | `/api/ai/bulk` | 3/min |
| API_READ | باقي GET endpoints | 60/min |
| API_WRITE | باقي POST/PUT/PATCH/DELETE | 30/min |

### نتائج اختبار الحمل المُحققة (2026-07-26)

تم تشغيل اختبار حمل فعلي على حدود المحاسبة الثلاث باستخدام endpoints اختبارية:
- `/api/accounting/test-rate-limit` — ACCOUNTING_READ / ACCOUNTING_WRITE
- `/api/accounting/balance-sheet/test-rate-limit` — REPORT_GENERATION

| الحد | النتيجة | أول 429 | p50 | p95 |
|------|---------|----------|------|------|
| **ACCOUNTING_READ** | ✅ PASS | request #40 | 4.5ms | 16.9ms |
| **ACCOUNTING_WRITE** | ✅ PASS | request #16 | 4.1ms | 5.9ms |
| **REPORT_GENERATION** | ✅ PASS | request #6 | 5.5ms | 14.7ms |

جميع حدود rate limiting تعمل كما هو مُحدد — أول 429 يظهر عند الحد المضبوط بدقة.

### اختبار Rate Limits

```bash
# اختبار حدود المحاسبة تحت حمل مرتفع
bun scripts/accounting-rate-limit-load-test.ts --url=http://localhost:3000 --duration=120 --concurrency=5
```

### ملاحظة الإنتاج

ملف `.env.production` يتضمن الآن `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318` لدعم تصدير بيانات المراقبة (OpenTelemetry) إلى collector محلي.

## Cursor Pagination — التصفح بالـ Cursor

Routes عالية الحجم تستخدم **cursor-based pagination** لتجنب مشكلة skipped rows في offset pagination عند إضافة/حذف سجلات بين الصفحات:

```
GET /api/accounting/journal-entries?companySlug=X&cursor=123&limit=20
Response: { entries: [...], nextCursor: "124" | null }
```

### Routes التي تدعم Cursor Pagination

| الـ Route | المعاملات | الترتيب |
|-----------|-----------|---------|
| `/api/accounting/journal-entries` | `cursor`, `limit`, `search`, `status` | `date` DESC |
| `/api/accounting/vouchers` | `cursor`, `limit`, `voucherType`, `status` | `date` DESC |
| `/api/accounting/accounts` | `cursor`, `limit`, `search` | `code` ASC |
| `/api/accounting/fixed-assets` | `cursor`, `limit` | `id` DESC |
| `/api/accounting/tax-filing` | `cursor`, `limit` | `id` DESC |
| `/api/invoices` | `cursor`, `limit`, `search`, `status` | `id` DESC |

الـ helper functions في `src/lib/cursor-pagination-server.ts`:
- `parseCursorParams(req)` — استخراج معاملات cursor من URL
- `buildCursorPrismaQuery(cursor, limit, orderField, orderDirection)` — بناء Prisma query
- `buildCursorResponse(allItems, limit, totalCount)` — تنسيق الاستجابة مع nextCursor

## AI Routes — عبر AI Fabric

جميع مسارات AI تمر عبر `executeCascade()` — 16-phase cascade engine:

```ts
import { executeCascade } from '@/lib/ai-fabric/gateway';
const result = await executeCascade({ prompt, companySlug, ... });
```

## اصطلاح التسمية

```
src/app/api/{resource}/route.ts              # CRUD collection
src/app/api/{resource}/[id]/route.ts         # CRUD single item
src/app/api/{resource}/[id]/action/route.ts  # Action على عنصر
```

## المجموعات الرئيسية

### المصادقة والشركات

- `/api/auth/*` — تسجيل دخول، تسجيل، JWT refresh، logout، me، CSRF token، forgot/reset password، change password، MFA setup/verify
- `/api/companies/*` — إدارة الشركات + أعضاء الشركة + تبديل الشركة

### المحاسبة والمالية (80+ endpoints)

- `/api/accounting/accounts` — شجرة الحسابات (cursor pagination) ⚡ ACCOUNTING_READ/WRITE
- `/api/accounting/journal-entries` — القيود اليومية (cursor pagination) ⚡ ACCOUNTING_READ/WRITE
- `/api/accounting/vouchers` — السندات (receipt/payment) (cursor pagination) ⚡ ACCOUNTING_READ/WRITE
- `/api/accounting/profit-loss` — أرباح وخسائر ⚡ REPORT_GENERATION
- `/api/accounting/balance-sheet` — الميزانية العمومية ⚡ REPORT_GENERATION
- `/api/accounting/cash-flow` — التدفق النقدي ⚡ REPORT_GENERATION
- `/api/accounting/trial-balance` — ميزان المراجعة ⚡ REPORT_GENERATION
- `/api/accounting/export-excel` — تصدير Excel ⚡ REPORT_GENERATION
- `/api/accounting/bank-accounts` — الحسابات البنكية
- `/api/accounting/bank-transfer` — التحويلات البنكية
- `/api/accounting/bank-reconciliation` — التسوية البنكية
- `/api/accounting/aging` — تقارير الذمم المدينة/الدائنة
- `/api/accounting/fixed-assets` — الأصول الثابتة (cursor pagination)
- `/api/accounting/depreciation` — الإهلاك
- `/api/accounting/tax-filing` — الإقرارات الضريبية (cursor pagination)
- `/api/accounting/payroll-wps` — الرواتب وWPS
- `/api/accounting/trade-finance` — التمويل التجاري (LCs, guarantees)
- `/api/accounting/fiscal-periods` — الفترات المالية (+ close/reopen)
- `/api/accounting/cost-centers` — مراكز التكلفة
- `/api/accounting/budgets` — الموازنات
- `/api/accounting/post-dated-checks` — الشيكات المؤجلة (+ deposit/cancel)
- `/api/accounting/installments` — التقسيط
- `/api/accounting/inter-company` — المعاملات بين الشركات
- `/api/accounting/fx-revaluation` — إعادة تقييم العملات
- `/api/accounting/landed-cost` — التكاليف الوصولية (cursor pagination)
- `/api/accounting/quotations` — عروض الأسعار (cursor pagination)
- `/api/accounting/purchase-orders` — أوامر الشراء (cursor pagination)
- `/api/accounting/purchase-invoices` — فواتير الشراء
- `/api/accounting/opening-balances` — أرصدة افتتاحية
- `/api/accounting/profit-distribution` — توزيع الأرباح
- `/api/accounting/commissions` — العمولات
- `/api/accounting/consolidation` — الدمج المالي
- `/api/accounting/accountant-collab` — تعاون المحاسبين
- `/api/accounting/accounting-audit` — سجل مراجعة المحاسبة
- `/api/accounting/bank-import` — استيراد بنكي
- `/api/accounting/financial-dashboard` — لوحة التحكم المالية
- `/api/accounting/initiate-payment` + `verify-payment` — إ initiate/verify payments
- `/api/accounting/asset-disposals` — التخلص من الأصول
- `/api/accounting/retention-check` — فحص الاحتفاظ

### الفواتير والعملاء

- `/api/invoices/*` — فواتير (cursor pagination)، حالات، دفعات، إرسال
- `/api/clients/*` — إدارة العملاء
- `/api/catalog/*` — دليل المنتجات

### الذكاء الاصطناعي

- `/api/ai/*` — chat, parse, invoice-brain, memory, agents, cascade-stats

### الموارد البشرية والمخزون

- `/api/hr/*` — موظفين، رواتب، حضور، إجازات، مكافآت، أداء، مستحقات
- `/api/inventory/*` — مخزون، مستودعات، حركات، مطابقة

### إدارة المنصة والاشتراكات

- `/api/platform-admin/*` — إدارة المنصة (admin فقط) — tenants, audit, AI providers, feature flags
- `/api/saas/*` — اشتراكات، دفعات، billing

### الـ Webhooks

- `/api/webhooks/*` — endpoints، deliveries، events، WhatsApp incoming

### الصلاحيات — RBAC

- `/api/permissions/*` — catalog، roles، check

### مطابقة المنتجات

- `/api/product-matching/*` — review، confirm، undo، match-override، config

### مراقبة وقياسات

- `/api/metrics/prometheus` — Prometheus exposition format (founder-only)
- `/api/metrics/observability` — OTLP JSON metrics export (founder-only)
- `/api/health` — فحص صحة النظام

### اختبارات المؤسس

- `/api/founder-validation/*` — main، report، seed، ai-test

### لوحة المؤسس — API

- `/api/founder-panel/*` — mission-control، finops، ai-fabric

### خدمات مشتركة

- `/api/storage/*` — تخزين الملفات
- `/api/startup-check` — فحص صحة بدء التشغيل (rejects placeholder secrets in prod)
- `/api/feature-flags` — إدارة feature flags
- `/api/modules` — عرض الوحدات المتاحة
- `/api/notifications` — إدارة الإشعارات
- `/api/landing-content` — محتوى صفحة الهبوط
- `/api/automation/*` — إدارة الأتمتة وrules
