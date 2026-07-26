# Hooks — خطافات React مخصصة

> طبقة البيانات التفاعلية: API client، React Query hooks لكل نطاق، cursor pagination لـ infinite scroll، و optimistic update helpers.

## البنية

```
hooks/
├── api-client.ts             # HTTP client مع auth headers و CSRF token
├── query-keys.ts             # مفاتيح React Query مُنسّقة (16+ نطاقات مع cursor keys)
├── cursor-pagination.ts      # useCursorPagination<T>() + server helpers (parseCursorParams, buildCursorPrismaQuery, buildCursorResponse)
├── optimistic.ts             # optimisticAdd, optimisticUpdate, optimisticDelete + prefetchQuery + invalidateMany
├── use-mobile.ts             # كشف الجهاز المحمول
├── use-pwa.ts                # كشف حالة تثبيت PWA
├── use-toast.ts              # إدارة إشعارات Toast
└── queries/                  # React Query hooks حسب النطاق (16 ملف)
    ├── index.ts              # تصدير مركزي (barrel export)
    ├── auth.ts               # تسجيل الدخول والصلاحيات
    ├── clients.ts            # إدارة العملاء
    ├── hr.ts                 # الموارد البشرية
    ├── invoices.ts           # الفواتير
    ├── inventory.ts          # المخزون
    ├── accounting.ts         # المحاسبة (CRUD + تقارير + cursor pagination)
    ├── dashboard.ts          # لوحة التحكم
    ├── settings.ts           # الإعدادات
    ├── ai.ts                 # مساعد AI
    ├── automation.ts         # الأتمتة
    ├── platform-admin.ts     # إدارة المنصة
    ├── catalog.ts            # دليل المنتجات
    ├── webhooks.ts           # نظام الـ webhooks (endpoints, deliveries, events, CRUD)
    ├── product-matching.ts   # مطابقة المنتجات (review, config, confirm, undo)
    └── founder-panel.ts      # لوحة المؤسس (Mission Control, FinOps, AI Fabric)
```

## الملفات الجذرية

| الملف | الوظيفة |
|-------|---------|
| `api-client.ts` | HTTP client يُضيف تلقائياً JWT token و company slug لكل طلب، ويُرفق رمز CSRF token في headers لطلبات POST/PUT/DELETE لحماية من هجمات Cross-Site Request Forgery — يُوفّر `apiGet`, `apiPost`, `apiPatch`, `apiDelete` مع `ApiError` type |
| `query-keys.ts` | تعريفات مفاتيح React Query لضمان cache coherence — يُغطّي 16+ نطاق: auth, clients, invoices, companies, settings, hr, accounting (with cursor keys), inventory, catalog, automation, ai, dashboard, platformAdmin, saas, audit, featureFlags, modules, productMatching, founderPanel, webhooks |
| `cursor-pagination.ts` | `useCursorPagination<T>()` — TanStack Query infinite scroll hook يُوفّر `items`, `fetchNextPage`, `hasNextPage`, `totalCount` — Server helpers: `parseCursorParams()`, `buildCursorResponse()`, `buildCursorPrismaQuery()` — Prefetch: `prefetchNextCursorPage()` — API pattern: `GET /api/resource?companySlug=X&cursor=123&limit=20` |
| `optimistic.ts` | Optimistic update helpers: `optimisticAdd()`, `optimisticUpdate()`, `optimisticDelete()` — UI changes فورية مع rollback تلقائي عند فشل الخادم — `prefetchQuery()` for hover-based prefetching — `invalidateMany()` لـ batch invalidation — Arabic error toasts |
| `use-mobile.ts` | Hook يُرجع `true` إذا كان العرض < 768px |
| `use-pwa.ts` | Hook لكشف حالة تثبيت تطبيق الويب التقدمي (PWA) — يُرجع `isInstalled`, `canInstall`, `installPrompt`, و `install()` لطلب تثبيت التطبيق |
| `use-toast.ts` | Hook لإدارة إشعارات Toast |

## `queries/` — Hooks حسب النطاق

كل ملف يُصدّر React Query hooks (`useQuery`, `useMutation`, `useInfiniteQuery`) لنطاق محدد:

| الملف | أمثلة على الـ Hooks |
|-------|---------------------|
| `auth.ts` | `useLogin`, `useCurrentUser`, `useRegister` |
| `clients.ts` | `useClients`, `useClient`, `useCreateClient` |
| `invoices.ts` | `useInvoices`, `useInvoice`, `useCreateInvoice` |
| `inventory.ts` | `useProducts`, `useWarehouses`, `useStockMovements` |
| `accounting.ts` | `useAccounts`, `useJournalEntries`, `useProfitLoss`, `useBalanceSheet`, `useCashFlow`, `useTrialBalance` + **cursor hooks**: `useAccountsCursor`, `useJournalEntriesCursor`, `useVouchersCursor` + mutations: `useCreateAccount`, `useCreateJournalEntry`, `useReverseJournalEntry`, `useDeleteAccount`, `useDeleteJournalEntry` |
| `hr.ts` | `useEmployees`, `usePayroll`, `useAttendance` |
| `dashboard.ts` | `useDashboardStats`, `useRevenueChart` |
| `ai.ts` | `useAIChat`, `useInvoiceBrain` |
| `automation.ts` | `useAutomations`, `useCreateRule` |
| `settings.ts` | `useCompanySettings`, `useUpdateSettings` |
| `platform-admin.ts` | `usePlatformStats`, `useTenantList` |
| `catalog.ts` | `useCatalogList`, `useCatalogDetail` |
| `webhooks.ts` | `useWebhookEndpoints`, `useWebhookEndpoint`, `useWebhookDeliveries`, `useWebhookEvents`, `useCreateWebhookEndpoint`, `useUpdateWebhookEndpoint`, `useDeleteWebhookEndpoint` |
| `product-matching.ts` | `useProductMatchingReview`, `useProductMatchingConfig`, `useProductMatchingConfirm`, `useProductMatchingUndo` |
| `founder-panel.ts` | `useMissionControl` (10s refetchInterval), `useFinOps`, `useAIFabric` |

