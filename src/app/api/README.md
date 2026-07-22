# API — مسارات واجهة البرمجة

> جميع endpoint handlers لـ GarfiX — 56+ route handler محمية.

## نمط المصادقة

كل handler محمي يتطلب:

```ts
const { user, company } = await requirePermissionForCompany(
  req,
  'invoices:write',  // الصلاحية المطلوبة
  companySlug        // slug الشركة
);
```

## Rate Limiting

7 حدود مخصصة حسب نوع الـ endpoint:

| الحد | الـ endpoints | القيمة |
|------|-------------|--------|
| auth | `/api/auth/*` | 10 req/min |
| ai | `/api/ai/*` | 20 req/min |
| invoices | `/api/invoices/*` | 60 req/min |
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

- `/api/auth/*` — تسجيل دخول، تسجيل، JWT refresh
- `/api/invoices/*` — فواتير، حالات، دفعات
- `/api/ai/*` — chat, parse, invoice-brain, memory, agents
- `/api/accounting/*` — قيود، ميزانية، أرباح/خسائر، تدفق نقدي
- `/api/hr/*` — موظفين، رواتب، حضور، إجازات، مكافآت
- `/api/inventory/*` — مخزون، مستودعات، حركات
- `/api/platform-admin/*` — إدارة المنصة (admin فقط)
- `/api/saas/*` — اشتراكات، دفعات
- `/api/founder-validation/*` — تشغيل اختبارات الضغط