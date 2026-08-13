# TPD-16 — Observability Plan (OpenTelemetry + Prometheus + Grafana)

> **Status:** Plan only (no runtime implementation in this phase).
> **Audit ref:** TPD-16 FIX (Audit v2 · Phase 3).
> **Scope:** Production Garfix ERP deployment (AWS/ECS or Vercel + managed PG + Valkey).

This document defines the observability stack that should be implemented in a
follow-up phase. Garfix ERP currently has:

- `src/lib/observability.ts` — structured JSON logger (stdout → Docker logs →
  CloudWatch / Vercel logs).
- `src/lib/telemetry/tracing.ts` — lightweight in-process span collector used
  by the AI Fabric cascade (no OTel export yet).
- `src/lib/telemetry/event-bus-audit.ts` — audit-log bridge from the event
  bus to the `AuditLog` table.
- `src/instrumentation.ts` — Next.js instrumentation hook (currently a no-op
  — the perfect injection point for OTel Node SDK auto-instrumentation).
- `/api/health` — liveness + readiness probe.
- `/api/metrics/slo` — SLO endpoint (returns JSON, not Prometheus format).
- Sentry integration (when `SENTRY_DSN` is set).

What's missing: **OpenTelemetry traces exported to a collector**, **Prometheus
metrics endpoint**, and a **Grafana dashboard** with SLO/alert rules.

---

## 1. Goals

| Pillar | Current | Target |
|--------|---------|--------|
| Logs | JSON to stdout | ✅ unchanged — logs already structured; ship via CloudWatch / Loki |
| Traces | In-process only | OTLP/gRPC → Grafana Tempo (or AWS X-Ray) |
| Metrics | Ad-hoc JSON endpoints | `/metrics` Prometheus exposition format → Grafana Mimir |
| Alerts | Sentry only | Grafana Alerting → PagerDuty / Slack |
| Dashboards | None | 4 dashboards: API, AI Fabric, Queues, Infra |

---

## 2. Components

```
┌─────────────────────────────────────────────────────────────┐
│  Next.js (Node 22 standalone)                                │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ @opentelemetry/sdk-node (auto-instrumentation)         │ │
│  │   • @opentelemetry/instrumentation-http                │ │
│  │   • @opentelemetry/instrumentation-express (n/a)       │ │
│  │   • @opentelemetry/instrumentation-pg (Prisma queries) │ │
│  │   • @opentelemetry/instrumentation-ioredis (Valkey)    │ │
│  │   • custom: AI Fabric cascade span                     │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ prom-client (Prometheus metrics registry)              │ │
│  │   • http_requests_total{method,route,status}           │ │
│  │   • http_request_duration_seconds (histogram)          │ │
│  │   • db_query_duration_seconds{model,operation}         │ │
│  │   • ai_tokens_total{provider,model,type}               │ │
│  │   • ai_request_duration_seconds{provider,model}        │ │
│  │   • queue_depth{queue,state}                           │ │
│  │   • circuit_breaker_state{key,state}                   │ │
│  │   • valkey_operations_total{op}                        │ │
│  └────────────────────────────────────────────────────────┘ │
│                       │                                      │
│                       ▼                                      │
│              /metrics endpoint (Prometheus exposition)       │
└─────────────────────────────────────────────────────────────┘
            │                              │
            │ scrape (15s)                 │ OTLP/gRPC (push)
            ▼                              ▼
   ┌──────────────────┐         ┌──────────────────────┐
   │ Prometheus /     │         │ OTel Collector       │
   │ Grafana Mimir    │         │ (agent daemonset)    │
   └──────────────────┘         └──────────────────────┘
            │                              │
            ▼                              ▼
   ┌──────────────────────────────────────────────────┐
   │ Grafana                                           │
   │   Dashboards: API / AI / Queues / Infra           │
   │   Alert rules → Alertmanager → PagerDuty / Slack  │
   └──────────────────────────────────────────────────┘
```

---

## 3. Implementation steps (follow-up phase)

### 3.1 Dependencies

```bash
bun add \
  @opentelemetry/sdk-node \
  @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-trace-otlp-http \
  @opentelemetry/exporter-metrics-otlp-http \
  @opentelemetry/sdk-metrics \
  @opentelemetry/instrumentation-pg \
  @opentelemetry/instrumentation-ioredis \
  prom-client
```

All of these are already listed in `serverExternalPackages` in `next.config.ts`
so they won't be bundled — they load from `node_modules` at runtime.

### 3.2 Wire OTel in `src/instrumentation.ts`

The Next.js `register()` hook runs ONCE per Node process, before any route
handler. That's the correct place to start the OTel SDK + create the
Prometheus metrics registry + register the `/metrics` route handler.

