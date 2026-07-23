# Hooks — خطافات React مخصصة

> طبقة البيانات التفاعلية: API client، React Query hooks لكل نطاق، وأدوات مساعدة.

## البنية

```
hooks/
├── api-client.ts        # HTTP client مع auth headers و CSRF token
├── query-keys.ts        # مفاتيح React Query مُنسّقة
├── use-mobile.ts        # كشف الجهاز المحمول
├── use-pwa.ts           # كشف حالة تثبيت PWA
├── use-toast.ts         # إدارة إشعارات Toast
└── queries/             # React Query hooks حسب النطاق
    ├── index.ts         # تصدير مركزي
    ├── auth.ts          # تسجيل الدخول والصلاحيات
    ├── clients.ts       # إدارة العملاء
    ├── hr.ts            # الموارد البشرية
    ├── invoices.ts      # الفواتير
    ├── inventory.ts     # المخزون
    ├── accounting.ts    # المحاسبة
    ├── dashboard.ts     # لوحة التحكم
    ├── settings.ts      # الإعدادات
    ├── ai.ts            # مساعد AI
    ├── automation.ts    # الأتمتة
    └── platform-admin.ts # إدارة المنصة
```

## الملفات الجذرية

| الملف | الوظيفة |
|-------|---------|
| `api-client.ts` | HTTP client يُضيف تلقائياً JWT token و company slug لكل طلب، ويُرفق رمز CSRF token في headers لطلبات POST/PUT/DELETE لحماية من هجمات Cross-Site Request Forgery |
| `query-keys.ts` | تعريفات مفاتيح React Query لضمان cache coherence |
| `use-mobile.ts` | Hook يُرجع `true` إذا كان العرض < 768px |
| `use-pwa.ts` | Hook لكشف حالة تثبيت تطبيق الويب التقدمي (PWA) — يُرجع `isInstalled`, `canInstall`, `installPrompt`, و `install()` لطلب تثبيت التطبيق |
| `use-toast.ts` | Hook لإدارة إشعارات Toast |

## `queries/` — Hooks حسب النطاق

كل ملف يُصدّر React Query hooks (`useQuery`, `useMutation`) لنطاق محدد:

| الملف | أمثلة على الـ Hooks |
|-------|---------------------|
| `auth.ts` | `useLogin`, `useCurrentUser`, `useRegister` |
| `clients.ts` | `useClients`, `useClient`, `useCreateClient` |
| `invoices.ts` | `useInvoices`, `useInvoice`, `useCreateInvoice` |
| `inventory.ts` | `useProducts`, `useWarehouses`, `useStockMovements` |
| `accounting.ts` | `useJournalEntries`, `useProfitLoss`, `useCashFlow` |
| `hr.ts` | `useEmployees`, `usePayroll`, `useAttendance` |
| `dashboard.ts` | `useDashboardStats`, `useRevenueChart` |
| `ai.ts` | `useAIChat`, `useInvoiceBrain` |
| `automation.ts` | `useAutomations`, `useCreateRule` |
| `settings.ts` | `useCompanySettings`, `useUpdateSettings` |
| `platform-admin.ts` | `usePlatformStats`, `useTenantList` |

## الاستخدام

```tsx
import { useClients } from '@/hooks/queries/clients';

const { data, isLoading } = useClients();
```

## الاصطلاح

- كل hook يتبع نمط `use{Resource}` للاستعلام و `useCreate{Resource}` / `useUpdate{Resource}` للمutations
- المفاتيح تُعرّف في `query-keys.ts` وتُستخدم عبر `queryKeyFactory`
- الـ mutations تُبطل الـ cache تلقائياً عند النجاح (`invalidateQueries`)
- الـ API client يُرفق CSRF token تلقائياً في headers لطلبات الكتابة (POST/PUT/DELETE) لضمان حماية الطلبات المعدّلة
