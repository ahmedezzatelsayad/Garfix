import { NextRequest, NextResponse } from 'next/server'
import { resolveAuth, assertCompanyAccess } from '@/lib/auth'
import { getFinancialDashboard } from '@/lib/accounting/financial-dashboard'
import { getARSummary, getAPSummary } from '@/lib/accounting/ar-ap'
import { getTradeFinanceDashboard } from '@/lib/accounting/trade-finance'
import { withErrorHandler } from '@/lib/api'

/**
 * GET /api/accounting/dashboard
 * Aggregated dashboard data for the GarfiX accounting module.
 *
 * P3.1 (Cycle 5): wrapped in `withErrorHandler` so a thrown Prisma error
 *   (e.g. "Conversion failed: invalid companySlug") does NOT leak raw
 *   DB internals to the client. Server logs still capture the full message.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const auth = await resolveAuth(request)
  // Defense-in-depth: do NOT fall back to a demo company when auth fails.
  // The previous code served real financial data for `demo-company-1` if
  // resolveAuth ever errored (DB timeout, etc.), leaking tenant data.
  if (!auth || !auth.ok || !auth.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const companySlug = searchParams.get('companySlug') ?? auth.user.companies[0]

  assertCompanyAccess(auth.user, companySlug)

  const financial = await getFinancialDashboard(companySlug)
  const arSummary = await getARSummary(companySlug)
  const apSummary = await getAPSummary(companySlug)
  const tradeFinance = await getTradeFinanceDashboard(companySlug)

  return NextResponse.json({
    financial,
    ar: arSummary,
    ap: apSummary,
    tradeFinance,
  })
})
