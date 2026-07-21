# AI — طبقة الذكاء الاصطناعي

> التوجيه الذكي، تتبع التكلفة، تحسين النفقات، وإدارة سجل النماذج — 6 ملفات تُشكّل البنية التحتية لـ AI في GarfiX.

## الملفات

| الملف | الوظيفة |
|-------|---------|
| `smartRouter.ts` | موجه ذكي يختار أفضل model/provider بناءً على المهمة والميزانية |
| `costTracker.ts` | تتبع تكلفة كل طلب AI بالتفصيل (tokens, cost, latency) |
| `costOptimizer.ts` | محسّن التكلفة: يختار أرخص provider يُلبي المتطلبات |
| `modelRegistry.ts` | سجل النماذج: capabilities, pricing, limits لكل model |
| `contextWindow.ts` | إدارة نافذة السياق: ضغط الرسائل، تقليم، تحسين token usage |
| `context.ts` | بناء سياق الطلب (system prompt + history + company data) |

## التدفق

```
طلب AI وارد
    │
    ▼
smartRouter ──► modelRegistry (اختيار النموذج الأنسب)
    │
    ▼
costOptimizer ──► فحص الميزانية واختيار provider
    │
    ▼
contextWindow ──► ضغط/تقليم السياق لضمان fit
    │
    ▼
context ──► بناء الـ prompt النهائي
    │
    ▼
AI Call ──► costTracker (تسجيل التكلفة)
```

## المداخل الرئيسية

```ts
import { routeRequest } from '@/lib/ai/smartRouter';
import { trackCost } from '@/lib/ai/costTracker';
import { getModel } from '@/lib/ai/modelRegistry';
import { buildContext } from '@/lib/ai/context';
import { optimizeContextWindow } from '@/lib/ai/contextWindow';
```

## العلاقة مع AI Fabric

هذه الطبقة تُستخدم من قبل **AI Fabric** (`src/lib/ai-fabric/`) كجزء من الـ 16-phase cascade. الـ `smartRouter` يُستدعى في Phase 6 (Provider Selection) و `costTracker` في Phase 13 (Cost Tracking).

## Model Registry

يدعم سجل النماذج multiple providers:

| Provider | النماذج |
|----------|---------|
| OpenRouter | DeepSeek, GPT-4o, Claude, Llama, Mistral |
| Local | نماذج محلية (اختياري) |

كل نموذج يُعرّف بـ: `id`, `name`, `provider`, `costPer1kInput`, `costPer1kOutput`, `maxTokens`, `capabilities`.