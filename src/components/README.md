# Components — مكونات واجهة المستخدم

> مكتبة مكونات GarfiX: 40+ مكون shadcn/ui في `ui/` + نظام تصميم GarfixDS في `garfix-ds/` + مكونات مخصصة في `garfix/` + QueryProvider.
> جميع المكونات مُصمّمة بالاستجابة التكيّفية عبر نقاط التوقف `sm`/`md`/`lg` من Tailwind CSS، ومتوافقة مع WCAG 2.1 AAA.

## البنية

```
components/
├── ui/                  # 40+ مكون shadcn/ui (لا تُعدّل مباشرة)
├── garfix-ds/           # نظام تصميم GarfiX (GarfixModal, GarfixButton, GarfixDrawer, etc.)
├── garfix/              # مكونات GarfiX المخصصة (9 مكونات)
└── QueryProvider.tsx    # React Query provider
```

## `ui/` — مكونات shadcn/ui

مكونات قياسية من مكتبة shadcn/ui مُهيأة لمشروع GarfiX:

| الفئة | المكونات |
|-------|---------|
| **النماذج** | `button`, `input`, `textarea`, `select`, `checkbox`, `radio-group`, `switch`, `slider`, `form`, `label`, `input-otp` |
| **العرض** | `card`, `table`, `badge`, `avatar`, `skeleton`, `tooltip`, `alert`, `separator`, `progress`, `aspect-ratio` |
| **الحوار** | `dialog`, `alert-dialog`, `sheet`, `drawer`, `popover`, `dropdown-menu`, `context-menu`, `command`, `hover-card`, `menubar` |
| **التنقل** | `tabs`, `sidebar`, `breadcrumb`, `navigation-menu`, `pagination`, `scroll-area` |
| **البيانات** | `chart`, `calendar`, `carousel` |
| **التخطيط** | `accordion`, `collapsible`, `resizable`, `toggle`, `toggle-group` |
| **الإشعارات** | `toast`, `toaster`, `sonner` |

> ⚠️ مكونات `ui/` تُولّد عبر CLI ولا تُعدّل يدوياً. استخدم `bunx shadcn@latest add {component}`.

## `garfix-ds/` — نظام تصميم GarfiX (Design System)

نظام تصميم داخلي مع دعم كامل لإمكانية الوصول (WCAG 2.1 AAA):

| المجلد | المكونات |
|--------|---------|
| `core/` | `GarfixButton` (مع isLoading + disabled), `GarfixInput`, `GarfixCard`, `GarfixBadge`, `GarfixContainer`, `GarfixPageTransition` |
| `overlay/` | `GarfixModal` (مع useFocusTrap), `GarfixDrawer` (مع useFocusTrap), `GarfixToast` |
| `accessibility/` | `GarfixSkipLinks` (روابط تخطي لوحة المفاتيح), `GarfixLiveRegion` (إعلانات قارئ الشاشة) |
| `charts/` | `GarfixChart`, `GarfixSparkline`, `GarfixDonut` |
| `tables/` | `GarfixDataTable` (فرز + تصفية + ترقيم صفحات + Card View على الموبايل) |

> 🔒 **إمكانية الوصول**: `GarfixModal` و `GarfixDrawer` يستخدمان `useFocusTrap`
> من `src/hooks/useAccessibility.ts` لحبس التركيز داخل الحوار، وإعادته للزر
> المُشغّل بعد الإغلاق. الـ focus trap يحتوي على إصلاح إنتاجي (rAF + re-query)
> لضمان عمله بشكل موثوق في Next.js + Bun.

## `garfix/` — مكونات GarfiX المخصصة

| المكون | الوظيفة |
|--------|---------|
| `EmptyState.tsx` | عرض حالة فارغة مع أيقونة ورسالة ونقطة إجراء |
| `ErrorBoundary.tsx` | حدود الأخطاء — يلتقط أخطاء React ويعرض fallback |
| `ErrorState.tsx` | عرض حالة الخطأ مع إمكانية إعادة المحاولة |
| `CommandPalette.tsx` | لوحة أوامر سريعة (Cmd+K) للتنقل السريع |
| `CommandPaletteProvider.tsx` | Provider للوحة الأوامر |
| `LoadingSkeleton.tsx` | هيكل تحميل متحرك يُطابق شكل المحتوى |
| `ProfessionalFooter.tsx` | تذييل احترافي للصفحات |
| `FooterPageLayout.tsx` | تخطيط صفحة كامل يتضمن تنقل، رأس، محتوى، وتذييل احترافي |
| `DataTable.tsx` | جدول بيانات متقدم مع فرز، تصفية، وترقيم صفحات — يدعم عرض بطاقات على الأجهزة المحمولة |

> 📱 جميع مكونات `garfix/` تستخدم نقاط التوقف `sm`/`md`/`lg` من Tailwind CSS لضمان الاستجابة التكيّفية على جميع أحجام الشاشات. يدعم `DataTable` عرض بطاقات (Card View) على الأجهزة المحمولة كبديل لعرض الجدول التقليدي.

## `QueryProvider.tsx`

React Query provider يُغلّف التطبيق ويُهيّئ الـ QueryClient:

```tsx
import { QueryProvider } from '@/components/QueryProvider';

// يُستخدم في layout.tsx الجذر
<QueryProvider>{children}</QueryProvider>
```

## الاستخدام

```tsx
// من ui/
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

// من garfix-ds/
import { GarfixModal } from '@/components/garfix-ds/overlay';
import { GarfixButton } from '@/components/garfix-ds/core';
import { GarfixSkipLinks } from '@/components/garfix-ds/accessibility';

// من garfix/
import { DataTable } from '@/components/garfix/DataTable';
import { EmptyState } from '@/components/garfix/EmptyState';
import { FooterPageLayout } from '@/components/garfix/FooterPageLayout';
```

## الاصطلاح

- مكونات `ui/` تُولّد عبر shadcn CLI ولا تُعدّل يدوياً
- مكونات `garfix-ds/` هي نظام التصميم الرسمي — استخدمها دائماً بدلاً من `ui/` للواجهات الجديدة
- مكونات `garfix/` مكونات مخصصة عالية المستوى (DataTable, ErrorBoundary, etc.)
- جميع المكونات تدعم RTL (dir="rtl") واللغة العربية افتراضياً