```ts
// src/instrumentation.ts (sketch)
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { NodeSDK } = await import("@opentelemetry/sdk-node");
  const { OTLPTraceExporter } = await import("@opentelemetry/exporter-trace-otlp-http");
  const { getNodeAutoInstrumentations } = await import("@opentelemetry/auto-instrumentations-node");
  const { Resource } = await import("@opentelemetry/resources");
  const { SemanticResourceAttributes } = await import("@opentelemetry/semantic-conventions");

  const sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: "garfix-erp",
      [SemanticResourceAttributes.SERVICE_VERSION]: process.env.APP_VERSION || "12",
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV,
    }),
    traceExporter: new OTLPTraceExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT + "/v1/traces",
    }),
    instrumentations: [getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-fs": { enabled: false },
    })],
  });
  sdk.start();
  process.on("SIGTERM", () => sdk.shutdown());
}
```

### 3.3 `/metrics` route

Create `src/app/api/metrics/route.ts` that:

1. Reads the default `prom-client` registry.
2. Returns `register.metrics()` as `text/plain; version=0.0.4` (Prometheus
   exposition format).
3. Is scraped by Prometheus every 15s.

Auth: the endpoint must be reachable from the scraper but NOT public. Two
options:
- Network-level: only the Prometheus host can reach it (Security Group).
- Token-based: `Authorization: Bearer ${METRICS_SCRAPE_TOKEN}`.

### 3.4 Custom metrics

Bridge the existing `src/lib/telemetry/tracing.ts` counters into prom-client:

| Existing counter | prom-client metric |
|------------------|---------------------|
| `aiMetrics.totalRequests` | `ai_requests_total{provider,model}` |
| `aiMetrics.totalTokens` | `ai_tokens_total{provider,model,type}` |
| `aiMetrics.errorRate` | derived from `ai_requests_total{status="error"}` |
| `circuitBreaker.state` | `circuit_breaker_state{key,state}` gauge |
| `queue.depth` | `queue_depth{queue,state}` gauge |

### 3.5 Grafana dashboards

Ship dashboards as JSON in `docs/grafana/`:

- `api-overview.json` — RPS, p50/p95/p99 latency, error rate, status codes.
- `ai-fabric.json` — per-provider success rate, token spend, cascade depth,
  cache hit rate, circuit-breaker state.
- `queues.json` — depth, processing time, dead-letter count, retry rate.
- `infra.json` — DB connection pool, Valkey ops, Node event loop lag, memory.

### 3.6 Alert rules

| Alert | Condition | Severity |
|-------|-----------|----------|
| `HighErrorRate` | `rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.05` | P1 |
| `HighLatencyP95` | `histogram_quantile(0.95, http_request_duration_seconds_bucket) > 2` | P2 |
| `QueueBacklog` | `queue_depth{state="waiting"} > 1000` for 5m | P2 |
| `CircuitBreakerOpen` | `circuit_breaker_state{state="open"} == 1` for 1m | P2 |
| `AIErrorRateHigh` | `rate(ai_requests_total{status="error"}[5m]) / rate(ai_requests_total[5m]) > 0.20` | P2 |
| `DBPoolExhaustion` | `pg_pool_size - pg_pool_idle > 0.9 * pg_pool_size` for 2m | P1 |

---

## 4. Cost / Sizing

For a single-region deployment with ~5 RPS steady / 50 RPS peak:

- **OTel Collector** — 1 container, 256MB RAM. Negligible cost.
- **Prometheus (Mimir)** — 1GB RAM, 30-day retention ≈ $40/mo on Grafana
  Cloud Free tier (sufficient up to ~20k series).
- **Tempo** — included in Grafana Cloud Free.
- **Grafana** — included in Grafana Cloud Free.

Self-hosted alternative: a single `t3.medium` EC2 running Grafana OSS +
Prometheus + Tempo + Loki. ~$30/mo.

---

## 5. Migration path (non-breaking)

1. **Phase A** — Add OTel SDK + `/metrics` route behind a feature flag
   (`OBSERVABILITY_ENABLED=1`). Existing behavior unchanged.
2. **Phase B** — Deploy OTel Collector + Prometheus; scrape `/metrics`.
   No dashboards yet — just collect data.
3. **Phase C** — Build dashboards + alert rules. Wire PagerDuty.
4. **Phase D** — Remove the feature flag; observability is always on.

Each phase is independently revertable.

---

## 6. Out of scope (future work)

- Distributed tracing across the BullMQ workers (separate Node process) —
  requires propagating trace context via job metadata.
- Real User Monitoring (RUM) on the client — use Sentry's browser SDK
  (already integrated for errors) or Grafana Faro.
- Profiling — Pyroscope / Grafana Phlare.
- Log-based metrics (Loki ruler) — deferred until Loki is deployed.

---

## 7. References

- OTel Node SDK: https://opentelemetry.io/docs/languages/js/getting-started/nodejs/
- Next.js instrumentation hook: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
- prom-client: https://github.com/siimon/prom-client
- Grafana Cloud free tier: https://grafana.com/products/cloud/
