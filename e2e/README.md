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

## اختبار التجاوب مع الأجهزة (Responsive Design)

Playwright يدعم اختبار عدة أحجام للشاشة (viewport sizes) للتحقق من تجاوب الواجهة مع الأجهزة المختلفة:

- **المحمول**: 375×667 (iPhone SE) — 390×844 (iPhone 14)
- **اللوحي**: 768×1024 (iPad) — 1024×1366 (iPad Pro)
- **الحاسوب**: 1280×720 — 1920×1080

يمكن إضافة مشروع متعدد في `playwright.config.ts`:

```ts
projects: [
  { name: 'mobile',  use: { ...devices['iPhone 14'] } },
  { name: 'tablet',  use: { ...devices['iPad Pro'] } },
  { name: 'desktop', use: { viewport: { width: 1280, height: 720 } } },
]
```

## اختبار العربية و RTL

GarfiX منصة **Arabic-first** لمنطقة الخليج، لذا يجب مراعاة:

- ✅ اتجاه الصفحة `dir="rtl"` مفعّل على جميع الصفحات
- ✅ محاذاة النصوص والعناصر من اليمين إلى اليسار
- ✅ ترتيب الحقول والأزرار يعكس اتجاه RTL (flip logical order)
- ✅ خطوط العربية تُعرض بدون أحرف مكسورة أو أرقام معكوسة
- ✅ ترجمة أسماء الأيام/الشهور ورسائل الخطأ بالعربية

**نصيحة**: أضف اختبار RTL مخصص:

```ts
test('RTL layout', async ({ page }) => {
  await page.goto('/dashboard');
  const dir = await page.getAttribute('html', 'dir');
  expect(dir).toBe('rtl');
});
```

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

# تشغيل على محمول فقط (مشروع mobile)
bunx playwright test --project=mobile

# تقرير HTML
bunx playwright show-report
```

## الإعداد

ملف الإعداد: `playwright.config.ts` في جذر المشروع. يتضمن:
- Base URL: `http://localhost:3000`
- Web server: يبدأ تلقائياً قبل الاختبارات
- Retry: مرتين عند الفشل
- Screenshot عند الفشل تلقائياً
- مشاريع متعددة: محمول، لوحي، حاسوب

## المتطلبات

- Tailwind CSS rendering مُفعّل (no JS-only)
- البيئة (`baseURL`) يجب أن تكون قيد التشغيل
- متصفح Chromium (يُثبّت عبر `playwright install`)
- اتجاه RTL مفعّل في صفحات المشروع (`dir="rtl"`)
