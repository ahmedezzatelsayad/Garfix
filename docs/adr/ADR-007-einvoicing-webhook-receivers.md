# ADR-008: E-Invoicing Inbound Webhook Receivers

- **Status**: Accepted
- **Date**: 2026-08-07
- **Decider**: `ahmedezzatelsayad` (Founder)
- **Supersedes**: None
- **Superseded by**: None
- **Related**: ADR-006 (MENA E-Invoicing Compliance), ADR-005 (Webhook System — outgoing)

## Context

GarfiX supports e-invoicing compliance for 7 MENA countries (SA / EG / AE / KW / BH / OM / QA). Each country's tax authority (or its contracted Peppol Access Point) needs a way to push **status callbacks** back to GarfiX when an invoice clearance request is processed — accepted, rejected, cancelled, or delivered.

The previous implementation only handled **outbound** webhooks (GarfiX → external systems). There was no inbound path: when ZATCA cleared an invoice, GarfiX had no way to know except by polling the authority's API — slow, rate-limited, and costly.

The challenge: 7 different authorities, each with its own:

1. **Status vocabulary** — ZATCA uses `CLEARED`/`REJECTED`/`CANCELLED`; ETA uses `Valid`/`Invalid`/`Submitted`; Peppol uses `delivered`/`rejected`/`failed`; etc.
2. **Signature scheme** — most use HMAC-SHA256, but the **header name** differs (`X-ZATCA-Signature`, `X-Signature`, `X-AP-Signature`, `X-MoF-Signature`, `X-NBR-Signature`, `X-TA-Signature`) and the **encoding** differs (ZATCA uses base64, all others use hex).
3. **Payload shape** — UUID field name varies (`invoiceUuid`, `documentUuid`, `peppolMessageId`, `clearanceId`, `submissionId`).
4. **Secret source** — each receiver must look up the secret from a different field of the encrypted integration credentials (`csid_secret`, `api_token`, `ap_client_secret`, `client_secret`, `api_key`).

## Decision

