# ADR-001: Multi-tier Queue Architecture

## Status: Accepted

## Context
The system needs reliable background job processing. Originally used an in-memory queue that loses all jobs on server restart — not production-safe.

## Decision
Implement 3-tier fallback queue:
1. BullMQ (Valkey) — production-grade, distributed locking
2. pg-boss (PostgreSQL) — production-safe without extra infrastructure
3. In-process (SQLite) — dev/sandbox only

## Consequences
- Jobs survive crashes in both production tiers
- Zero additional infrastructure needed for pg-boss (uses same DATABASE_URL)
- Existing workers need ZERO changes (backward-compatible API)
- Slightly higher latency on pg-boss tier vs BullMQ
