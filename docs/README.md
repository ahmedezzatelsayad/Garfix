# Docs — الوثائق والتقارير

> تقارير التدقيق، خطط الطريق، قرارات التصميم (ADRs)، مواصفات API، وحالة المشروع — 19 مستند توثق رحلة تطوير GarfiX.

## المستندات

### التخطيط والحالة

| الملف | الوصف |
|-------|-------|
| `ROADMAP.md` | خارطة الطريق والمراحل القادمة للمشروع |
| `CONSOLIDATED_STATUS.md` | تقرير حالة شامل يجمع كل التقدم |
| `UPDATE_REPORT_v1.3.md` | تقرير التحديث الإصدار 1.3 |

### التقارير والتدقيقات

| الملف | الوصف |
|-------|-------|
| `FIX_REPORT_v3.md` | تقرير الإصلاحات — الإصدار 3 |
| `FIX_REPORT_v4.md` | تقرير الإصلاحات — الإصدار 4 |
| `REMEDIATION_REPORT_v1.2.md` | تقرير المعالجة والأ Remediation v1.2 |
| `GATE2_TEST_SUITE.md` | تقرير بوابة الاختبار الثانية (Gate 2) |
| `GATE3_IDOR_AUDIT.md` | تقرير تدقيق IDOR — Gate 3 (54/56 handlers محمية) |
| `LOGGER_FIX_AUDIT.md` | تقرير إصلاح نظام التسجيل (Logger) |

### واجهة المستخدم والتجاوب

| الملف | الوصف |
|-------|-------|
| `MOBILE_RESPONSIVE_REPORT.md` | تقرير التجاوب مع الأجهزة المحمولة و أحجام الشاشات |

### البنية و التصميم

| الملف | الوصف |
|-------|-------|
| `ARCHITECTURE-v12.1.md` | دليل البنية و النشر — Architecture & Deployment Guide v12.1 |

### مواصفات API

| الملف | الوصف |
|-------|-------|
| `api/openapi.yaml` | مواصفات OpenAPI 3.1.0 الكاملة لـ GarfiX EOS API — تتضمن: |

تفاصيل `openapi.yaml` تشمل:
- **المصادقة**: JWT Bearer tokens عبر HttpOnly cookies (access + refresh)
- **RBAC**: صلاحيات مبنية على الأدوار مع permission bits تفصيلية (`view_invoices`, `finance_access`, إلخ)
- **Webhooks**: نقاط استقبال ويب هوك خارجية (WhatsApp, إلخ) — مسارات `/webhooks/whatsapp`
- **Multi-Tenancy**: عزل عبر `companySlug` (query param أو `X-Company-Slug` header)
- **Rate Limiting**: حدود سرعة per-IP و per-user على نقاط حساسة

### قرارات التصميم — ADR (Architecture Decision Records)

| الملف | العنوان | الوصف |
|-------|---------|-------|
| `adr/001-pg-boss-queue.md` | pg-boss كـ Queue Fallback | استخدام pg-boss كـ queue احتياطي عند عدم وجود Valkey |
| `adr/002-decimal-monetary-fields.md` | ترحيل Decimal للحقول المالية | تحويل القيم المالية من `String` إلى `Decimal` — Decimal Migration Report |
| `adr/003-arabic-first-rtl.md` | Arabic-first مع RTL | التصميم العربي أولاً مع اتجاه RTL للمنطقة |
| `adr/004-multi-tenant-shared-db.md` | Multi-tenant Shared DB | عزل Multi-tenant عبر `companySlug` في قاعدة مشتركة |
| `adr/005-ai-fabric-cascade.md` | 16-Phase AI Cascade | نظام 16 مرحلة لتحسين تكلفة AI |
| `adr/006-e-invoicing-mena.md` | E-Invoicing MENA | التوافق مع معايير الفوترة الإلكترونية لمنطقة MENA — E-invoicing Compliance |
| `adr/007-nextjs-spa.md` | Next.js SPA | البنية SPA أحادية الصفحة باستخدام Next.js |
| `adr/008-bullmq-valkey.md` | BullMQ + Valkey | استخدام BullMQ مع Valkey للـ queues الإنتاجية |

## الاصطلاح

- التقارير تُرقّم بالإصدار (`v3`, `v4`, `v1.2`, `v1.3`)
- البوابات (`GATE2`, `GATE3`) تمثل معايير جودة يجب تجاوزها قبل الإطلاق
- كل تقرير إصلاح يوثّق: المشكلة، الحل، والاختبار المؤكد
- ADRs تُرقّم تسلسلياً (`001`–`008`) وكل منها يحتوي: Context, Decision, Status
- OpenAPI spec تُحدّث مع كل إضافة endpoint جديدة
