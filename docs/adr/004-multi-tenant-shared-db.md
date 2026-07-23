# ADR 004: Multi-tenant Shared Database with companySlug Isolation

- **Status**: Accepted
- **Date**: 2025-01-15
- **Deciders**: Engineering Team, Architecture Owner

## Context

GARFIX EOS is a multi-tenant SaaS platform where each tenant (company) operates with isolated data. The system must support:

1. **Multiple companies per user**: A single user can manage multiple companies from one account
2. **Company-specific configuration**: Each company has its own currency, tax rules, country, and invoice templates
3. **Cross-company reporting**: Some enterprise users need consolidated reports across all their companies
4. **Platform admin access**: Super admins need to query across all tenants for monitoring and support

## Decision

We use a **shared PostgreSQL database with `companySlug` column-based isolation**. Every tenant-scoped table includes a `companySlug` column that serves as the tenant identifier. Data isolation is enforced at three levels:

1. **Application level**: All queries are automatically scoped by `companySlug` using the `tenantScope()` utility in `src/lib/tenantScope.ts`. This adds a `WHERE companySlug = :slug` clause to every tenant-scoped query.

2. **Middleware level**: The authentication middleware (`src/middleware.ts`) validates that the authenticated user has access to the requested `companySlug` before allowing the request.

3. **Row-level security (future)**: PostgreSQL RLS policies will be added as a hard security boundary once the database is mature enough for policy management.

The schema pattern:
```sql
CREATE TABLE invoices (
  id SERIAL PRIMARY KEY,
  companySlug TEXT NOT NULL,  -- tenant identifier
  -- ... other columns
  FOREIGN KEY (companySlug) REFERENCES companies(slug)
);

-- Every tenant-scoped query includes:
-- WHERE companySlug = 'current-user-company'
```

## Consequences

### Positive
- Single database to manage, backup, and monitor
- Easy cross-tenant analytics for platform admins
- Lower cost — one PostgreSQL instance serves all tenants
- Schema migrations are applied once for all tenants
- Simple to implement — just add a column and scope queries
- Supports multi-company per user natively

### Negative
- Application must enforce isolation correctly — bugs can leak data between tenants
- No physical data isolation — a SQL bug could expose another tenant's data
- Shared database means shared performance — one heavy tenant can affect others
- Scaling requires vertical scaling or read replicas, not horizontal sharding

### Neutral
- Row-level security (RLS) adds hard isolation boundary but requires careful policy management
- Cache isolation is handled in `src/lib/cache.ts` with tenant-scoped keys
- Future: may migrate to separate databases per tenant for enterprise tier

## Alternatives Considered

| Alternative | Pros | Cons | Decision |
|---|---|---|---|
| **Separate database per tenant** | Perfect data isolation | High cost; complex migrations; no cross-tenant analytics | Rejected — overkill for current scale |
| **Schema-per-tenant in shared DB** | Better isolation than column approach | Complex migration management; connection pool exhaustion | Rejected — schema management complexity |
| **No isolation (shared data)** | Simplest implementation | Data leaks; unacceptable for financial data | Rejected — security risk |
| **Row-level security only** | Hard database-level isolation | No cross-tenant admin access; complex policy management | Rejected — needed for future but not primary approach |
| **Hybrid: column + RLS** | Application flexibility + DB safety | Complex to maintain both layers | Accepted — current column approach + future RLS |
