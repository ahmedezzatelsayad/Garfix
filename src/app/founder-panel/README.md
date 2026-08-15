# Founder Panel — لوحة المؤسس (GarfiX DS v4.0 EOS)

> لوحة تحكم شاملة للمؤسس: إدارة AI، مراقبة النظام، العمليات المالية، ومجمع المفاتيح

## 🎨 Design System

| Token | Value | Usage |
|-------|-------|-------|
| **Primary** | `#047857` (Emerald Deep) | الأزرار، الروابط، الحالة النشطة |
| **Accent** | `#d4a574` (Champagne Gold) | KPIs، العناصر المميزة، التنبيهات |
| **Background** | `#0b1220` | الخلفية الرئيسية |
| **Surface** | `#0f172a` | البطاقات، الـ Sidebar |

---

## 📂 هيكل الصفحات

```
/founder-panel/
├── layout.tsx                      # Layout رئيسي مع Sidebar Navigation
├── mission-control/page.tsx        # مركز التحكم (System Health)
├── finops/page.tsx                 # العمليات المالية
│   └── finops-charts.tsx           # الرسوم البيانية المالية
├── ai-dashboard/page.tsx           # لوحة الذكاء الاصطناعي + Key Pool
├── ai-fabric/page.tsx              # محرك AI Fabric
├── ai-settings/page.tsx            # إعدادات AI لكل شركة
├── companies-ai-management/page.tsx # إدارة مفاتيح AI متعددة المستأجرين
└── api-key-pool/page.tsx           # مجمع مفاتيح API التلقائي
```

---

## 🧭 نظام التنقل (Sidebar Navigation)

### المجموعة الرئيسية (Main Dashboard)
| المسار | الأيقونة | الوصف |
|--------|----------|-------|
| `/founder-panel/mission-control` | `Activity` | مركز التحكم - صحة النظام |
| `/founder-panel/finops` | `DollarSign` | العمليات المالية |

### مجموعة الذكاء الاصطناعي (AI & Intelligence)
| المسار | الأيقونة | الشارة | الوصف |
|--------|----------|--------|-------|
| `/founder-panel/ai-dashboard` | `Brain` | جديد | لوحة AI العامة |
| `/founder-panel/ai-fabric` | `Cpu` | - | محرك AI Fabric |

### مجموعة الإدارة (Management)
| المسار | الأيقونة | الشارة | الوصف |
|--------|----------|--------|-------|
| `/founder-panel/companies-ai-management` | `Building` | - | إدارة ذكاء الشركات |
| `/founder-panel/ai-settings` | `Settings` | - | إعدادات AI |
| `/founder-panel/api-key-pool` | `Key` | مهم | مجمع مفاتيح API |

---

## 🔌 API Routes

| المسار | الطريقة | الوصف |
|--------|---------|-------|
| `/api/founder-panel/mission-control` | GET | بيانات صحة النظام |
| `/api/founder-panel/finops` | GET | بيانات العمليات المالية |
| `/api/founder-panel/ai-fabric` | GET | بيانات مراقبة AI Fabric |
| `/api/founder-panel/ai-config` | GET/PUT | قراءة/تحديث إعدادات AI للشركة |
| `/api/founder-panel/ai-config/usage` | GET | إحصائيات استخدام AI |
| `/api/founder-panel/ai-test` | POST | اختبار اتصال AI |
| `/api/founder-panel/companies` | GET | قائمة الشركات مع حالة AI |
| `/api/founder-panel/api-key-pool` | GET/POST | CRUD مجمع المفاتيح |
| `/api/founder-panel/api-key-pool/[id]` | DELETE | حذف مفتاح من المجمع |

---

## 📋 تفاصيل الصفحات

### 1️⃣ Mission Control (`/mission-control`)

| الميزة | الوصف |
|--------|-------|
| System Health | حالة Valkey, DB, Queues, Workers |
| Queue Monitor | BullMQ queues و jobs |
| Tenant Overview | نظرة شاملة على المستأجرين |
| Cascade Status | حالة 16-phase AI cascade |

### 2️⃣ Financial Ops (`/finops`)

| الملف | الوصف |
|-------|-------|
| `page.tsx` | الإيرادات، المصروفات، الربح، المدخرات |
| `finops-charts.tsx` | Revenue, Cost, Margin charts |

**KPIs:**
- Revenue (MTD)
- AI Cost (MTD) → باللون **Gold #d4a574**
- Infra Cost (MTD)
- Profit (MTD)
- Est. Month-End Profit
- Tokens Consumed

