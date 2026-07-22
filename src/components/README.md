# Components — مكونات واجهة المستخدم

> مكتبة مكونات GarfiX: 40+ مكون shadcn/ui في `ui/` + 8 مكونات مخصصة في `garfix/` + QueryProvider.

## البنية

```
components/
├── ui/                  # 40+ مكون shadcn/ui (لا تُعدّل مباشرة)
├── garfix/              # مكونات GarfiX المخصصة
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
| `DataTable.tsx` | جدول بيانات متقدم مع فرز، تصفية، وترقيم صفحات |

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

// من garfix/
import { DataTable } from '@/components/garfix/DataTable';
import { EmptyState } from '@/components/garfix/EmptyState';
```