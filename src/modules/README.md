# Modules — الوحدات النطاقية

> كل module هو وحدة مستقلة تمثل نطاقاً تجارياً كاملاً في النظام. بعض الوحدات تتضمن عدة مشاهد (views) فرعية تغطي نطاقات متخصصة.

## الوحدات المتاحة

| الوحدة | الملف الرئيسي | الوصف |
|--------|---------------|-------|
| **account** | `AccountView.tsx` | إعدادات الحساب الشخصي |
| **accounting** | `AccountingView.tsx` | المحاسبة: قيود، ميزانية، أرباح/خسائر — **يتضمن مشاهد فرعية** (انظر الجدول أدناه) |
| **admin** | `PlatformAdminPanel.tsx` | لوحة إدارة المنصة — **يتضمن مشاهد فرعية** (انظر الجدول أدناه) |
| **ai** | `AICopilotBubble.tsx` | مساعد AI الذكي |
| **ai-agents** | `AIAgentsView.tsx` | إدارة وكلاء AI |
| **auth** | `AuthScreen.tsx` | شاشة تسجيل الدخول |
| **automation** | `AutomationView.tsx` | أتمتة العمليات |
| **bulk-input** | `BulkInputView.tsx` | إدخال جماعي |
| **catalog** | `CatalogView.tsx` | دليل المنتجات |
| **clients** | `ClientsView.tsx` | إدارة العملاء |
| **common** | `AppShell.tsx`, `Sidebar.tsx`, `Topbar.tsx`, `NotificationsDropdown.tsx`, `ReviewQueueModal.tsx`, `FullScreenLoader.tsx` | مكونات مشتركة: هيكل التطبيق، الشريط الجانبي، الشريط العلوي، الإشعارات، قائمة المراجعة، شاشة التحميل |
| **dashboard** | `DashboardView.tsx` | لوحة التحكم الرئيسية |
| **hr** | `HRView.tsx` | الموارد البشرية |
| **inventory** | `InventoryView.tsx` | إدارة المخزون |
| **invoices** | `InvoicesView.tsx` | إدارة الفواتير |
| **landing** | `LandingPage.tsx`, `EnhancedLandingPage.tsx` | الصفحة الرئيسية والنسخة المُحسّنة |
| **onboarding** | `SetupWizard.tsx` | معالج إعداد الشركة |
| **purchases** | `PurchasesView.tsx` | إدارة المشتريات |
| **reports** | `ReportsView.tsx` | التقارير |
| **saas** | `SaaSControlPanel.tsx` | إدارة الاشتراكات |
| **settings** | `SettingsView.tsx` | إعدادات الشركة |
| **team** | `TeamView.tsx` | إدارة فريق العمل |

## المشاهد الفرعية — accounting

| المشهد | الوصف | Pagination |
|--------|-------|------------|
| `AccountingView.tsx` | المحاسبة العامة: قيود يومية، ميزان المراجعة، أرباح وخسائر — **يستخدم cursor pagination hooks** (`useAccountsCursor`, `useJournalEntriesCursor`) مع TanStack Query infinite scroll | ✅ Cursor |
| `ArApView.tsx` | الذمم المدينة والدائنة (AR/AP) — aging reports, PDCs, installments | — |
| `BankingView.tsx` | إدارة الحسابات البنكية والتحويلات | — |
| `BudgetsView.tsx` | إعداد ومتابعة الموازنات التشغيلية | — |
| `FixedAssetsView.tsx` | إدارة الأصول الثابتة وإهلاكها | — |
| `InventoryCostingView.tsx` | تكاليف المخزون وطرق التقييم | — |
| `PayrollWpsView.tsx` | ربط الرواتب مع نظام حماية الأجور (WPS) | — |
| `TaxComplianceView.tsx` | الالتزام الضريبي والتقارير الضريبية | — |
| `TradeFinanceView.tsx` | التمويل التجاري: الاعتمادات، خطابات الضمان | — |
| `VouchersDetailView.tsx` | تفاصيل القيود والإيصالات — **يستخدم `useVouchersCursor`** مع infinite scroll | ✅ Cursor |
| `AccountantCollabView.tsx` | تعاون المحاسبين والمراجعة المشتركة | — |
| `ConsolidationView.tsx` | الدمج المالي بين الشركات | — |
| `MultiCompanyView.tsx` | إدارة متعددة الشركات | — |
| `PaymentRailsView.tsx` | قنوات الدفع والتحويلات | — |

### Cursor Pagination في Accounting Views

`AccountingView.tsx` يستخدم now TanStack Query infinite scroll hooks بدلاً من manual `authedFetch` + `useState`:
- `useAccountsCursor(companySlug, { limit: 50 })` — شجرة الحسابات مع "تحميل المزيد"
- `useJournalEntriesCursor(companySlug, { limit: 20 })` — القيود اليومية مع "تحميل المزيد"
- `useVouchersCursor(companySlug, { voucherType, status })` — السندات مع filters

الـ API pattern: `GET /api/accounting/resource?companySlug=X&cursor=123&limit=20` → `{ items: [...], nextCursor: "124" | null }`

Rate limits مخصصة:
- ACCOUNTING_READ: 40 req/min (GET endpoints)
- ACCOUNTING_WRITE: 15 req/min (POST/PUT/PATCH/DELETE)
- REPORT_GENERATION: 5 req/5min (heavy financial report exports)

## المشاهد الفرعية — admin

| المشهد | الوصف |
|--------|-------|
| `PlatformAdminPanel.tsx` | لوحة التحكم الرئيسية لإدارة المنصة |
| `AuditView.tsx` | سجل المراجعة والأنشطة |
| `EnhancedAuditView.tsx` | سجل مراجعة مُحسّن بفلات وتحليلات متقدمة |
| `WebhookManagementView.tsx` | إدارة وتكوين Webhooks للتكاملات الخارجية |
| `AiProviderSettings.tsx` | إعدادات مزودي AI والنماذج |

## بنية كل Module

```
modules/{name}/
├── {Name}View.tsx      # المكون الرئيسي
├── components/          # مكونات فرعية (اختياري)
├── hooks/              # Custom hooks (اختياري)
├── types.ts            # TypeScript types
└── use{Name}.ts        # Data hook (اختياري)
```

> الوحدات التي تتضمن مشاهد فرعية (accounting, admin, landing, common) تضعها مباشرة في مجلد الوحدة alongside الملف الرئيسي، كل مشهد في ملف `.tsx` مستقل.

## إضافة Module جديد

1. أنشئ مجلد `src/modules/my-module/`
2. أضف `{MyModule}View.tsx` كمكون رئيسي
3. أضف مشاهد فرعية إذا لزم الأمر (مثل `{SubFeature}View.tsx`)
4. سجّل المسار في `src/app/` أو في التوجيه
5. أضف الرابط في `common/Sidebar.tsx`
