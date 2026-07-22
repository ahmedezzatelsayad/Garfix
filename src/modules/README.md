# Modules — الوحدات النطاقية (20 module)

> كل module هو وحدة مستقلة تمثل نطاقاً تجارياً كاملاً في النظام.

## الوحدات المتاحة

| الوحدة | الملف الرئيسي | الوصف |
|--------|---------------|-------|
| **account** | `AccountView.tsx` | إعدادات الحساب الشخصي |
| **accounting** | `AccountingView.tsx` | المحاسبة: قيود، ميزانية، أرباح/خسائر |
| **admin** | `PlatformAdminPanel.tsx` | لوحة إدارة المنصة |
| **ai** | `AICopilotBubble.tsx` | مساعد AI الذكي |
| **ai-agents** | `AIAgentsView.tsx` | إدارة وكلاء AI |
| **auth** | `AuthScreen.tsx` | شاشة تسجيل الدخول |
| **automation** | `AutomationView.tsx` | أتمتة العمليات |
| **bulk-input** | `BulkInputView.tsx` | إدخال جماعي |
| **catalog** | `CatalogView.tsx` | دليل المنتجات |
| **clients** | `ClientsView.tsx` | إدارة العملاء |
| **common** | `AppShell.tsx`, `Sidebar.tsx` | مكونات مشتركة |
| **dashboard** | `DashboardView.tsx` | لوحة التحكم الرئيسية |
| **hr** | `HRView.tsx` | الموارد البشرية |
| **inventory** | `InventoryView.tsx` | إدارة المخزون |
| **invoices** | `InvoicesView.tsx` | إدارة الفواتير |
| **landing** | `LandingPage.tsx` | الصفحة الرئيسية |
| **onboarding** | `SetupWizard.tsx` | معالج إعداد الشركة |
| **purchases** | `PurchasesView.tsx` | إدارة المشتريات |
| **reports** | `ReportsView.tsx` | التقارير |
| **saas** | `SaaSControlPanel.tsx` | إدارة الاشتراكات |
| **settings** | `SettingsView.tsx` | إعدادات الشركة |
| **team** | `TeamView.tsx` | إدارة فريق العمل |

## بنية كل Module

```
modules/{name}/
├── {Name}View.tsx      # المكون الرئيسي
├── components/          # مكونات فرعية (اختياري)
├── hooks/              # Custom hooks (اختياري)
├── types.ts            # TypeScript types
└── use{Name}.ts        # Data hook (اختياري)
```

## إضافة Module جديد

1. أنشئ مجلد `src/modules/my-module/`
2. أضف `{MyModule}View.tsx` كمكون رئيسي
3. سجّل المسار في `src/app/` أو في التوجيه
4. أضف الرابط في `common/Sidebar.tsx`