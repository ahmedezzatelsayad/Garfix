# Context — سياقات React العامة

> سياقان رئيسيان يوفران حالة المستخدم والشركة (`AuthContext`) وتخصيص العلامة التجارية (`BrandContext`).

## السياقات

### `AuthContext.tsx` — المصادقة وحالة المستخدم

يوفر حالة المستخدم الحالي والشركة عبر التطبيق كله:

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

يتيح لكل مستأجر (tenant) تخصيص مظهر التطبيق:

| القيمة | النوع | الوصف |
|--------|-------|-------|
| `brand` | `BrandConfig` | إعدادات العلامة (ألوان، شعار، اسم) |
| `updateBrand()` | `function` | تحديث إعدادات العلامة |

```tsx
import { useBrand } from '@/context/BrandContext';

const { brand } = useBrand();
// brand.primaryColor, brand.logoUrl, brand.companyName
```

## التسلسل الهرمي

```
layout.tsx
  └── <AuthProvider>
        └── <BrandProvider>
              └── <QueryProvider>
                    └── {children}
```

> يجب أن يكون `AuthProvider` خارج `QueryProvider` لأن الـ hooks تعتمد على حالة المصادقة.