## Cursor Pagination Hooks — ترحيل بالـ cursor لـ infinite scroll

ثلاثة hooks مخصصة لنطاق المحاسبة تستخدم `useCursorPagination<T>()` من `cursor-pagination.ts`:

| Hook | الـ endpoint | الخيارات |
|------|-------------|----------|
| `useAccountsCursor` | `/api/accounting/accounts` | `{ search, limit }` — default limit: 50 |
| `useJournalEntriesCursor` | `/api/accounting/journal-entries` | `{ status, search, limit }` — default limit: 20 |
| `useVouchersCursor` | `/api/accounting/vouchers` | `{ voucherType, status, limit }` — default limit: 20 |

كل hook يُرجع: `{ items, totalCount, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError, refetch }`

**أنماط الاستخدام:**

```tsx
// Infinite scroll — "Load More" pattern
const { items, fetchNextPage, hasNextPage, isFetchingNextPage } =
  useJournalEntriesCursor("gfx-01", { status: "posted", limit: 20 });

// Flat items array across all pages
items.map(entry => <JournalEntryRow key={entry.id} entry={entry} />)

// Load More button
{hasNextPage && (
  <button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
    تحميل المزيد
  </button>
)}
```

**Server-side pattern (في API route):**

```ts
import { parseCursorParams, buildCursorPrismaQuery, buildCursorResponse } from "@/lib/cursor-pagination-server";

export async function GET(req: NextRequest) {
  const { companySlug, cursor, limit, search, status } = parseCursorParams(req);
  const pagination = buildCursorPrismaQuery(cursor, limit);
  const allItems = await db.journalEntry.findMany({ where, ...pagination });
  return Response.json(buildCursorResponse(allItems, limit, totalCount));
}
```

## Optimistic Updates — تحديثات استباقية

`optimistic.ts` يُوفّر ثلاثة أنماط لتحديثات UI فورية:

| Helper | الوصف | الاستخدام |
|--------|-------|-----------|
| `optimisticAdd(queryClient, key, updater, errorMsg?)` | إضافة عنصر فوراً — rollback عند فشل الخادم | `onMutate` → snapshot → append → `onError` → rollback |
| `optimisticUpdate(queryClient, key, updater, errorMsg?)` | تحديث عنصر فوراً — rollback عند فشل الخادم | `onMutate` → snapshot → merge → `onError` → rollback |
| `optimisticDelete(queryClient, key, errorMsg?)` | حذف عنصر فوراً — rollback عند فشل الخادم | `onMutate` → snapshot → filter → `onError` → rollback |
| `prefetchQuery(queryClient, key, fn, staleTime?)` | Prefetch لتحضير البيانات قبل التنقل | hover-based prefetching على links |
| `invalidateMany(queryClient, keys[])` | Batch invalidation لعدة query keys | بعد multi-resource mutation |

```tsx
// مثال: Optimistic add
const mutation = useMutation({
  ...optimisticAdd(queryClient, queryKeys.invoices.lists(), (old, newItem) => [...old, newItem]),
  mutationFn: apiPost,
});
```

## الاستخدام

```tsx
// Import من barrel export
import { useClients, useAccountsCursor } from '@/hooks/queries';

// Standard query
const { data, isLoading } = useClients();

// Cursor pagination
const { items, fetchNextPage, hasNextPage } = useAccountsCursor("company-slug");
```

## الاصطلاح

- كل hook يتبع نمط `use{Resource}` للاستعلام و `useCreate{Resource}` / `useUpdate{Resource}` للمutations
- الـ cursor hooks تتبع نمط `use{Resource}Cursor` لـ infinite scroll
- المفاتيح تُعرّف في `query-keys.ts` وتُستخدم عبر `queryKeys` factory — cursor keys تُعرّف بشكل منفصل (مثل `accountsCursor`, `journalEntriesCursor`, `vouchersCursor`)
- الـ mutations تُبطل الـ cache تلقائياً عند النجاح (`invalidateQueries`)
- الـ API client يُرفق CSRF token تلقائياً في headers لطلبات الكتابة (POST/PUT/DELETE) لضمان حماية الطلبات المعدّلة
- الـ optimistic updates تُطبّق UI changes فورياً و rollback عند فشل الخادم — Arabic error messages via `sonner` toast

## Rate Limits — حدود الطلبات (Verified)

الـ API endpoints تخضع لـ rate limits مخصصة تم التحقق منها فعليًا في بيئة الإنتاج:

| الحد | القيمة | أول 429 | التحقق |
|------|--------|---------|--------|
| ACCOUNTING_READ | 40 req/min | Request #40 | ✓ Verified |
| ACCOUNTING_WRITE | 15 req/min | Request #16 | ✓ Verified |
| REPORT_GENERATION | 5 req/5min | Request #6 | ✓ Verified (p50=5.5ms, p95=14.7ms) |

الـ hooks تستخدم `api-client.ts` الذي يُضيف CSRF token تلقائياً — عند استلام 429، يُعرض toast error بالعربية ويُقترح retry بعد cooldown.
