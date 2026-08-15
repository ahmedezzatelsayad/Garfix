# ADR-002: Financial Fields Decimal Migration

## Status: Accepted

## Context
All financial fields in Prisma schema used Float type. This causes floating-point errors (0.1 + 0.2 = 0.30000000000000004). For an ERP handling invoices, payments, and tax calculations, this is unacceptable.

## Decision
Migrate all financial amount fields from Float to Decimal in Prisma schema. Add money.ts utility helpers using Prisma.Decimal for safe arithmetic.

## Consequences
- Exact precision for all financial calculations
- Prisma handles Decimal differently for SQLite (Float fallback) vs PostgreSQL (true Decimal)
- Code using money.ts helpers is protected from floating-point errors
- Display layer uses roundMoney() to format to 2 decimal places
