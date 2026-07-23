# AI — طبقة الذكاء الاصطناعي

> التوجيه الذكي، تتبع التكلفة، تحسين النفقات، وإدارة سجل النماذج — **6 ملفات** تُشكّل البنية التحتية لـ AI في GarfiX، وتتكامل مع RBAC ونظام الطوابير.

---

## الملفات

| الملف | الوظيفة |
|-------|---------|
| `smartRouter.ts` | موجه ذكي يختار أفضل model/provider بناءً على المهمة والميزانية — يراعي tenant budget limits، latency requirements، وmodel capabilities؛ يتكامل مع `rbac.ts` لفحص صلاحيات الوصول للنماذج المتقدمة (مثلاً: فقط admin يستخدم GPT-4o) |
| `costTracker.ts` | تتبع تكلفة كل طلب AI بالتفصيل — tokens consumed (input/output), cost per token, latency, provider used؛ يُسجّل في AIRequestLog عبر `ai-economy-engine.ts` ويرسل البيانات لـ `queue-pgboss.ts` للتحليل الدوري |
| `costOptimizer.ts` | محسّن التكلفة: يختار أرخص provider يُلبي المتطلبات — يُقارن بين providers بناءً على: pricing tiers, quality score, availability؛ يعمل مع `provider-optimizer.ts` في AI Fabric لضمان最优 selection |
| `modelRegistry.ts` | سجل النماذج: capabilities, pricing, limits لكل model — يُعرّف: `id`, `name`, `provider`, `costPer1kInput`, `costPer1kOutput`, `maxTokens`, `capabilities` (vision, code, Arabic, etc.)؛ يُحدَّث تلقائياً عبر `cron-runner.ts` |
| `contextWindow.ts` | إدارة نافذة السياق: ضغط الرسائل، تقليم، تحسين token usage — strategies: summarization, truncation, relevance scoring؛ يضمن fit within model limits مع الحفاظ على أهم المعلومات |
| `context.ts` | بناء سياق الطلب (system prompt + history + company data) — يجمع: tenant-specific config من `aiConfig.ts`, company rules من `permissions.ts`, وrecent history؛ يتكامل مع `tenantScope.ts` لضمان عزل البيانات |

---

## التدفق

```
طلب AI وارد
    │
    ▼
smartRouter ──► modelRegistry (اختيار النموذج الأنسب)
    │                │
    │                ├── فحص RBAC: هل المستخدم يملك صلاحية النموذج؟
    │                ├── فحص الميزانية: هل الشركة تملك رصيد؟
    │                └── فحص التوفر: هل provider متاح؟
    │
    ▼
costOptimizer ──► فحص الميزانية واختيار provider
    │                │
    │                ├── مقارنة تكلفة providers
    │                └── مراعاة tenant rate limits
    │
    ▼
contextWindow ──► ضغط/تقليم السياق لضمان fit
    │                │
    │                ├── summarization إذا > maxTokens
    │                └── relevance scoring للحفاظ على المهم
    │
    ▼
context ──► بناء الـ prompt النهائي
    │                │
    │                ├── system prompt + tenant config
    │                ├── company data (products, rules)
    │                └── conversation history
    │
    ▼
AI Call ──► costTracker (تسجيل التكلفة)
    │                │
    │                ├── tokens consumed → AIRequestLog
    │                ├── cost → budget update
    │                └── queue event → PgBoss analytics
```

---

## التكامل مع RBAC ونظام الطوابير

### RBAC (`lib/rbac.ts`)

طبقة AI تتكامل مع نظام الصلاحيات المتقدم:

```ts
// smartRouter يفحص RBAC قبل اختيار النموذج
const permission = await checkPermission(userId, 'ai.models.advanced', companyId);
if (!permission) {
  // fallback إلى نموذج اقتصادي (DeepSeek بدلاً من GPT-4o)
  return selectEconomicalModel(taskType);
}
```

