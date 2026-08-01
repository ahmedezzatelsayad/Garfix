# 🤖 GarfiX AI - Enterprise System Documentation

## 📋 Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Components](#components)
4. [Capacity & Limits](#capacity--limits)
5. [Auto-Scaling](#auto-scaling)
6. [Health Monitoring](#health-monitoring)
7. [Failover & Recovery](#failover--recovery)
8. [Metrics Dashboard](#metrics-dashboard)
9. [API Reference](#api-reference)
10. [Configuration](#configuration)

---

## Overview

### ✅ What's New (Enterprise Upgrade)

| Feature | Status | Description |
|---------|--------|-------------|
| **Queue-Based Processing** | ✅ Complete | All AI operations now go through BullMQ |
| **Pool-Level Rate Limiting** | ✅ Complete | Hard limit at 75 RPM (no over-commit) |
| **Health Checks** | ✅ Complete | Every 30 seconds per key |
| **Quota Tracking** | ✅ Complete | Daily tokens per key |
| **Weighted Load Balancing** | ✅ Complete | Routes to least-used keys |
| **Circuit Breaker** | ✅ Complete | Auto-isolates failing keys |
| **Automatic Failover** | ✅ Complete | Instant fallback on failure |
| **Metrics API** | ✅ Complete | Real-time dashboard data |
| **Pool-Aware Scaling** | ✅ Complete | Scaler respects pool health |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    GarfiX AI Enterprise System                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐    ┌───────────────────┐    ┌────────────────┐ │
│  │   Client     │──▶│  API Endpoints     │──▶│  Rate Limiter  │ │
│  │  (Frontend)  │    │  /api/ai/*        │    │  (75 RPM max)  │ │
│  └─────────────┘    └─────────┬─────────┘    └───────┬────────┘ │
│                                │                     │          │
│                                ▼                     ▼          │
│                       ┌─────────────────────────────────────┐   │
│                       │         BULLMQ QUEUE                │   │
│                       │  ┌─────────────────────────────┐   │   │
│                       │  │ ai-queue:{companySlug}       │   │   │
│                       │  │ • Pending: Back-pressure     │   │   │
│                       │  │ • Running: Active workers    │   │   │
│                       │  │ • Max: 1000 jobs             │   │   │
│                       │  └──────────────┬──────────────┘   │   │
│                       └────────────────┼──────────────────┘   │
│                                        │                      │
│                                        ▼                      │
│                       ┌─────────────────────────────────────┐   │
│                       │      AI WORKER ROUTER               │   │
│                       ├─────────────────────────────────────┤   │
│                       │  • ai-chat           → Chat Agent  │   │
│                       │  • ai-invoice-extract→ Invoice Brain│   │
│                       │  • ai-smart-parse    → Parser      │   │
│                       │  • ai-agent-*        → Specialists │   │
│                       └────────────────┬───────────────────┘   │
│                                        │                      │
│                                        ▼                      │
│                       ┌─────────────────────────────────────┐   │
│                       │   ADVANCED LOAD BALANCER            │   │
│                       ├─────────────────────────────────────┤   │
│                       │  Strategy: Weighted (default)       │   │
│                       │                                     │   │
│                       │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐  │   │
│                       │  │Key 1│ │Key 2│ │Key 3│ │Key 4│  │   │
│                       │  │15RPM│ │15RPM│ │15RPM│ │15RPM│  │   │
│                       │  └─────┘ └─────┘ └─────┘ └─────┘  │   │
│                       │  ┌─────┐                          │   │
│                       │  │Key 5│  Total: 75 RPM            │   │
│                       │  │15RPM│                          │   │
│                       │  └─────┘                          │   │
│                       └─────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Components

### 1️⃣ AI Workers (`src/lib/workers/aiWorkers.ts`)

**Purpose:** Queue-based background processing for all AI operations.

#### Workers Available:

| Worker Type | Endpoint | Function |
|-------------|----------|----------|
| `ai-chat` | Chat conversations | Conversational AI with memory |
| `ai-invoice-extract` | Invoice processing | Smart extraction + pattern learning |
| `ai-smart-parse` | Document parsing | PDF, images, WhatsApp messages |
| `ai-agent-accounting` | Accounting specialist | Invoices, taxes, budgets |
| `ai-agent-sales` | Sales specialist | Quotes, pricing, clients |
| `ai-agent-inventory` | Inventory specialist | Stock, products, forecasting |

#### Key Features:

```typescript
// Enqueue with automatic back-pressure handling
const result = await enqueueChatJob(
  'company-slug',
  'user-123',
  [{ role: 'user', content: 'Hello!' }]
);

// Returns:
// { jobId: 'uuid' }           → Successfully queued
// { error: 'Queue full' }     → Will retry later (never rejected!)
```

### 2️⃣ Advanced Load Balancer (`src/lib/ai/advanced-loadbalancer.ts`)

**Purpose:** Intelligent distribution across 5 Gemini keys.

#### Strategies Available:

| Strategy | Description | Best For |
|----------|-------------|----------|
| `weighted` ⭐ | Routes to keys with most remaining capacity | **Default - Enterprise** |
| `round-robin` | Simple rotation | Equal distribution |
| `least-connections` | Key with fewest active requests | Latency-sensitive |
| `least-latency` | Key with best response time | Performance-critical |
| `priority` | By configured priority order | Tiered access |

#### Health Check System:

```
Every 30 seconds:
  For each key:
    ├── Send minimal "ping" request
    ├── Update latency metrics
    ├── Track consecutive failures
    └── Manage circuit state:
        ├── CLOSED    → Normal operation
        ├── OPEN      → Blocked (3+ failures)
        └── HALF-OPEN → Testing recovery
```

### 3️⃣ Rate Limiter (`aiRateLimiter` in aiWorkers.ts)

**Purpose:** Pool-level protection against overload.

#### Behavior:

```
Request arrives
    │
    ▼
Check current RPM (< 75?)
    │
    ├── YES → Process immediately or enqueue
    │
    └── NO  → Calculate wait time
              │
              ├── Queue has space? → ENQUEUE (not reject!)
              │
              └── Queue full (>1000)? → Return "try later"
                                          (with estimated wait time)
```

### 4️⃣ Enhanced Auto-Scaler (`src/lib/ai-fabric/enhanced-worker-scaler.ts`)

**Purpose:** Dynamically adjust worker pool size per company.

#### Pool-Aware Decisions:

```typescript
// The scaler now considers pool health before scaling up:

if (poolUtilization > 90%) {
  // Don't scale up - would overwhelm the system
  action = 'throttle';
} else if (healthyKeys < totalKeys * 0.5) {
  // Limited scaling - only 25% of normal
  adjustedCeiling = ceiling * 0.25;
}
```

#### Scale Triggers:

| Queue Depth | Action | Condition |
|-------------|--------|-----------|
| < 50 | Hold | Normal |
| 50-150 | Monitor | Consider scaling |
| 150-300 | Scale Up (+2) | After 2 checks |
| > 300 | Emergency (+4) | Immediate |
| 0 for 3 checks | Scale Down (-1) | Gradual |

### 5️⃣ Metrics Dashboard (`src/app/api/ai/metrics/route.ts`)

**Purpose:** Real-time monitoring and alerting.

#### Endpoints:

```bash
# Full metrics snapshot
GET /api/ai/metrics

# Filtered views
GET /api/ai/metrics?section=pool     # Pool status only
GET /api/ai/metrics?section=keys     # Per-key details
GET /api/ai/metrics?section=workers  # Worker performance

# Admin actions
POST /api/ai/metrics?action=reset-quotas  # Reset daily counters
```

#### Response Example:

```json
{
  "success": true,
  "timestamp": "2026-08-01T12:00:00Z",
  "data": {
    "pool": {
      "totalRPM": 75,
      "usedRPM": 42,
      "availableRPM": 33,
      "utilizationPct": 56,
      "status": "healthy"
    },
    "keys": [...],
    "workers": [...],
    "queue": {...},
    "alerts": [
      {
        "level": "info",
        "message": "All systems operational ✅",
        "timestamp": "2026-08-01T12:00:00Z"
      }
    ]
  }
}
```

---

## Capacity & Limits

### Hard Limits (Non-Negotiable)

| Metric | Limit | Reason |
|--------|-------|--------|
| **Total RPM** | 75 | 5 keys × 15 RPM each |
| **Tokens/Day/Key** | 1M | Google Free Tier |
| **Tokens/Day/Total** | 5M | Aggregated |
| **Queue Size** | 1000 jobs | Memory protection |
| **Max Workers/Company** | By tier | Plan-based |

### Soft Limits (Configurable)

| Metric | Default | Configurable Via |
|--------|---------|------------------|
| Scale-up threshold | 150 jobs | `QUEUE_THRESHOLDS.MEDIUM` |
| Scale-down idle time | 3 checks | `SUSTAINED_IDLE_CHECKS` |
| Cooldown between scales | 30s | `cooldownMs` in scaler |
| Circuit breaker threshold | 3 failures | `CIRCUIT_BREAKER_THRESHOLD` |

### Capacity Planning Example

```
Company Size: Medium (50 employees)
Plan: Pro (max 5 workers)

Daily AI Needs:
  • Chat interactions:     500 requests
  • Invoice extractions:   200 invoices  
  • Smart parses:          100 documents
  • Agent queries:         300 queries
  ─────────────────────────────
  Total:                   1,100 requests/day

Pool Capacity: 108,000 requests/day
Utilization: 1% ← PLENTY OF HEADROOM ✅
```

---

## Auto-Scaling

### How It Works

```
                    ┌──────────────────┐
                    │  Scaler Timer    │
                    │  (every 60s)     │
                    └────────┬─────────┘
                             │
                             ▼
              ┌──────────────────────────────┐
              │  1. Check System Resources   │
              │     CPU/RAM < 80%?           │
              └──────────────┬───────────────┘
                             │
              ┌──────────────▼───────────────┐
              │  2. Get Pool Metrics         │
              │     • Utilization %           │
              │     • Healthy keys count      │
              │     • Calculate factor        │
              └──────────────┬───────────────┘
                             │
              ┌──────────────▼───────────────┐
              │  3. For Each Company:        │
              │     • Measure queue depth    │
              │     • Apply pool factor      │
              │     • Decide action          │
              └──────────────┬───────────────┘
                             │
              ┌──────────────▼───────────────┐
              │  4. Execute Decisions        │
              │     • Update DB              │
              │     • Log changes            │
              │     • Alert if needed        │
              └──────────────────────────────┘
```

### Pool-Aware Scaling Factors

| Pool Status | Factor | Behavior |
|-------------|--------|----------|
| **Healthy** (< 70% util, all keys) | 1.0 | Full scaling allowed |
| **Degraded** (70-90% or some keys down) | 0.5 | Limited scaling |
| **Critical** (> 90% or < 40% keys) | 0.25 | Minimal scaling |

---

## Health Monitoring

### Key Health States

```
┌────────────────────────────────────────────────────────────┐
│                    KEY LIFECYCLE                            │
├────────────────────────────────────────────────────────────┤
│                                                            │
│   ┌─────────┐    Success    ┌─────────┐                   │
│   │ HEALTHY │──────────────▶│ HEALTHY │                   │
│   │ (Normal)│               │ (Active) │                   │
│   └────┬────┘               └─────────┘                   │
│        │                                                    │
│        │ Failure                                            │
│        ▼                                                    │
│   ┌─────────┐   3+ Failures  ┌─────────┐                  │
│   │ WARNING │──────────────▶│  OPEN   │ ◀── Cooldown      │
│   │ (1-2x)  │               │(Blocked)│     60s           │
│   └─────────┘               └────┬────┘                  │
│                                  │                         │
│                                  │ Timeout elapsed         │
│                                  ▼                         │
│                           ┌──────────┐                    │
│                           │HALF-OPEN │◀── Test request    │
│                           │(Testing) │    (limited traffic) │
│                           └────┬─────┘                    │
│                                │                           │
│                    ┌───────────┴───────────┐               │
│                    ▼                       ▼               │
│              ┌──────────┐           ┌──────────┐           │
│              │ SUCCESS  │           │ FAILURE  │           │
│              │ (Recover)│           │(Re-open) │           │
│              └────┬─────┘           └──────────┘           │
│                   │                                        │
│                   ▼                                        │
│              ┌─────────┐                                   │
│              │ HEALTHY │                                   │
│              └─────────┘                                   │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### Metrics Collected Per Key

```typescript
interface KeyHealthStatus {
  // Identity
  keyId: string;
  keyName: string;

  // Health
  isHealthy: boolean;
  circuitState: 'closed' | 'open' | 'half-open';
  consecutiveFailures: number;
  lastError?: string;

  // Quota (Daily)
  requestsToday: number;
  tokensToday: number; 
  maxTokensPerDay: number; // 1M

  // Rate Limiting (Per Minute)
  rpmCurrent: number;
  rpmLimit: number; // 15

  // Performance
  avgLatencyMs: number;
  successRate: number; // Percentage
}
```

---

## Failover & Recovery

### Automatic Failover Flow

```
Request sent to Key #1
    │
    ▼
┌─────────────┐
│ Call API    │
└──────┬──────┘
       │
       ▼
┌─────────────┐     Success
│ Response?   │────────────▶ Return result ✓
└──────┬──────┘
       │
       Failure
       ▼
┌─────────────┐
│ Record      │  Log failure, update counter
│ Failure     │  Check circuit breaker
└──────┬──────┘
       │
       ▼
┌─────────────┐     Consecutive < 3?
│ Circuit     │────────Yes────────▶ Try Next Key
│ Breaker     │
│ Check       │
└──────┬──────┘
       │ No (3+ failures)
       ▼
┌─────────────┐
│ OPEN        │  Block this key for 60s
│ Circuit     │  Alert administrators
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Fallback to │  Use remaining healthy keys
│ Next Key    │  If none → Queue with back-pressure
└─────────────┘
```

### Degradation Modes

| Scenario | Available RPM | Behavior |
|----------|---------------|----------|
| **All 5 keys healthy** | 75 RPM | Normal operation |
| **1 key down** | 60 RPM | Continue, alert warning |
| **2 keys down** | 45 RPM | Throttle non-critical work |
| **3 keys down** | 30 RPM | Emergency mode, queue only critical |
| **4+ keys down** | 15 RPM | Critical alert, manual review needed |

---

## Metrics Dashboard

### Accessing Metrics

```bash
# Get full dashboard data
curl -H "Authorization: Bearer $TOKEN" \
  https://your-app.com/api/ai/metrics

# Pool status only
curl -H "Authorization: Bearer $TOKEN" \
  https://your-app.com/api/ai/metrics?section=pool

# Key health details
curl -H "Authorization: Bearer $TOKEN" \
  https://your-app.com/api/ai/metrics?section=keys
```

### Alert Levels

| Level | When | Action |
|-------|------|--------|
| `info` | All systems normal | Display status |
| `warning` | High utilization (>75%) or quota usage (>90%) | Monitor closely |
| `error` | Key unhealthy or partial failure | Prepare fallback |
| `critical` | Pool overloaded (>90%) or multiple keys down | Immediate attention |

### Sample Alert Response

```json
{
  "alerts": [
    {
      "level": "warning",
      "message": "Pool utilization high: 82%",
      "timestamp": "2026-08-01T12:00:00Z"
    },
    {
      "level": "error", 
      "message": "1 key(s) unhealthy out of 5",
      "timestamp": "2026-08-01T12:00:00Z"
    }
  ]
}
```

---

## API Reference

### Enqueue Functions

```typescript
import {
  enqueueChatJob,
  enqueueInvoiceExtractJob,
  enqueueSmartParseJob,
  enqueueAgentJob,
} from '@/lib/workers/aiWorkers';

// Chat
const chatResult = await enqueueChatJob(
  'company-slug',      // companySlug: string
  'user-id',           // userId: string
  [                   // messages: Array<{role, content}>
    { role: 'user', content: 'Hello!' }
  ],
  'conversation-id'   // conversationId?: string
);

// Invoice Extraction
const invoiceResult = await enqueueInvoiceExtractJob(
  'company-slug',
  'user-id',
  'raw text from PDF...',  // rawText: string
  {                        // options?
    invoiceId: 'inv-123',
    source: 'whatsapp'
  }
);

// Smart Parse
const parseResult = await enqueueSmartParseJob(
  'company-slug',
  'user-id',
  'document content...',   // content: string
  'application/pdf',       // contentType: string
  { storeId: 'doc-456' }   // options?
);

// Specialist Agent
const agentResult = await enqueueAgentJob(
  'accounting',             // agentType: 'accounting' | 'sales' | 'inventory'
  'company-slug',
  'user-id',
  'How much tax do I owe?', // message: string
  [                         // context?
    { role: 'system', content: 'You are an accounting expert...' }
  ]
);
```

### Load Balancer Direct Usage

```typescript
import { 
  getAdvancedLoadBalancer,
  initAdvancedLoadBalancer 
} from '@/lib/ai/advanced-loadbalancer';

// Initialize with your keys
const lb = initAdvancedLoadBalancer([
  { id: 'key-1', apiKey: '...', name: 'Ahmed' },
  { id: 'key-2', apiKey: '...', name: 'Sibling1' },
  // ... all 5 keys
]);

// Get best available key
const key = await lb.getNextKey();

// Record success/failure
lb.recordSuccess('key-1', tokensUsed, latencyMs);
const fallbackKey = lb.recordFailure('key-2', errorMessage);

// Get metrics
const metrics = lb.getMetrics();
console.log(`Pool utilization: ${metrics.utilizationPct}%`);
```

### Metrics API Usage

```typescript
// Frontend component example
async function fetchAIMetrics() {
  const res = await fetch('/api/ai/metrics');
  const data = await res.json();
  
  if (data.success) {
    setPoolStatus(data.data.pool);
    setKeys(data.data.keys);
    setAlerts(data.data.alerts);
  }
}

// Poll every 10 seconds
useEffect(() => {
  fetchAIMetrics();
  const interval = setInterval(fetchAIMetrics, 10_000);
  return () => clearInterval(interval);
}, []);
```

---

## Configuration

### Environment Variables

```env
# Already existing in .env:
GEMINI_API_KEY_1=...
GEMINI_API_KEY_2=...
GEMINI_API_KEY_3=...
GEMINI_API_KEY_4=...
GEMINI_API_KEY_5=...
GEMINI_MODEL=gemini-2.0-flash
```

### Runtime Configuration

```typescript
// In bootstrap or initialization file:

import { registerAIWorkers } from '@/lib/workers/aiWorkers';
import { getEnhancedScaler } from '@/lib/ai-fabric/enhanced-worker-scaler';

// Register workers with queue system
registerAIWorkers();

// Start auto-scaler (runs every 60s)
const scaler = getEnhancedScaler({
  checkIntervalMs: 60_000,
  scaleUpStep: 2,
  scaleDownStep: 1,
});

// Start scaler interval
setInterval(() => scaler.scaleWorkers(), 60_000);
```

### Customizing Thresholds

```typescript
// Edit constants in source files as needed:

// aiWorkers.ts
export const QUEUE_MAX_SIZE = 1000;        // Max queued jobs
export const POOL_MAX_RPM = 75;            // Global rate limit

// advanced-loadbalancer.ts  
const HEALTH_CHECK_INTERVAL = 30_000;      // 30 seconds
const CIRCUIT_BREAKER_THRESHOLD = 3;       // Failures before blocking
const CIRCUIT_RESET_TIMEOUT = 60_000;      // 60s cooldown

// enhanced-worker-scaler.ts
const QUEUE_THRESHOLDS = {
  LOW: 50,      // Normal
  MEDIUM: 150,  // Consider scaling
  HIGH: 300,    // Scale now
  CRITICAL: 500, // Emergency
};
```

---

## Troubleshooting

### Common Issues

#### "No healthy keys available"

**Cause:** All 5 keys have open circuits.

**Solution:**
1. Check `/api/ai/metrics?section=keys` for key status
2. Wait 60s for circuit reset timeout
3. Verify API keys are valid (not revoked)
4. Check if Google service is down in your region

#### "Queue full" errors

**Cause:** More than 1000 jobs pending.

**Solution:**
1. Check `/api/ai/metrics?section=workers` for stuck jobs
2. Increase `QUEUE_MAX_SIZE` if needed
3. Add more worker capacity via plan upgrade
4. Check if a job is causing infinite retries

#### High latency

**Cause:** Pool utilization > 80%.

**Solution:**
1. Review which workers are consuming most capacity
2. Consider caching frequent queries
3. Offload non-critical work to off-peak hours
4. Upgrade plan for higher worker limits

#### Keys showing high failure rate

**Cause:** Network issues, rate limiting, or invalid keys.

**Solution:**
1. Check each key individually with curl
2. Verify you're in a supported region
3. Review error messages in logs
4. Rotate keys if some are consistently failing

---

## Summary

### What You Now Have ✅

| Capability | Implementation |
|------------|----------------|
| **Never reject requests** | Queue with back-pressure |
| **Respect pool limits** | Hard 75 RPM cap |
| **Intelligent routing** | Weighted load balancing |
| **Self-healing** | Circuit breakers + failover |
| **Full visibility** | Metrics dashboard API |
| **Auto-scaling** | Pool-aware worker management |
| **Enterprise-ready** | All the features above! |

### Next Steps

1. **Test locally** - Run the system and check `/api/ai/metrics`
2. **Monitor alerts** - Set up webhook notifications for critical alerts
3. **Configure thresholds** - Adjust for your specific workload
4. **Plan capacity** - Use metrics to right-size your deployment

---

*Last Updated: 2026-08-01*
*Version: Enterprise v2.0*
