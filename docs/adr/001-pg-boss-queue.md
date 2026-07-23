# ADR 001: Use pg-boss as Production Queue Fallback

- **Status**: Accepted
- **Date**: 2025-01-15
- **Deciders**: Engineering Team

## Context

GARFIX EOS needs a job queue system for background tasks such as invoice processing, email delivery, WhatsApp notifications, backup scheduling, and AI product matching. The primary production queue is BullMQ backed by Valkey (ADR 008). However, we need a fallback mechanism for environments where Valkey is unavailable or during initial deployment when infrastructure is minimal.

## Decision

We will use **pg-boss** as the production queue fallback. pg-boss uses PostgreSQL as its backing store, which is already required by the application. This means:

1. No additional infrastructure dependency for the fallback path
2. The same PostgreSQL database already used for application data serves as the queue store
3. pg-boss provides reliable job scheduling, retries, and completion tracking
4. Jobs are stored in a dedicated `pgboss` schema, isolated from application tables

The implementation in `src/lib/queues.ts` includes a conditional that attempts BullMQ first and falls back to pg-boss when Valkey is unavailable.

## Consequences

### Positive
- Zero additional infrastructure cost for the fallback path
- Graceful degradation: system continues operating even if Valkey goes down
- Simpler deployment for development and staging environments
- pg-boss has built-in archiving, retries, and throttling

### Negative
- pg-boss has lower throughput than BullMQ (PostgreSQL is slower than Valkey for queue operations)
- Higher database load when running on the fallback path
- pg-boss lacks some BullMQ advanced features (rate limiters, priority queues, delayed jobs with sub-second precision)
- Two queue implementations to maintain and test

### Neutral
- Need to monitor PostgreSQL load carefully when fallback is active
- Queue performance monitoring needs to distinguish between primary and fallback paths

## Alternatives Considered

| Alternative | Pros | Cons | Decision |
|---|---|---|---|
| **BullMQ only (no fallback)** | Single implementation | System stops if Valkey unavailable | Rejected — no graceful degradation |
| **pg-boss as primary** | No Valkey dependency | Low throughput for high-volume invoice processing | Rejected — insufficient performance |
| **RabbitMQ** | Enterprise-grade, high throughput | Additional infrastructure, complex setup | Rejected — overkill for current scale |
| **AWS SQS / GCP Pub/Sub** | Managed, scalable | Cloud vendor dependency, cost | Rejected — not suitable for MENA-hosted deployments |
| **Kafka** | High throughput, event streaming | Heavy infrastructure, overkill | Rejected — too complex for current needs |
