# AI Fabric — محرك تحسين تكلفة الذكاء الاصطناعي

> المحرك الأساسي لـ GarfiX: **20 ملف مصدر**، **20 مرحلة cascade** لتقليل تكلفة AI إلى أدنى حد، مع prediction، marketplace، digital twin، profit engine، وauto-scaling.

---

## الـ Cascade Pipeline (7 مراحل رئيسية)

كل طلب AI يمر عبر هذه المراحل بالترتيب — إذا أجابت مرحلة مبكرة، يتوقف الـ pipeline ويُوفّر التكلفة:

```
Cache → Pattern → Rule → Memory → Budget Gate → Worker Prediction → AI
                                                          │
                                                    Digital Twin (simulation)
                                                          │
                                                    Profit Engine (margin check)
                                                          │
                                                    Worker Scaler (capacity)
```

---

## الـ 20 Phase بالتفصيل

### المراحل الأصلية (1–16)

| # | المرحلة | الملف | الوصف |
|---|---------|-------|-------|
| 1 | Cache Lookup | `gateway.ts` | البحث في Valkey cache أولاً — إذا وجد رد، يعود فوراً |
| 2 | Pattern Match | `learning-engine.ts` | مطابقة الأنماط المحفوظة من طلبات سابقة |
| 3 | Rule Evaluation | `cost-optimizer.ts` | قواعد ثابتة (regex, heuristics) — لا تكلفة AI |
| 4 | Memory Retrieval | `learning-engine.ts` | استرجاع نتائج مشابهة من AIMemoryEntry |
| 5 | Budget Gate | `budget-engine.ts` | فحص الميزانية الشهرية — block if exceeded |
| 6 | Provider Selection | `provider-optimizer.ts` | اختيار أرخص provider متاح بناءً على scoring |
| 7 | Cost Estimation | `cost-per-invoice.ts` | تقدير تكلفة الطلب قبل التنفيذ |
| 8 | Worker Prediction | `worker-prediction.ts` | توقع الحاجة إلى workers — demand forecasting |
| 9 | AI Task Compilation | `ai-compiler.ts` | ترجمة الطلب إلى plan تنفيذ محسّن |
| 10 | AI Call | `gateway.ts` | استدعاء LLM الفعلي عبر provider المحدد |
| 11 | Response Cache | `gateway.ts` | حفظ النتيجة في Valkey cache للتكرار |
| 12 | Learning Save | `learning-engine.ts` | حفظ النمط الجديد في AIMemoryEntry |
| 13 | Usage Logging | `ai-economy-engine.ts` | تسجيل الاستهلاك في AIRequestLog |
| 14 | Budget Update | `budget-engine.ts` | تحديث رصيد الميزانية الشهرية |
| 15 | Cost Tracking | `cost-per-invoice.ts` | تتبع التكلفة الفعلية لكل فاتورة |
| 16 | Provider Scoring | `provider-optimizer.ts` | تقييم أداء الـ provider — latency, quality, cost |

### المراحل المتقدمة (17–20)

| # | المرحلة | الملف | الوصف |
|---|---------|-------|-------|
| 17 | Cross-Company Intel | `cross-company-intelligence.ts` | مشاركة الأنماط بين المستأجرين (anonymized) — سرعة التعلم |
| 18 | AI Scoring | `ai-score.ts` | تسجيل جودة الرد — confidence, completeness scoring |
| 19 | Profit Check | `profit-engine.ts` | فحص هامش الربح — هل الطلب مربح بعد التكلفة؟ |
| 20 | Digital Twin Sim | `digital-twin.ts` | محاكاة التوأم الرقمي — model cost/quality قبل التنفيذ |

---

## الملفات — التصنيف الكامل (20 ملف)

### 🔄 الـ Cascade Core (8 ملف)

