# API — مسارات واجهة البرمجة

> جميع endpoint handlers لـ GarfiX — 177+ route handler محمية ومُوثّقة.

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

## Rate Limiting

9 حدود مخصصة حسب نوع الـ endpoint:

| الحد | الـ endpoints | القيمة |
|------|-------------|--------|
| auth | `/api/auth/*` | 10 req/min |
| ai | `/api/ai/*` | 20 req/min |
| invoices | `/api/invoices/*` | 60 req/min |
| webhooks | `/api/webhooks/*` | 30 req/min |
| permissions | `/api/permissions/*` | 40 req/min |
| general | باقي الـ endpoints | 100 req/min |

## AI Routes — عبر AI Fabric

جميع مسارات AI تمر عبر `executeCascade()`:

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

- `/api/auth/*` — تسجيل دخول، تسجيل، JWT refresh، logout، me، CSRF token، forgot/reset password، change password
- `/api/companies/*` — إدارة الشركات + أعضاء الشركة

### الفواتير والمالية

- `/api/invoices/*` — فواتير، حالات، دفعات
- `/api/accounting/*` — قيود، ميزانية، أرباح/خسائر، تدفق نقدي، حسابات، قيود يومية

### الذكاء الاصطناعي

- `/api/ai/*` — chat, parse, invoice-brain, memory, agents

### الموارد البشرية والمخزون

- `/api/hr/*` — موظفين، رواتب، حضور، إجازات، مكافآت
- `/api/inventory/*` — مخزون، مستودعات، حركات

### إدارة المنصة والاشتراكات

- `/api/platform-admin/*` — إدارة المنصة (admin فقط)
- `/api/saas/*` — اشتراكات، دفعات

### الـ Webhooks

- `/api/webhooks/*` — endpoints، deliveries، events، WhatsApp incoming

### الصلاحيات — RBAC

- `/api/permissions/*` — catalog (عرض الصلاحيات المتاحة)، roles (إدارة الأدوار)، check (فحص صلاحية مستخدم)

### مطابقة المنتجات

- `/api/product-matching/*` — review، confirm، undo، match-override، config

### اختبارات المؤسس

- `/api/founder-validation/*` — main، report، seed، ai-test

### لوحة المؤسس — API

- `/api/founder-panel/*` — mission-control (صحة النظام)، finops (العمليات المالية)، ai-fabric (مراقبة محرك AI)

### خدمات مشتركة

- `/api/storage/*` — تخزين الملفات
- `/api/startup-check` — فحص صحة بدء التشغيل
- `/api/feature-flags` — إدارة feature flags
- `/api/modules` — عرض الوحدات المتاحة
- `/api/notifications` — إدارة الإشعارات
- `/api/landing-content` — محتوى صفحة الهبوط
