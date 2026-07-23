# Context — سياقات React العامة

> سياقان رئيسيان يوفران حالة المستخدم والشركة (`AuthContext`) وتخصيص العلامة التجارية (`BrandContext`)، مع طبقة middleware لحماية CSRF.

## السياقات

### `AuthContext.tsx` — المصادقة وحالة المستخدم

يوفر حالة المستخدم الحالي والشركة عبر التطبيق بأكمله، ويدير دورة حياة الجلسة بشكل مركزي:

| القيمة | النوع | الوصف |
|--------|-------|-------|
| `user` | `User \| null` | المستخدم الحالي |
| `company` | `Company \| null` | شركة المستخدم |
| `isLoading` | `boolean` | جاري تحميل الجلسة |
| `login()` | `function` | تسجيل الدخول |
| `logout()` | `function` | تسجيل الخروج |
| `refreshSession()` | `function` | تحديث الجلسة والـ JWT |

```tsx
import { useAuth } from '@/context/AuthContext';

const { user, company, isLoading } = useAuth();
```

### `BrandContext.tsx` — تخصيص العلامة التجارية

يتيح لكل مستأجر (tenant) تخصيص مظهر التطبيق بما يتناسب مع علامته التجارية:

| القيمة | النوع | الوصف |
|--------|-------|-------|
| `brand` | `BrandConfig` | إعدادات العلامة (ألوان، شعار، اسم) |
| `updateBrand()` | `function` | تحديث إعدادات العلامة |

```tsx
import { useBrand } from '@/context/BrandContext';

const { brand } = useBrand();
// brand.primaryColor, brand.logoUrl, brand.companyName
```

## طبقة Middleware وحماية CSRF

> إضافة مهمة: طبقة الـ middleware في Next.js تتولى حماية CSRF (Cross-Site Request Forgery) عبر إرفاق رمز CSRF مخصص في طلبات POST/PUT/DELETE. يتم قراءة الرمز من cookie وإرفاقه في header تلقائياً بواسطة `api-client.ts`. هذا يضمن أن جميع طلبات البيانات المعدّلة محمية من الهجمات عبر المواقع.

## Hooks ذات الصلة

### `use-pwa.ts` — حالة تطبيق الويب التقدمي (PWA)

Hook متاح في `src/hooks/` يُتيح كشف حالة تثبيت تطبيق الويب التقدمي (PWA) وعرضها في واجهة المستخدم:

| القيمة | النوع | الوصف |
|--------|-------|-------|
| `isInstalled` | `boolean` | هل التطبيق مثبت كـ PWA |
| `canInstall` | `boolean` | هل يمكن تثبيت التطبيق |
| `installPrompt` | `BeforeInstallPromptEvent \| null` | حدث التثبيت المتاح |
| `install()` | `function` | طلب تثبيت التطبيق |

```tsx
import { usePWA } from '@/hooks/use-pwa';

const { isInstalled, canInstall, install } = usePWA();
```

## التسلسل الهرمي

```
layout.tsx
  └── <AuthProvider>
        └── <BrandProvider>
              └── <QueryProvider>
                    └── {children}
```

> يجب أن يكون `AuthProvider` خارج `QueryProvider` لأن الـ hooks تعتمد على حالة المصادقة. ويجب أن يمر كل طلب API عبر طبقة الـ middleware لضمان حماية CSRF قبل الوصول إلى البيانات.
