# Integrations — التكاملات الخارجية

> اتصال GarfiX بخدمات الطرف الثالث: المدفوعات (Myfatoorah)، المراسلة (WhatsApp)، والإعلانات (Meta Ads).

## الملفات

| الملف | الوظيفة |
|-------|---------|
| `registry.ts` | سجل التكاملات: تسجيل وتنشيط وإدارة الاتصالات |
| `myfatoorah.ts` | تكامل بوابة الدفع Myfatoorah |
| `whatsapp.ts` | تكامل WhatsApp Business API للمراسلة |
| `meta_ads.ts` | تكامل Meta Ads لإدارة الحملات الإعلانية |
| `types.ts` | أنواع TypeScript المشتركة بين التكاملات |
| `index.ts` | تصدير مركزي لجميع التكاملات |

## التكاملات المتاحة

### Myfatoorah — المدفوعات

```ts
import { MyfatoorahIntegration } from '@/lib/integrations/myfatoorah';

// إنشاء رابط دفع
const paymentUrl = await myfatoorah.createPaymentUrl({
  invoiceId,
  amount,
  currency: 'KWD',
  callbackUrl,
});
```

- إنشاء فواتير الدفع الإلكتروني
- استقبال callbacks وتحديث حالة الفاتورة
- دعم عملات متعددة

### WhatsApp — المراسلة

```ts
import { WhatsAppIntegration } from '@/lib/integrations/whatsapp';

// إرسال رسالة
await whatsapp.sendMessage({
  to: '+965XXXXXXX',
  templateName: 'invoice_reminder',
  templateData: { invoiceNumber: 'INV-001' },
});
```

- إرسال تذكيرات الفواتير
- إشعارات حالة الدفع
- مراسلة جماعية عبر BullMQ worker

### Meta Ads — الإعلانات

```ts
import { MetaAdsIntegration } from '@/lib/integrations/meta_ads';
```

- قراءة بيانات الحملات الإعلانية
- تتبع ROI ومصروفات الإعلانات

## Registry — سجل التكاملات

```ts
import { integrationRegistry } from '@/lib/integrations/registry';

// تسجيل تكامل
integrationRegistry.register('myfatoorah', myfatoorahInstance);

// استدعاء تكامل
const payment = integrationRegistry.get('myfatoorah');
```

## إضافة تكامل جديد

1. أنشئ ملف `src/lib/integrations/my-service.ts`
2. عرّف الواجهة في `types.ts`
3. سجّله في `registry.ts`
4. أضفه في `index.ts`