| الملف | الوظيفة | المراحل |
|-------|---------|----------|
| `gateway.ts` | البوابة الرئيسية — `executeCascade()`، AI call، cache store/retrieve | 1, 8, 10, 11 |
| `learning-engine.ts` | محرك التعلم — pattern match, memory retrieval, pattern save | 2, 4, 12 |
| `cost-optimizer.ts` | محسّن التكلفة — rule evaluation (regex, heuristics) | 3 |
| `budget-engine.ts` | محرك الميزانية — budget gate, monthly limit, update | 5, 14 |
| `provider-optimizer.ts` | محسّن المزود — selection, scoring, failover | 6, 16 |
| `cost-per-invoice.ts` | تكلفة الفاتورة — estimation before call, tracking after | 7, 15 |
| `ai-economy-engine.ts` | محرك الاقتصاد — usage logging, analytics, economy dashboard | 13 |
| `ai-score.ts` | تسجيل الجودة — response confidence & completeness scoring | 18 |

### 🧠 Prediction & Planning (3 ملف)

| الملف | الوظيفة |
|-------|---------|
| `worker-prediction.ts` | توقع طلب AI workers — تحليل الأنماط الزمنية، seasonal trends، peak forecasting |
| `ai-compiler.ts` | مترجم AI — compile AI tasks into optimized execution plans (batching, model routing, prompt optimization) |
| `digital-twin.ts` | التوأم الرقمي — simulate cost/quality tradeoffs قبل استدعاء AI الفعلي؛ helps provider optimizer choose best model |

### 💰 Profit & Economy (2 ملف)

| الملف | الوظيفة |
|-------|---------|
| `profit-engine.ts` | محرك الربح — calculate margin per request, reject unprofitable calls, optimize pricing strategy |
| `cross-company-intelligence.ts` | ذكاء مشترك — share anonymized patterns cross-tenant; accelerates learning for new companies |

### ⚡ Worker Infrastructure (3 ملف)

| الملف | الوظيفة |
|-------|---------|
| `worker-marketplace.ts` | سوق العمال — trade AI capacity between tenants; surplus capacity becomes available on marketplace |
| `worker-scaler.ts` | مقياس العمال — auto-scale AI worker pool based on demand prediction; handles peak loads |
| `heat-map.ts` | خريطة حرارية — visualize AI resource utilization across providers, models, time periods |

### ⏰ Scheduling & Types (4 ملف)

| الملف | الوظيفة |
|-------|---------|
| `scheduler.ts` | جدولة المهام — cron-based cascade maintenance, cache cleanup, budget resets |
| `cron-runner.ts` | مشغل Cron — execute scheduled tasks: pattern decay, budget rollover, provider health checks |
| `types.ts` | أنواع TypeScript — `CascadePhase`, `CascadeResult`, `AIRequest`, `ProviderScore`, config interfaces |
| `index.ts` | المدخل الرئيسي — unified exports for all AI Fabric modules |

---

## التدفق المُوسّع

```
طلب AI وارد
    │
    ▼
Phase 1: Cache Lookup ──► (found? return cached result)
    │
    ▼
Phase 2: Pattern Match ──► (matched? return learned pattern)
    │
    ▼
Phase 3: Rule Evaluation ──► (rule hit? return heuristic result)
    │
    ▼
Phase 4: Memory Retrieval ──► (similar? return memory result)
    │
    ▼
Phase 5: Budget Gate ──► (exceeded? block request)
    │
    ▼
Phase 6: Provider Selection ──► choose cheapest capable provider
    │
    ▼
Phase 7: Cost Estimation ──► estimate tokens & cost
    │
    ▼
Phase 8: Worker Prediction ──► forecast worker demand
    │
    ▼
Phase 9: Task Compilation ──► optimize execution plan
    │
    ▼
Phase 20: Digital Twin Sim ──► simulate cost/quality tradeoff
    │
    ▼
Phase 19: Profit Check ──► verify margin is positive
    │
    ▼
Phase 10: AI Call ──► execute LLM request
    │
    ▼
Phase 11: Response Cache ──► store in Valkey
    │
    ▼
Phase 12: Learning Save ──► save new pattern
    │
    ▼
Phase 13: Usage Logging ──► log in AIRequestLog
    │
    ▼
Phase 14: Budget Update ──► deduct from monthly budget
    │
    ▼
Phase 15: Cost Tracking ──► track per-invoice cost
    │
    ▼
Phase 16: Provider Scoring ──► rate provider performance
    │
    ▼
Phase 17: Cross-Company Intel ──► share anonymized pattern
    │
    ▼
Phase 18: AI Scoring ──► score response quality
```

