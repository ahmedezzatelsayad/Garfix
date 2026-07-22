# AI Fabric — محرك تحسين تكلفة الذكاء الاصطناعي

> المحرك الأساسي لـ GarfiX: 20 ملف، 16 مرحلة cascade لتقليل تكلفة AI إلى أدنى حد.

## الـ Cascade Pipeline (5 مراحل رئيسية)

كل طلب AI يمر عبر هذه المراحل بالترتيب — إذا أجابت مرحلة، يتوقف الـ pipeline:

```
Cache → Pattern → Rule → Memory → Budget Gate → AI
```

## الـ 16 Phase بالتفصيل

| # | المرحلة | الملف | الوصف |
|---|---------|-------|-------|
| 1 | Cache Lookup | `gateway.ts` | البحث في Valkey cache أولاً |
| 2 | Pattern Match | `learning-engine.ts` | مطابقة الأنماط المحفوظة من طلبات سابقة |
| 3 | Rule Evaluation | `cost-optimizer.ts` | قواعد ثابتة (regex, heuristics) |
| 4 | Memory Retrieval | `learning-engine.ts` | استرجاع نتائج مشابهة من AIMemoryEntry |
| 5 | Budget Gate | `budget-engine.ts` | فحص الميزانية الشهرية قبل AI |
| 6 | Provider Selection | `provider-optimizer.ts` | اختيار أرخص provider متاح |
| 7 | Cost Estimation | `cost-per-invoice.ts` | تقدير تكلفة الطلب قبل التنفيذ |
| 8 | AI Call | `gateway.ts` | استدعاء LLM الفعلي |
| 9 | Response Cache | `gateway.ts` | حفظ النتيجة في cache |
| 10 | Learning Save | `learning-engine.ts` | حفظ النمط الجديد للتكرار |
| 11 | Usage Logging | `ai-economy-engine.ts` | تسجيل الاستهلاك في AIRequestLog |
| 12 | Budget Update | `budget-engine.ts` | تحديث رصيد الميزانية |
| 13 | Cost Tracking | `cost-per-invoice.ts` | تتبع التكلفة لكل فاتورة |
| 14 | Provider Scoring | `provider-optimizer.ts` | تقييم أداء الـ provider |
| 15 | Cross-Company Intel | `cross-company-intelligence.ts` | مشاركة الأنماط بين المستأجرين |
| 16 | AI Scoring | `ai-score.ts` | تسجيل جودة الرد |

## كيف تضيف phase جديد

1. أنشئ ملف جديد في `src/lib/ai-fabric/`
2. أضف الـ phase في `gateway.ts` داخل `executeCascade()`
3. سجّل المرحلة في `types.ts` ضمن `CascadePhase`
4. أضف اختبار في `__tests__/gateway-cascade.test.ts`

## Dependencies

- **db** (Prisma) — جداول: AIRequestLog, CacheEntry, AIMemoryEntry, RuleCandidate, BudgetConfig, JobQueue, CompanyRuntime
- **valkey** — cache layer للتخزين المؤقت
- **logger** — تسجيل كل مرحلة

## المداخل الرئيسية

```ts
import { executeCascade } from '@/lib/ai-fabric/gateway';
import { AIEconomyEngine } from '@/lib/ai-fabric/ai-economy-engine';
import { BudgetEngine } from '@/lib/ai-fabric/budget-engine';
```