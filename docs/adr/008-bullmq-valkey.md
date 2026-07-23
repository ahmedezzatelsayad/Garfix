# ADR 008: Use BullMQ with Valkey for Production Queues

- **Status**: Accepted
- **Date**: 2025-01-15
- **Deciders**: Engineering Team, Infrastructure Owner

## Context

GARFIX EOS requires a job queue system for background and scheduled tasks:

1. **Invoice processing**: Parsing OCR results, AI extraction, product matching
2. **Email delivery**: Invoice emails, password reset, notification emails
3. **WhatsApp notifications**: Invoice sharing, payment reminders
4. **Backup scheduling**: Database backups, retention cleanup
5. **AI worker tasks**: Invoice brain extraction, bulk import processing
6. **Scheduler tasks**: Cron-based invoice status updates, tax filing reminders

The queue system must handle:
- **Throughput**: Up to 10,000 jobs/hour at peak
- **Reliability**: Jobs must complete or retry; no silent failures
- **Priority**: Email and WhatsApp are high-priority; backups are low-priority
- **Scheduling**: Cron-based recurring jobs (invoices, backups)
- **Monitoring**: Real-time queue status for admin panel

## Decision

We use **BullMQ backed by Valkey** (Redis-compatible in-memory data store) as the primary production queue system.

Architecture:
- **Valkey**: Open-source Redis fork, runs as a single instance (or cluster at scale)
- **BullMQ**: TypeScript job queue library built on Redis protocol
- **Workers**: Dedicated worker processes in `src/lib/workers/` (emailWorker, whatsappWorker, aiProductMatchWorker, backupWorker, schedulerWorker)

The implementation in `src/lib/queues.ts` provides:
1. `getQueue(name)` — returns a BullMQ Queue instance
2. `addJob(name, data, options)` — enqueues a job with retry/priority config
3. Worker registration with graceful shutdown
4. Fallback to pg-boss (ADR 001) if Valkey is unavailable

Queue configuration per job type:
| Job Type | Priority | Retries | Backoff | Concurrency |
|---|---|---|---|---|
| Invoice processing | High | 3 | Exponential (1s → 4s → 16s) | 5 |
| Email delivery | High | 5 | Exponential (5s → 25s → 125s) | 3 |
| WhatsApp | High | 3 | Fixed (10s) | 2 |
| AI extraction | Medium | 3 | Exponential (2s → 8s → 32s) | 3 |
| Backup | Low | 2 | Fixed (60s) | 1 |
| Scheduler cron | Low | 1 | None | 1 |

## Consequences

### Positive
- High throughput: Valkey handles 100K+ ops/sec easily
- Rich job management: priority, retries, backoff, rate limiting, delayed jobs
- TypeScript-native: BullMQ is written in TypeScript with full type safety
- Dashboard: Bull Board UI for monitoring queue status
- Pub/sub: Valkey pub/sub for real-time notifications
- Cache: Valkey doubles as application cache (DRY infrastructure)
- Open-source: Valkey avoids Redis licensing concerns

### Negative
- Additional infrastructure: Valkey instance must be deployed and maintained
- Data loss risk: Valkey is in-memory; need persistence (AOF/RDB) configuration
- Memory usage: Queue backlog can consume significant Valkey memory
- Learning curve: Team must learn BullMQ API and Valkey configuration
- Complexity: Worker processes need separate monitoring and health checks

### Neutral
- Valkey persistence (AOF) recommended for production — prevents job loss on restart
- Should monitor Valkey memory and set maxmemory policy (volatile-lru)
- Connection pooling via ioredis recommended for high-throughput

## Alternatives Considered

| Alternative | Pros | Cons | Decision |
|---|---|---|---|
| **pg-boss (primary)** | No extra infrastructure; see ADR 001 | Low throughput; insufficient for scale | Accepted as fallback (ADR 001) |
| **Redis (proprietary)** | Mature; most BullMQ documentation targets Redis | Redis SSPL license concerns; Valkey is open-source fork | Rejected — Valkey preferred |
| **RabbitMQ** | Enterprise-grade; pub/sub + queue | Heavy; different paradigm; no BullMQ integration | Rejected — BullMQ + Valkey simpler |
| **Kafka** | High throughput; event streaming | Overkill for job queue; complex setup | Rejected — wrong abstraction level |
| **AWS SQS** | Managed; reliable | Cloud dependency; per-request cost; no priority | Rejected — not suitable for MENA hosting |