We will build **7 public webhook receiver endpoints**, one per country, all following the same 7-step processing pipeline. The endpoints are **public** (no auth — they're called by external government servers, not by GarfiX users) but **signature-verified** where the authority supports it.

### Architecture

```
Tax Authority ──HTTP POST──▶ /api/e-invoicing/webhooks/{country}
                                      │
                                      ▼
                            ┌─────────────────────┐
                            │  1. readRawBody()   │  ← exact bytes (for HMAC)
                            └─────────────────────┘
                                      │
                                      ▼
                            ┌─────────────────────┐
                            │  2. safeJsonParse() │  ← 400 on invalid JSON
                            └─────────────────────┘
                                      │
                                      ▼
                            ┌─────────────────────┐
                            │  3. verifyHmacSig() │  ← timing-safe; null if header absent
                            └─────────────────────┘
                                      │
                                      ▼
                            ┌─────────────────────┐
                            │  4. map status enum │  ← country-specific → internal (accepted/rejected/pending/cancelled)
                            └─────────────────────┘
                                      │
                                      ▼
                            ┌─────────────────────┐
                            │  5. recordReceipt() │  ← idempotent on (externalUuid, authority, eventType)
                            └─────────────────────┘
                                      │
                                      ▼
                            ┌─────────────────────┐
                            │  6. update EInvoice │  ← submissionStatus, clearedAt, rejectionReason, uuid
                            └─────────────────────┘
                                      │
                                      ▼
                            ┌─────────────────────┐
                            │  7. write AuditLog  │  ← action: e_invoice_webhook_received
                            └─────────────────────┘
                                      │
                                      ▼
                              { ok: true, received: true }
```

### Per-Country Routing

| Country | Endpoint | Signature Header | Encoding | Secret Source |
|---------|----------|------------------|----------|---------------|
| 🇸🇦 SA | `/api/e-invoicing/webhooks/zatca` | `X-ZATCA-Signature` | base64 | `csid_secret` |
| 🇪🇬 EG | `/api/e-invoicing/webhooks/eta` | `X-Signature` | hex | `api_token` |
| 🇦🇪 AE | `/api/e-invoicing/webhooks/uae` | `X-AP-Signature` | hex | `ap_client_secret` |
| 🇰🇼 KW | `/api/e-invoicing/webhooks/kw` | `X-MoF-Signature` | hex | `client_secret` |
| 🇧🇭 BH | `/api/e-invoicing/webhooks/bh` | `X-NBR-Signature` | hex | `api_key` |
| 🇴🇲 OM | `/api/e-invoicing/webhooks/om` | `X-TA-Signature` | hex | `client_secret` |
| 🇶🇦 QA | `/api/e-invoicing/webhooks/qa` | `X-AP-Signature` | hex | `ap_client_secret` |

### Data Model

A new `EInvoiceReceipt` table records every inbound webhook call:

```prisma
model EInvoiceReceipt {
  id              String   @id @default(cuid())
  companySlug     String
  invoiceId       Int?     // nullable: some webhooks arrive before invoice row exists
  authority       String   // zatca, eta_egypt, uae_fta, kuwait_decree_10_2026, bahrain_nbr, oman_tax, qatar_gta
  eventType       String   // clearance_requested, cleared, rejected, cancelled, delivery_report
  externalUuid    String?  // UUID issued by the authority
  status          String   // accepted, rejected, pending, cancelled
  rawPayload      String   // full JSON body as received (for audit / debugging)
  signatureValid  Boolean? // whether HMAC verified (null if no signature header)
  rejectionReason String?
  receivedAt      DateTime @default(now())

  invoice         Invoice? @relation(fields: [invoiceId], references: [id])

  @@index([companySlug])
  @@index([companySlug, authority])
  @@index([companySlug, receivedAt])
  @@index([externalUuid])
}
```

### Idempotency

`recordReceipt()` checks `(externalUuid, authority, eventType)` for an existing row before inserting. If found, the duplicate call returns the existing receipt's id and no new row is created. This is safe because:

1. Tax authorities **do retry** webhooks on transient HTTP failures.
2. The same UUID + eventType uniquely identifies a single authority-side event.
3. Even if the same event is delivered 10 times, only 1 receipt row exists.

### Signature Verification Strategy

- **Header present + valid HMAC** → `signatureValid = true`, receipt recorded, EInvoice updated.
- **Header present + invalid HMAC** → `signatureValid = false`, receipt **still recorded** (for audit/forensics), EInvoice **not updated** (don't trust unsigned status changes).
- **Header absent** → `signatureValid = null`, receipt recorded (some sandboxes don't sign), EInvoice updated (sandbox leniency — should be tightened for production ZATCA/ETA).

The `signatureValid` field is queryable so the founder dashboard can surface "X receipts had invalid signatures" as a security alert.

### Why Public Endpoints (No Auth)?

Tax authority servers cannot authenticate against GarfiX — they don't have user accounts. The standard pattern for inbound webhooks is:

1. **Public endpoint** (no JWT/session required).
2. **HMAC signature verification** using a shared secret configured by the taxpayer in the authority's portal.
3. **Idempotency** so retries don't cause double-processing.
4. **Audit log** every receipt for non-repudiation.

This matches the pattern used by Stripe, GitHub, SendGrid, Twilio, and every other webhook-sending service.

### Why 7 Endpoints Instead of 1?

A single `/api/e-invoicing/webhooks/[country]` route would work, but separate endpoints have advantages:

1. **Clear URLs** for the taxpayer to register in each authority's portal — no path-parameter confusion.
2. **Independent rate-limiting** per country (a ZATCA outage shouldn't throttle ETA processing).
3. **Country-specific code paths** stay isolated — a bug in the Kuwait status mapping can't affect Egypt.
4. **Easier to monitor** — `wc -l` on access logs grouped by URL gives instant throughput per authority.

### Reuse of `IntegrationProvider` Infrastructure

The secret lookup uses the existing `getIntegrationConfig(type)` helper from `src/lib/integrations/registry.ts`. This is the same encrypted credential store used by Stripe, SendGrid, etc. — no new crypto code, no new key management.

## Consequences

### Positive

- ✅ **Real-time status updates** — invoices flip from "submitted" to "cleared" within seconds of the authority's decision (no polling).
- ✅ **Audit trail** — every authority-side event is recorded with raw payload, signature validity, and timestamp.
- ✅ **Founder visibility** — the `/founder-panel/e-invoicing` dashboard shows live webhook traffic across all tenants.
- ✅ **Per-company timeline** — admins can drill into one company and see every e-invoice event chronologically.
- ✅ **Idempotent** — retries don't cause double-processing; safe to replay.
- ✅ **Country-agnostic core** — the `recordReceipt()` helper is shared; only the per-endpoint status mapping differs.

### Negative

- ⚠️ **7 public endpoints to monitor** — added to the SSRF/rate-limit surface area. Mitigated by `withRateLimit` middleware on the test endpoint and by HMAC verification on the production endpoints.
- ⚠️ **Sandbox leniency** — when the signature header is absent, we accept the payload anyway (some sandboxes don't sign). This must be tightened for production ZATCA/ETA deployments by setting a `REJECT_UNSIGNED_WEBHOOKS` env flag (TODO).
- ⚠️ **No replay protection** — if an attacker captures a valid signed payload, they can replay it indefinitely. Mitigated by idempotency (replays don't create new rows) but the `receivedAt` timestamp will appear to update. A future enhancement could add a `timestamp` field with a ±5 minute skew check.
- ⚠️ **DB write on every webhook** — high-volume authorities (ZATCA at scale) could create millions of receipt rows per month. Mitigated by the `retention.ts` policy (already exists) and the `(companySlug, receivedAt)` index for efficient pagination/cleanup.

### Security Considerations

1. **HMAC verification uses `timingSafeEqual`** — no timing side-channel.
2. **Raw body read before any parsing** — HMAC is computed over the exact bytes received, not a re-serialized JSON.
3. **Secrets never logged** — only the boolean `signatureValid` is recorded.
4. **`rawPayload` stored in full** — allows post-incident forensics but contains invoice metadata (not secrets). Acceptable because the authority already has this data.
5. **Audit log is append-only** — even if a receipt is deleted (retention cleanup), the audit log entry survives.

## Alternatives Considered

### Alternative A: Polling the Authority API

Instead of receiving webhooks, GarfiX would poll each authority's "get invoice status" endpoint every N minutes.

- ❌ **Slow** — minutes of latency vs. seconds for webhooks.
- ❌ **Rate-limited** — ZATCA caps at 100 requests/minute; ETA at 60/minute. Polling 10,000 invoices takes 100+ minutes.
- ❌ **Costly** — each poll burns API quota even when nothing changed.
- ❌ **No real-time UX** — the founder dashboard can't show "just cleared" badges.
- ✅ **Simpler** — no public endpoints, no signature verification.

**Rejected** — the latency and cost tradeoff is unacceptable for production.

### Alternative B: Single Combined Webhook Endpoint

`/api/e-invoicing/webhooks?country=SA` — one route, country passed as query param.

- ✅ **Less code** — one route file instead of seven.
- ❌ **Confusing URLs** — taxpayers registering webhooks in authority portals might miss the query param.
- ❌ **Single rate-limit bucket** — one slow country blocks all others.
- ❌ **Harder to monitor** — per-country throughput requires parsing query strings.

**Rejected** — the operational clarity of 7 separate endpoints outweighs the code duplication.

### Alternative C: Message Queue Decoupling

Webhook endpoint enqueues the raw payload to BullMQ/Valkey; a worker processes it asynchronously.

- ✅ **Fast endpoint response** — return 200 immediately, process later.
- ✅ **Retry on DB failure** — worker can retry with backoff.
- ❌ **Complexity** — needs a queue, a worker, dead-letter handling.
- ❌ **Harder to debug** — receipt isn't visible in DB until the worker picks it up.
- ❌ **Overkill at current scale** — webhook volume is low (10s per day per tenant); sync processing is fine.

**Rejected for now** — will revisit if ZATCA Phase 3 drives volume past 100/second.

## Implementation References

- **Webhook helper**: `src/lib/e-invoicing/webhooks.ts` — `verifyHmacSignature()`, `recordReceipt()`, `readRawBody()`, `safeJsonParse()`
- **7 receivers**: `src/app/api/e-invoicing/webhooks/{zatca,eta,uae,kw,bh,om,qa}/route.ts`
- **Prisma model**: `prisma/schema.prisma` → `EInvoiceReceipt`
- **Migration**: `prisma/migrations/20260806120000_add_e_invoice_receipts/migration.sql`
- **Founder dashboard**: `src/app/founder-panel/e-invoicing/page.tsx` + `/api/founder-panel/e-invoicing/route.ts`
- **Per-company timeline**: `src/app/founder-panel/e-invoicing/[slug]/page.tsx` + `/api/founder-panel/e-invoicing/[slug]/route.ts`
- **Webhook URL helper (UI)**: `WebhookUrlHelper` component in `src/modules/settings/EInvoicingSettings.tsx`
- **Sandbox test runner**: `scripts/test-einvoice-webhooks.ts` — 28/28 tests passing
- **Sample payloads**: `download/e-invoicing-webhook-payloads/{SA,EG,AE,KW,BH,OM,QA}-sample.json`

## Verification

- **Sandbox test runner**: 28/28 cases pass (4 cases × 7 countries). Covers valid signed, unsigned, invalid signed, and duplicate (idempotency) scenarios.
- **Type check**: `tsc --noEmit` — 0 errors.
- **Lint**: `eslint .` — 0 errors, 0 warnings.
- **Build**: `next build` — green, 194 routes including 7 new webhook routes + 2 founder-panel routes.
- **Test regressions**: 0 (291 unique failing tests before = 291 after — pre-existing, unrelated).
