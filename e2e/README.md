# E2E — اختبارات نهاية إلى نهاية (Playwright)

> اختبارات تلقائية تحاكي سلوك المستخدم الحقيقي في المتصفح.

## ملفات الاختبار

| الملف | الوصف |
|-------|-------|
| `api-health.spec.ts` | فحص صحة الـ API و الـ startup check |
| `auth.spec.ts` | تسجيل الدخول، التسجيل، JWT refresh |
| `invoices.spec.ts` | إنشاء، عرض، تعديل، حذف الفواتير |
| `dashboard.spec.ts` | تحميل لوحة التحكم و الإحصائيات |
| `clients.spec.ts` | إدارة العملاء: إضافة، بحث، CSV import |
| `settings.spec.ts` | إعدادات الشركة و قوالب الفواتير |

## التشغيل

```bash
# تثبيت المتصفحات (مرة واحدة)
bunx playwright install

# تشغيل كل الاختبارات
bunx playwright test

# تشغيل مع واجهة رسومية
bunx playwright test --ui

# تشغيل test معين
bunx playwright test e2e/invoices.spec.ts

# تقرير HTML
bunx playwright show-report
```

## الإعداد

ملف الإعداد: `playwright.config.ts` في جذر المشروع. يتضمن:
- Base URL: `http://localhost:3000`
- Web server: يبدأ تلقائياً قبل الاختبارات
- Retry: مرتين عند الفشل
- Screenshot عند الفشل تلقائياً

## المتطلبات

- Tailwind CSS rendering مُفعّل (no JS-only)
- البيئة (`baseURL`) يجب أن تكون قيد التشغيل
- متصفح Chromium (يُثبّت عبر `playwright install`)