# Workers — معالجات الوظائف الخلفية (3-tier Queue System)

> Jobs تعمل في الخلفية عبر نظام طوابير متعدد المستويات: BullMQ → pg-boss → in-process.

## معمارية الطوابير (3-tier Fallback)

النظام يستخدم معمارية ثلاثية المستويات لضمان استمرارية معالجة الوظائف:

| المستوى | التكنولوجيا | الملف | متى يُستخدم | مناسب للإنتاج؟ |
|---------|------------|------|------------|--------------|
| **1 — الأساسي** | BullMQ + Valkey | `src/lib/queues.ts` | `VALKEY_URL` أو `REDIS_URL` متاح | ✅ نعم — عزل متعدد المستأجرين، multi-instance safe |
| **2 — احتياطي** | pg-boss + PostgreSQL | `src/lib/queue-pgboss.ts` | `DATABASE_URL` متاح بدون Valkey | ✅ نعم — uses same DB as Prisma، advisory locks |
| **3 — محلي** | In-process (DB-backed) | `src/lib/queues.ts` (inline fallback) | sandbox/dev فقط — لا Valkey ولا PG | ❌ لا — single-instance only |

### كيف يتم الاختيار تلقائياً

```
App Start → queues.ts checks:
  1. VALKEY_URL/REDIS_URL set? → BullMQ (Tier 1)
  2. DATABASE_URL set?         → pg-boss  (Tier 2)
  3. Neither?                  → In-process (Tier 3)
```

لا حاجة لتكوين يدوي — النظام يختار المستوى الأعلى المتاح تلقائياً.

### تسجيل العمال عبر النظام

العمال يمكن تسجيلهم عبر **أي مستوى** بنفس الواجهة:

```ts
// المستوى 1 — BullMQ (queues.ts)
import { registerWorker } from '@/lib/queues';
registerWorker('email', emailHandler);

// المستوى 2 — pg-boss (queue-pgboss.ts)
import { registerWorker } from '@/lib/queue-pgboss';
registerWorker('email', emailHandler);
```

الواجهة العامة متطابقة: `registerWorker(queue, handler)`، `enqueue(queue, payload)`، `enqueueAsync(queue, payload)`، `enqueueBackground(queue, payload)`، `getDeadLetters(queue?)`، `clearDeadLetters(queue?)`، `recoverPendingJobs()`.

### pg-boss — المستوى الاحتياطي (queue-pgboss.ts)

```ts
import { registerWorker, enqueue, enqueueAsync } from '@/lib/queue-pgboss';

// تسجيل عامل
registerWorker('email', async (data) => { /* ... */ });

// إضافة مهمة (fire-and-forget)
enqueue('email', { type: 'send-invoice', data: { invoiceId } });

// إضافة مهمة مع انتظار النتيجة
await enqueueAsync('email', { type: 'send-invoice', data: { invoiceId } });
```

مزايا pg-boss:
- وظائف مستمرة تبقى بعد الأعطال (مخزنة في جدول PostgreSQL داخل schema `pgboss`)
- إعادة المحاولة مع exponential backoff (3 محاولات، تأخير أساسي 1 ثانية)
- طوابير Dead-letter تلقائية — الوظائف الفاشلة تُنقل إلى `queue-name__dead-letter`
- عزل متعدد المستأجرين عبر advisory locks في PostgreSQL
- auto-migration — pg-boss ينشئ جدوله تلقائياً عند البدء
- لا يحتاج أي infrastructure إضافي — يستخدم نفس `DATABASE_URL` الذي يستخدمه Prisma
- TTL / Job expiry — prevents stale locked jobs

## العمال المتاحون

| Worker | الملف | الوظيفة |
|--------|-------|---------|
| **aiProductMatchWorker** | `aiProductMatchWorker.ts` | مطابقة المنتجات تلقائياً بالـ AI |
| **schedulerWorker** | `schedulerWorker.ts` | تنفيذ المهام المجدولة (cron jobs) |
| **whatsappWorker** | `whatsappWorker.ts` | إرسال رسائل WhatsApp |
| **emailWorker** | `emailWorker.ts` | إرسال رسائل البريد الإلكتروني |
| **backupWorker** | `backupWorker.ts` | نسخ احتياطي تلقائي |

## كيف يتم التشغيل

الـ workers يُسجّلون تلقائياً عند بدء التطبيق عبر `src/lib/queues.ts` (BullMQ) أو `src/lib/queue-pgboss.ts` (pg-boss) حسب المستوى المتاح. لا حاجة لتشغيل منفصل.

## اصطلاح تسمية الـ Queues

```
ai-queue:{companySlug}
```

كل شركة لها queue خاص لضمان العزل متعدد المستأجرين. الـ queue يُنشأ عند أول طلب AI للشركة. هذا الاصطلاح يُطبق على BullMQ و pg-boss معاً.

## إضافة Worker جديد

1. أنشئ ملف `src/lib/workers/myWorker.ts`
2. عرّف الـ processor و type البيانات
3. سجّله في `src/lib/queues.ts` (BullMQ tier) — سيُسجّل تلقائياً في pg-boss tier أيضاً عبر `QUEUE_NAMES`
4. أضف الـ queue name في اصطلاح التسمية

## مثال

```ts
// إضافة مهمة للـ queue — الواجهة متطابقة عبر المستويات
// BullMQ tier:
import { getQueue, enqueue } from '@/lib/queues';
const queue = getQueue(`ai-queue:${companySlug}`);
await queue.add('product-match', { invoiceId, companyId });

// أو عبر الواجهة العامة (تختار المستوى تلقائياً):
import { enqueue } from '@/lib/queues';
await enqueue(`ai-queue:${companySlug}`, { type: 'product-match', data: { invoiceId, companyId } });

// pg-boss tier (يدوي — عند استخدام المستوى 2 فقط):
import { enqueue } from '@/lib/queue-pgboss';
await enqueue(`ai-queue:${companySlug}`, { type: 'product-match', data: { invoiceId, companyId } });
```

## المراقبة

### BullMQ (المستوى 1)
- فشل الـ jobs يُسجّل في جدول `JobQueue`
- لوحة التحكم: `/api/platform-admin/queue-failures`
- إعادة المحاولة تلقائية مع exponential backoff

### pg-boss (المستوى 2)
- Dead-letter queues: كل queue لها `queue-name__dead-letter`
- استعلام الفشل: `getDeadLetters(queue?)` — يجمع بيانات pg-boss + in-memory
- تنظيف: `clearDeadLetters(queue?)`
- إعادة تشغيل: `recoverPendingJobs()` — redrive dead-letter jobs + auto supervise
- إحصائيات: `getPgBossStats()` — إحصائيات لكل queue (queued, active, failed, total)
- لوحة التحكم: `/api/platform-admin/queue-failures` (تعرض بيانات المستوى النشط)