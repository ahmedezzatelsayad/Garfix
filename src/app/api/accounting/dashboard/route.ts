import { NextRequest, NextResponse } from 'next/server'
import { resolveAuth, assertCompanyAccess } from '@/lib/auth'
import { getFinancialDashboard } from '@/lib/accounting/financial-dashboard'
import { getARSummary, getAPSummary } from '@/lib/accounting/ar-ap'
import { getTradeFinanceDashboard } from '@/lib/accounting/trade-finance'

/**
 * GET /api/accounting/dashboard
 * Aggregated dashboard data for the GarfiX accounting module.
 */
export async function GET(request: NextRequest) {
  try {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
