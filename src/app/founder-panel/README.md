# Founder Panel — لوحة المؤسس

> صفحات مخصصة للمؤسس فقط: مراقبة AI Fabric، التحكم التشغيلي، والعمليات المالية.

## المسارات

```
/founder-panel/
├── ai-fabric/           # مراقبة محرك AI Fabric
├── mission-control/     # التحكم التشغيلي
└── finops/              # العمليات المالية
    └── finops-charts.tsx  # رسوم بيانية مالية
```

## الصفحات

### `/founder-panel/ai-fabric` — مراقبة AI Fabric

| الميزة | الوصف |
|--------|-------|
| Cascade Monitoring | مراقبة الـ 16-phase cascade في الوقت الحقيقي |
| Provider Status | حالة كل AI provider (OpenRouter, DeepSeek, etc.) |
| Cost Dashboard | تكلفة AI لكل مستأجر ونموذج |

### `/founder-panel/mission-control` — التحكم التشغيلي

| الميزة | الوصف |
|--------|-------|
| System Health | صحة النظام (Valkey, DB, Queues, Workers) |
| Queue Monitor | حالة BullMQ queues والـ jobs |
| Tenant Overview | نظرة شاملة على كل المستأجرين |

### `/founder-panel/finops` — العمليات المالية

| الملف | الوصف |
|-------|-------|
| `page.tsx` | لوحة العمليات المالية: إيرادات، مصروفات، ربح |
| `finops-charts.tsx` | رسوم بيانية مالية (Revenue, Cost, Margin) |

## المصادقة

جميع صفحات `founder-panel` محمية ومتاحة فقط للمستخدمين بصلاحية `FOUNDER`:

```ts
// في كل page.tsx
const { user } = await requirePermissionForCompany(req, 'founder:access');
```