### 3️⃣ AI Dashboard (`/ai-dashboard`)

| الميزة | الوصف |
|--------|-------|
| Worker Metrics | أداء Workers |
| Key Pool Stats | إحصائيات مجمع المفاتيح |
| Provider Status | حالة كل مزود |

### 4️⃣ AI Fabric (`/ai-fabric`)

| الميزة | الوصف |
|--------|-------|
| Cascade Monitoring | 16-phase في الوقت الحقيقي |
| Provider Status | OpenRouter, DeepSeek, Gemini |
| Cost Dashboard | تكلفة لكل مستأجر ونموذج |

### 5️⃣ AI Settings (`/ai-settings`)

| الميزة | الوصف |
|--------|-------|
| Per-Company Config | إعدادات AI لكل شركة |
| Model Selector | اختيار النموذج (DeepSeek ⭐, Gemini, OpenAI) |
| Rate Limits | RPM لكل feature |
| Usage Gauge | مؤشر الاستخدام |

### 6️⃣ Company AI Management (`/companies-ai-management`)

| الميزة | الوصف |
|--------|-------|
| Multi-Tenant Keys | 4 مفاتيح معزولة لكل شركة (Chat, Invoice, Parse, Memory) |
| Feature Tabs | تبويبات لكل feature |
| Test Connection | اختبار الاتصال لكل feature |
| Provider Cards | مقارنة المزودين |

**Feature Colors:**
| Feature | Color |
|---------|-------|
| Chat | Blue `border-blue-500` |
| Invoice | Emerald `border-emerald-500` |
| Parse | Purple `border-purple-500` |
| Memory | Gold `border-[#d4a574]/50` ✅ |

### 7️⃣ API Key Pool (`/api-key-pool`) 🆕

| الميزة | الوصف |
|--------|-------|
| Upload Keys | رفع ~10 مفاتيح API |
| Auto-Assignment | توزيع تلقائي عند تسجيل شركة جديدة |
| Usage Alerts | "X keys remaining / Y used" |
| Key Management | تعطيل/حذف المفاتيح |

---

## 🔐 المصادنة

جميع صفحات `founder-panel` محمية:

```tsx
// 1. Layout Level: FounderGuard component
<FounderGuard>{children}</FounderGuard>

// 2. Redirect Logic:
//    - Not logged in → /login?returnTo=<current>
//    - Not founder → / (dashboard)
//    - Founder → render children
```

---

## 🎯 موفر AI الموصى به

| الموديل | المزود | التكلفة | الحالة |
|---------|--------|---------|--------|
| **DeepSeek V3** ⭐ | OpenRouter | $0.000035/req | ✅ يعمل |
| Gemini Flash | Google | مجاني | ⚠️ قيود موقع |
| GPT-4o | OpenAI | $0.01/req | ✅ يعمل |

**مفتاح OpenRouter العملاني:**
```
يُخزَّن في AWS SSM Parameter Store /garfix/prod/OPENROUTER_API_KEY
```

---

## 🔄 Auto-Assignment Flow

```
شركة جديدة تسجل
       ↓
النظام يبحث عن مفتاح متاح في APIKeyPool
       ↓
يوجد مفتاح؟ ──نعم──→ اسحب المفتاح ←─ عيّنه للشركة
       │                    ↓
       لا              حدّث isAssigned=true
       ↓                    ↓
تنبيه: "نفذت المفاتيح!"   أضف 4 مفاتيح معزولة:
                        ├── chatApiKey
                        ├── invoiceApiKey  
                        ├── parseApiKey
                        └── memoryApiKey
```

---

## 📝 ملاحظات التقنية

- **RTL Support**: جميع الصفحات تدعم `dir="rtl"`
- **Mobile Responsive**: Sidebar يتحول لـ Drawer على الموبايل
- **Collapsible**: Sidebar قابل للطي (72px collapsed / 280px expanded)
- **Design Tokens**: استخدام CSS Variables و NOT hardcoded colors
- **Dark Theme**: خلفية `#0b1220` مع بطاقات `#0f172a`

---

## 🚀 آخر تحديث

**التاريخ**: 2026-08-03  
**الإصدار**: GarfiX DS v4.0 EOS (Emerald Edition)  
**التغييرات**:
- ✅ إضافة Sidebar Navigation متكامل
- ✅ توحيد ألوان Design System (Gold #d4a574)
- ✅ حذف الملفات اليتيمة (.bak)
- ✅ تحديث التوثيق بجميع الصفحات