| الصلاحية | الوصف |
|----------|-------|
| `ai.models.basic` | الوصول للنماذج الأساسية (DeepSeek, Llama) |
| `ai.models.advanced` | الوصول للنماذج المتقدمة (GPT-4o, Claude) |
| `ai.models.vision` | الوصول لنماذج الرؤية (vision-capable) |
| `ai.budget.manage` | إدارة ميزانية AI للشركة |
| `ai.usage.view` | عرض تقارير استخدام AI |

### نظام الطوابير (`lib/queues.ts` + `lib/queue-pgboss.ts`)

طبقة AI تستخدم طوابير BullMQ و PgBoss:

```ts
// costTracker يُرسل تحليلات دورية عبر PgBoss
await pgboss.createSchedule('ai-cost-analysis', '0 */6 * * *', 'analyzeCosts');

// smartRouter يُسجّل events في BullMQ للتحليل
await bullmqQueue.add('ai-route-event', {
  model: selectedModel,
  provider: selectedProvider,
  cost: estimatedCost,
  tenantId: companyId,
  timestamp: Date.now(),
});
```

| الطابور | الوظيفة |
|---------|---------|
| `ai-route-events` | BullMQ — تسجيل decisions الـ smartRouter |
| `ai-cost-analysis` | PgBoss — تحليل دوري للتكلفة (6h interval) |
| `ai-model-health` | PgBoss — فحص صحة providers (1h interval) |

---

## المداخل الرئيسية

```ts
import { routeRequest } from '@/lib/ai/smartRouter';
import { trackCost } from '@/lib/ai/costTracker';
import { getModel } from '@/lib/ai/modelRegistry';
import { buildContext } from '@/lib/ai/context';
import { optimizeContextWindow } from '@/lib/ai/contextWindow';
import { selectCheapestProvider } from '@/lib/ai/costOptimizer';
```

---

## العلاقة مع AI Fabric

هذه الطبقة تُستخدم من قبل **AI Fabric** (`src/lib/ai-fabric/`) كجزء من الـ 20-phase cascade:

| ملف AI | Phase في AI Fabric | الوظيفة في الـ cascade |
|--------|---------------------|------------------------|
| `smartRouter` | Phase 6 (Provider Selection) | يختار أفضل provider بناءً على RBAC + cost |
| `costTracker` | Phase 15 (Cost Tracking) | يُسجّل التكلفة الفعلية في AIRequestLog |
| `costOptimizer` | Phase 3 (Rule Evaluation) + Phase 6 | يُقدم rules ثابتة + provider comparison |
| `modelRegistry` | Phase 6, 16 (Provider Scoring) | يُعرّف النماذج المتاحة + scoring data |
| `contextWindow` | Phase 9 (Task Compilation) | يُحسّن السياق قبل استدعاء AI |
| `context` | Phase 10 (AI Call) | يُبني الـ prompt النهائي |

---

## Model Registry

يدعم سجل النماذج multiple providers:

| Provider | النماذج | صلاحية RBAC |
|----------|---------|--------------|
| OpenRouter | DeepSeek V3, GPT-4o, Claude 3.5, Llama 3.1, Mistral | `ai.models.basic` / `ai.models.advanced` |
| Local | نماذج محلية (اختياري — Ollama) | `ai.models.basic` |

كل نموذج يُعرّف بـ:
- **`id`** — identifier unique
- **`name`** — display name
- **`provider`** — source provider
- **`costPer1kInput`** — تكلفة per 1K input tokens
- **`costPer1kOutput`** — تكلفة per 1K output tokens
- **`maxTokens`** — maximum context window
- **`capabilities`** — `vision`, `code`, `arabic`, `fast`, `reasoning`

---

## الفرق بين AI و AI Fabric

| | `lib/ai/` | `lib/ai-fabric/` |
|---|-----------|------------------|
| **الوظيفة** | توجيه + تتبع + بناء السياق | cascade pipeline + اقتصاد + optimization |
| **الملفات** | 6 | 20 |
| **العمق** | طبقة واحدة — routing & context | 20 مرحلة — full lifecycle |
| **الـ RBAC** | فحص صلاحيات النماذج | inherits from `smartRouter` |
| **الطوابير** | تسجيل events | scheduled tasks + analytics |
| **العلاقة** | foundation layer | upper layer — uses `ai/` internally |
