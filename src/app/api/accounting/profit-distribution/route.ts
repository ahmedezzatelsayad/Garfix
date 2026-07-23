import { NextRequest, NextResponse } from 'next/server'
import { resolveAuth, assertCompanyAccess } from '@/lib/auth'
import { db } from '@/lib/db'
// FIX #6: Import `num` from @/lib/money — it was previously missing
import { num, round, sum } from '@/lib/money'

type DistributionEntry = {
  shareholder: string
  shareRatio: number
  amount: number
}

/**
 * GET /api/accounting/profit-distribution
 * List profit distributions for a company.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await resolveAuth(request)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId') ?? auth.companyId
    const status = searchParams.get('status')

    assertCompanyAccess(auth, companyId)

    const where: Record<string, unknown> = { companyId }
    if (status) where.status = status

    const distributions = await db.profitDistribution.findMany({
      where: where as Parameters<typeof db.profitDistribution.findMany>[0]['where'],
      include: { entries: true },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ distributions })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    if (message.startsWith('Forbidden:')) {
      return NextResponse.json({ error: message }, { status: 403 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * POST /api/accounting/profit-distribution
 * Create a profit distribution plan.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await resolveAuth(request)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const companyId = body.companyId ?? auth.companyId
    const {
      periodId,
      totalProfit,
      retained,
      distributed,
      distributionType,
      notes,
      entries,
    } = body as {
      periodId?: string
      totalProfit: number
      retained?: number
      distributed?: number
      distributionType?: string
      notes?: string
      entries: DistributionEntry[]
    }

    assertCompanyAccess(auth, companyId)

    if (!totalProfit || !entries || !Array.isArray(entries)) {
      return NextResponse.json({ error: 'totalProfit and entries are required' }, { status: 400 })
    }

    // Calculate distributed amount from entries if not provided
    const totalDistributed = distributed ?? round(sum(entries.map(e => num(e.amount))))
    const totalRetained = retained ?? round(num(totalProfit) - totalDistributed)

    const distribution = await db.profitDistribution.create({
      data: {
        periodId,
        totalProfit: num(totalProfit),
        retained: num(totalRetained),
        distributed: num(totalDistributed),
        distributionType: distributionType ?? 'proportional',
        status: 'draft',
        notes,
        companyId,
        entries: {
          create: entries.map((entry: DistributionEntry) => ({
            shareholder: entry.shareholder,
            shareRatio: num(entry.shareRatio),
            amount: num(entry.amount),
          })),
        },
      },
      include: { entries: true },
    })

    return NextResponse.json({ distribution }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * PATCH /api/accounting/profit-distribution
 * Update a profit distribution (e.g., approve it).
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await resolveAuth(request)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const companyId = body.companyId ?? auth.companyId
    const { id, status, notes } = body

    assertCompanyAccess(auth, companyId)

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const existing = await db.profitDistribution.findFirst({
      where: { id, companyId },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Profit distribution not found' }, { status: 404 })
    }

    const updated = await db.profitDistribution.update({
      where: { id },
      data: {
        ...(status ? { status } : {}),
        ...(notes ? { notes } : {}),
      },
      include: { entries: true },
    })

    return NextResponse.json({ distribution: updated })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
