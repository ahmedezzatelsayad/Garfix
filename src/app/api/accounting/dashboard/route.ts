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
    if (!auth) {
      // For demo purposes, use a default company if no auth
      const companyId = 'demo-company-1'
      const financial = await getFinancialDashboard(companyId)
      const arSummary = await getARSummary(companyId)
      const apSummary = await getAPSummary(companyId)
      const tradeFinance = await getTradeFinanceDashboard(companyId)

      return NextResponse.json({
        financial,
        ar: arSummary,
        ap: apSummary,
        tradeFinance,
      })
    }

    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId') ?? auth.companyId

    assertCompanyAccess(auth, companyId)

    const financial = await getFinancialDashboard(companyId)
    const arSummary = await getARSummary(companyId)
    const apSummary = await getAPSummary(companyId)
    const tradeFinance = await getTradeFinanceDashboard(companyId)

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
