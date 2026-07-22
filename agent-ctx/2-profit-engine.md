# Task 2: Profit Engine (Phase 8 Task 1)
**File:** `/src/lib/ai-fabric/profit-engine.ts`
**Status:** ✅ Complete

## What was built
- `saveProfitSnapshot(companySlug, periodStart, periodEnd)`: Computes and stores daily profit:
  - Revenue: from `db.company.plan` mapped to USD (trial=0, starter=29, business=99, enterprise=299 monthly → daily rate)
  - AI cost: REAL from `db.aIRequestLog.aggregate SUM(costUsd)` for the period
  - Infra cost: estimated $5/day per company (sandbox, no metering)
  - Worker cost: estimated from `CompanyRuntime.workerPoolSize × $0.50/day`
  - Profit: revenue - infra - aiCost - workers
- `getProfitHistory(companySlug, periods)`: Retrieves N most recent snapshots for charting
- `getPlatformProfit(periodStart, periodEnd)`: Aggregates across ALL companies

## Data sources
- AI cost is the ONLY real-metered value (from AIRequestLog)
- Revenue/infra/workers are estimated (documented in code)

## Tests
- 7 tests in `describe("Profit Engine — Phase 8")`:
  - Save snapshot with real AI cost ✅
  - Retrieve profit history ✅
  - Limit history to N periods ✅
  - Empty history for nonexistent company ✅
  - Aggregate platform profit across companies ✅
  - Zeros when no snapshots ✅
  - Trial plan $0 revenue ✅