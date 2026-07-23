# ADR 002: Migrate Monetary Fields from String to Decimal

- **Status**: Proposed
- **Date**: 2025-01-15
- **Deciders**: Engineering Team, Finance Module Owner

## Context

GARFIX EOS currently stores monetary values (invoice amounts, payment totals, tax values, account balances) as `String` fields in PostgreSQL. This approach has several problems:

1. **Floating-point precision loss**: When string values are parsed as floats for calculations, IEEE 754 floating-point arithmetic introduces rounding errors (e.g., `0.1 + 0.2 !== 0.3`)
2. **Currency-specific formatting**: Different MENA currencies (SAR, KWD, AED, BHD) have different decimal places (KWD and BHD use 3 decimal places)
3. **Comparison and aggregation**: String-based amounts cannot be reliably compared or summed in SQL queries
4. **Arabic amount text**: Converting monetary values to Arabic text (required for some MENA invoices) is error-prone with float rounding
5. **Audit trail integrity**: Slight rounding differences between stored and calculated values can create false audit discrepancies

## Decision

We will migrate all monetary fields from `String` to `Decimal` using PostgreSQL's `NUMERIC(precision, scale)` type and Prisma's `Decimal` type. The migration strategy:

1. **Phase 1**: Add new `Decimal` columns alongside existing `String` columns (dual-write)
2. **Phase 2**: Migrate existing string data to decimal (with proper rounding per currency)
3. **Phase 3**: Drop string columns and rename decimal columns

Precision rules per currency:
- SAR, AED, QAR, OMR, EGP: NUMERIC(15, 2) — 2 decimal places
- KWD, BHD: NUMERIC(15, 3) — 3 decimal places
- USD, EUR: NUMERIC(15, 2) — 2 decimal places

The `src/lib/money.ts` module already provides `DecimalMoney` class with currency-aware rounding. The `src/lib/accounting/arabic-amount-text.ts` module converts Decimal values to Arabic text without float intermediaries.

## Consequences

### Positive
- Exact arithmetic — no floating-point rounding errors
- Reliable SQL aggregation (SUM, AVG) for financial reports
- Currency-aware precision handling
- Correct Arabic amount text generation for invoices
- Proper audit trail — exact values match calculations

### Negative
- Migration is complex — dual-write period adds code complexity
- Prisma Decimal type requires `@prisma/client/runtime/library` import
- Decimal comparison in TypeScript requires `equals()` method, not `===`
- Migration time depends on data volume — could be hours for large tables

### Neutral
- All financial calculation code needs review for Decimal compatibility
- Frontend needs to format Decimal values for display without float conversion

## Alternatives Considered

| Alternative | Pros | Cons | Decision |
|---|---|---|---|
| **Integer (cents/fils)** | Simple arithmetic | KWD/BHD need 3 decimal places (not just cents); display formatting complex | Rejected — doesn't handle 3-decimal currencies cleanly |
| **Float/Double** | Native SQL type | IEEE 754 rounding errors; unacceptable for financial data | Rejected — primary problem we're solving |
| **String with formatting rules** | No migration needed | No SQL aggregation; comparison errors; Arabic text conversion issues | Rejected — current approach with known problems |
| **Separate integer + scale columns** | Exact values | Complex queries; application-level decimal reconstruction | Rejected — adds unnecessary complexity |
