# Integrations — التكاملات الخارجية

> اتصال GarfiX بخدمات الطرف الثالث: المدفوعات (Myfatoorah، Paymob)، المراسلة (WhatsApp)، والإعلانات (Meta Ads).

## الملفات

| الملف | الوظيفة |
|-------|---------|
| `registry.ts` | سجل التكاملات: تسجيل وتنشيط وإدارة الاتصالات |
| `myfatoorah.ts` | تكامل بوابة الدفع Myfatoorah — إنشاء الفواتير وإدارة الاتصال |
| `myfatoorah-refund.ts` | معالجة استرجاع المبالغ (Refund) عبر Myfatoorah API v2 |
| `myfatoorah-webhook.ts` | معالجة وتحقق من توقيعات Webhook من Myfatoorah |
| `paymob.ts` | تكامل بوابة الدفع Paymob (مصر) — المحافظ الإلكترونية وبطاقات Meeza |
| `whatsapp.ts` | تكامل WhatsApp Business API للمراسلة |
| `meta_ads.ts` | تكامل Meta Ads لإدارة الحملات الإعلانية |
| `types.ts` | أنواع TypeScript المشتركة بين التكاملات |
| `index.ts` | تصدير مركزي لجميع التكاملات |

## الاختبارات

| الملف | الوظيفة |
|-------|---------|
| `__tests__/myfatoorah-refund.test.ts` | اختبارات وحدة لمعالجة الاسترجاع عبر Myfatoorah |
| `__tests__/myfatoorah-webhook.test.ts` | اختبارات وحدة لتحقق توقيعات Webhook ومعالجة الأحداث |
| `__tests__/paymob.test.ts` | اختبارات وحدة لبوابة الدفع Paymob (مصادقة، إنشاء طلب، مفتاح الدفع) |

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
- دعم عملات متعددة (KWD، SAR، EGP…)
- حماية SSRF: تحقق من `base_url` قبل كل طلب API

### Myfatoorah Refund — استرجاع المبالغ

```ts
import { initiateRefund, getRefundStatus } from '@/lib/integrations/myfatoorah-refund';

// بدء استرجاع لمبلغ معاملة
const result = await initiateRefund(paymentTxnId, amount, reason, createdBy);

// الاستعلام عن حالة الاسترجاع (مع تحديث من مزود الخدمة)
const status = await getRefundStatus(refundId, true);
```

- إنشاء طلب استرجاع عبر Myfatoorah Refund API (`POST /api/v2/Refund`)
- تسجيل كل عملية استرجاع في `RefundTransaction` بحالات: `pending` → `processing` → `completed` / `failed`
- استرجاع جزئي أو كامل (مبلغ الاسترجاع ≤ مبلغ المعاملة الأصلية)
- استعلام حالة الاسترجاع من مزود الخدمة مع تحديث السجل المحلي تلقائياً
- تحقق SSRF على `base_url` قبل كل طلب API (نفس نمط `myfatoorah.ts`)
- تسجيل فشل الاسترجاع تلقائياً في `RefundTransaction` مع سبب الفشل

### Myfatoorah Webhook — معالجة إشعارات الدفع

```ts
import {
  verifyWebhookSignature,
  parseWebhookEvent,
  processWebhookEvent,
} from '@/lib/integrations/myfatoorah-webhook';

// تحقق من توقيع Webhook
const { valid, error } = await verifyWebhookSignature(payloadBody, signatureHeader);

// تحليل payload إلى حدث منظم
const event = parseWebhookEvent(rawPayload);

// معالجة الحدث بعد التحقق
const result = await processWebhookEvent(event);
```

- تحقق HMAC-SHA256 من توقيع Webhook باستخدام API key (`Signature` header)
- مقارنة ثابتة زمنية (`safeCompare`) لمنع هجمات التوقيت
- تحليل Payload إلى أحداث منومة: `payment_success`، `payment_failed`، `refund_completed`
- تحديث `PaymentTransaction` تلقائياً حسب نوع الحدث:
  - `payment_success`: تعيين حالة `paid` + تحديث خطة الشركة
  - `payment_failed`: تعيين حالة `failed` + تسجيل سبب الفشل
  - `refund_completed`: تعيين حالة الاسترجاع `completed`
- تتبع معدل معالجة Webhook (Rate limiting: 100 طلب/دقيقة لكل مزود)

### Paymob — بوابة الدفع (مصر)

```ts
import { paymobProvider, initiatePaymobPayment } from '@/lib/integrations/paymob';

// ربط Paymob ببيانات الاعتماد
await paymobProvider.connect({ api_key: '...', base_url: 'https://accept.paymob.com' });

// إنشاء رابط دفع لترقية الاشتراك
const { checkoutUrl, orderId, paymentKey } = await initiatePaymobPayment({
  baseUrl: 'https://accept.paymob.com',
  apiKey: cfg.api_key,
  amount: 99,
  currency: 'EGP',
  integrationId: 4305,
  companySlug: 'my-company',
  userEmail: 'user@example.com',
  planName: 'pro',
  billingPeriod: 'monthly',
});
```

- بوابة الدفع الرائدة في مصر — تدعم المحافظ الإلكترونية (Vodafone Cash، Orange Cash، Etisalat Cash، We Pay)
- بطاقات Meeza (منظومة البطاقات الوطنية المصرية) + Visa / Mastercard
- أقساط بنكية (CIB، Arab African International Bank، FNB)
- تدفق Paymob: مصادقة → إنشاء طلب → مفتاح الدفع → رابط الدفع
- حماية SSRF: نفس نمط التحقق من `base_url` المستخدم في MyFatoorah
- `integration_id` افتراضي: 4305 (بطاقات)

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
integrationRegistry.register('paymob', paymobInstance);

// استدعاء تكامل
const payment = integrationRegistry.get('myfatoorah');
const paymob = integrationRegistry.get('paymob');
```

## إضافة تكامل جديد

1. أنشئ ملف `src/lib/integrations/my-service.ts`
2. عرّف الواجهة في `types.ts`
3. سجّله في `registry.ts`
4. أضفه في `index.ts`
5. أنشئ اختبارات في `__tests__/my-service.test.ts`
6. أضف وصف التكامل في هذا README