# ADR-005: Tenant-scoped Webhook Delivery System

## Status: Accepted

## Context
No outgoing webhook system existed. External integrations need real-time event notifications (invoice.created, payment.received).

## Decision
Implement tenant-scoped webhook system with:
- HMAC-SHA256 signing for payload integrity
- Exponential backoff retry (5s → 25s → 125s)
- Delivery status tracking (pending, success, failed)
- Dead-letter queue for permanently failed deliveries
- SSRF protection (validate URLs at registration AND fetch time)
- Event filtering (tenants subscribe to specific events)

## Consequences
- Tenants receive real-time event notifications
- Secure: SSRF protection prevents internal network access
- Reliable: retry logic handles temporary failures
- Observable: delivery tracking and stats per tenant
