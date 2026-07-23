import { NextRequest, NextResponse } from 'next/server'
import { resolveAuth, assertCompanyAccess } from '@/lib/auth'
import { db } from '@/lib/db'
import { num, sum, round } from '@/lib/money'

type OpeningBalanceLine = {
  accountId: string
  debit: number
  credit: number
}

/**
 * GET /api/accounting/opening-balances
 * List opening balances for a financial period.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await resolveAuth(request)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId') ?? auth.companyId
    const periodId = searchParams.get('periodId')

    assertCompanyAccess(auth, companyId)

    if (!periodId) {
      return NextResponse.json({ error: 'periodId is required' }, { status: 400 })
    }

    const balances = await db.openingBalance.findMany({
      where: { periodId, companyId },
      include: {
        account: { select: { id: true, code: true, name: true, type: true } },
      },
      orderBy: { account: { code: 'asc' } },
    })

    const totalDebit = round(sum(balances.map(b => num(b.debit))))
    const totalCredit = round(sum(balances.map(b => num(b.credit))))

    return NextResponse.json({
      openingBalances: balances,
      totals: { debit: totalDebit, credit: totalCredit },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    if (message.startsWith('Forbidden:')) {
      return NextResponse.json({ error: message }, { status: 403 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * POST /api/accounting/opening-balances
 * Create opening balances for a financial period.
 * Accepts an array of { accountId, debit, credit } lines.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await resolveAuth(request)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const companyId = body.companyId ?? auth.companyId
    const { periodId, lines } = body as {
      periodId: string
      lines: OpeningBalanceLine[]
    }

    assertCompanyAccess(auth, companyId)

    if (!periodId || !lines || !Array.isArray(lines)) {
      return NextResponse.json({ error: 'periodId and lines array are required' }, { status: 400 })
    }

    // Verify the period belongs to the company
    const period = await db.financialPeriod.findFirst({
      where: { id: periodId, companyId },
    })

    if (!period) {
      return NextResponse.json({ error: 'Financial period not found' }, { status: 404 })
    }

    if (period.status !== 'open') {
      return NextResponse.json({ error: 'Cannot add opening balances to a closed/locked period' }, { status: 400 })
    }

    // Validate accounts belong to company
    const accountIds = lines.map(l => l.accountId)
    const accounts = await db.account.findMany({
      where: { id: { in: accountIds }, companyId },
    })

    if (accounts.length !== accountIds.length) {
      return NextResponse.json({ error: 'Some accounts not found or do not belong to this company' }, { status: 400 })
    }

    // FIX #4 & #5: Properly construct Prisma create data — avoid spread issues
    // by explicitly mapping each line to a well-typed object, not spreading unknown types.
    const created = await db.$transaction(
      lines.map((line: OpeningBalanceLine) =>
        db.openingBalance.upsert({
          where: {
            accountId_periodId: {
              accountId: line.accountId,
              periodId,
            },
          },
          update: {
            debit: num(line.debit),
            credit: num(line.credit),
          },
          create: {
            accountId: line.accountId,
            periodId,
            debit: num(line.debit),
            credit: num(line.credit),
            companyId,
          },
        })
      )
    )

    return NextResponse.json({ openingBalances: created }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * PUT /api/accounting/opening-balances
 * Bulk update opening balances for a period.
 */
export async function PUT(request: NextRequest) {
  try {
    const auth = await resolveAuth(request)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const companyId = body.companyId ?? auth.companyId
    const { periodId, lines } = body as {
      periodId: string
      lines: OpeningBalanceLine[]
    }

    assertCompanyAccess(auth, companyId)

    if (!periodId || !lines || !Array.isArray(lines)) {
      return NextResponse.json({ error: 'periodId and lines array are required' }, { status: 400 })
    }

    // FIX #4 (continued): Explicitly typed update objects to avoid spread type mismatches.
    // Instead of spreading `...line` (which may include unknown fields), construct the
    // update payload explicitly with only the known Prisma fields.
    const updated = await db.$transaction(
      lines.map((line: OpeningBalanceLine) =>
        db.openingBalance.update({
          where: {
            accountId_periodId: {
              accountId: line.accountId,
              periodId,
            },
          },
          data: {
            debit: num(line.debit),
            credit: num(line.credit),
          },
        })
      )
    )

    return NextResponse.json({ openingBalances: updated })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * DELETE /api/accounting/opening-balances
 * Delete all opening balances for a period.
 */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await resolveAuth(request)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId') ?? auth.companyId
    const periodId = searchParams.get('periodId')

    assertCompanyAccess(auth, companyId)

    if (!periodId) {
      return NextResponse.json({ error: 'periodId is required' }, { status: 400 })
    }

    const deleted = await db.openingBalance.deleteMany({
      where: { periodId, companyId },
    })

    return NextResponse.json({ deleted: deleted.count })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