---

## كيف تضيف phase جديد

1. أنشئ ملف جديد في `src/lib/ai-fabric/`
2. أضف الـ phase في `gateway.ts` داخل `executeCascade()`
3. سجّل المرحلة في `types.ts` ضمن `CascadePhase`
4. أضف اختبار في `__tests__/gateway-cascade.test.ts`
5. حدّل هذا README — أضف المرحلة في الجدول

---

## Dependencies

| الـ dependency | الوظيفة |
|---------------|---------|
| **db** (Prisma) | جداول: AIRequestLog, CacheEntry, AIMemoryEntry, RuleCandidate, BudgetConfig, JobQueue, CompanyRuntime |
| **valkey** | cache layer للتخزين المؤقت + rate limit + pub/sub |
| **logger** | تسجيل كل مرحلة — structured logging via Pino |
| **ai/** (lib/ai) | `smartRouter` → Phase 6، `costTracker` → Phase 15 |
| **rbac** (lib/rbac) | فحص صلاحيات AI requests — restrict expensive models by role |
| **queues** (lib/queues) | background processing for cross-company intel & pattern decay |
| **queue-pgboss** | PgBoss for scheduled maintenance tasks (cron-runner) |

---

## المداخل الرئيسية

```ts
// الـ cascade الكامل
import { executeCascade } from '@/lib/ai-fabric/gateway';

// المحركات الفردية
import { AIEconomyEngine } from '@/lib/ai-fabric/ai-economy-engine';
import { BudgetEngine } from '@/lib/ai-fabric/budget-engine';
import { ProfitEngine } from '@/lib/ai-fabric/profit-engine';
import { DigitalTwin } from '@/lib/ai-fabric/digital-twin';

// الـ workers
import { WorkerPrediction } from '@/lib/ai-fabric/worker-prediction';
import { WorkerMarketplace } from '@/lib/ai-fabric/worker-marketplace';
import { WorkerScaler } from '@/lib/ai-fabric/worker-scaler';

// الأنواع
import { CascadePhase, CascadeResult, AIRequest } from '@/lib/ai-fabric/types';
```

---

## الاختبارات

| الملف | الوظيفة |
|-------|---------|
| `gateway.test.ts` | اختبار البوابة الأساسية |
| `gateway-cascade.test.ts` | اختبار الـ cascade الكامل |
| `gateway-full-cascade.test.ts` | اختبار cascade مع all 20 phases |
| `budget-engine-advanced.test.ts` | اختبار الميزانية المتقدم |
| `learning-engine-advanced.test.ts` | اختبار التعلم المتقدم |
| `cost-optimizer-advanced.test.ts` | اختبار محسّن التكلفة المتقدم |
| `economy-engine.test.ts` | اختبار محرك الاقتصاد |
| `economy-engine-observatory.test.ts` | اختبار المرصد |
| `economics-p1.test.ts` | اختبار الاقتصاد Phase 1 |
| `economics-p2.test.ts` | اختبار الاقتصاد Phase 2 |
| `digital-twin-profit.test.ts` | اختبار التوأم الرقمي + الربح |
| `cron-runner.test.ts` | اختبار مشغل Cron |
| `worker-budget.test.ts` | اختبار budget العمال |
| `observatory.test.ts` | اختبار المرصد |

**14 اختبار** يغطي جميع المراحل والمحركات.
