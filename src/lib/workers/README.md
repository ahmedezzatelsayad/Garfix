# Workers — معالجات الوظائف الخلفية (BullMQ)

> Jobs تعمل في الخلفية عبر BullMQ مع Valkey كـ queue backend.

## العمال المتاحون

| Worker | الملف | الوظيفة |
|--------|-------|---------|
| **aiProductMatchWorker** | `aiProductMatchWorker.ts` | مطابقة المنتجات تلقائياً بالـ AI |
| **schedulerWorker** | `schedulerWorker.ts` | تنفيذ المهام المجدولة (cron jobs) |
| **whatsappWorker** | `whatsappWorker.ts` | إرسال رسائل WhatsApp |
| **emailWorker** | `emailWorker.ts` | إرسال رسائل البريد الإلكتروني |
| **backupWorker** | `backupWorker.ts` | نسخ احتياطي تلقائي |

## كيف يتم التشغيل

الـ workers يُسجّلون تلقائياً عند بدء التطبيق عبر `src/lib/queues.ts`. لا حاجة لتشغيل منفصل.

## اصطلاح تسمية الـ Queues

```
ai-queue:{companySlug}
```

كل شركة لها queue خاص لضمان العزل متعدد المستأجرين. الـ queue يُنشأ عند أول طلب AI للشركة.

## إضافة Worker جديد

1. أنشئ ملف `src/lib/workers/myWorker.ts`
2. عرّف الـ processor و type البيانات
3. سجّله في `src/lib/queues.ts`
4. أضف الـ queue name في اصطلاح التسمية

## مثال

```ts
// إضافة مهمة للـ queue
const queue = getQueue(`ai-queue:${companySlug}`);
await queue.add('product-match', { invoiceId, companyId });
```

## المراقبة

- فشل الـ jobs يُسجّل في جدول `JobQueue`
- لوحة التحكم: `/api/platform-admin/queue-failures`
- إعادة المحاولة تلقائية مع exponential backoff