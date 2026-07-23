import { NextRequest, NextResponse } from 'next/server'
// FIX #1 & #2: Import resolveAuth and assertCompanyAccess from @/lib/auth, NOT @/lib/middleware
import { resolveAuth, assertCompanyAccess } from '@/lib/auth'
import { db } from '@/lib/db'
import { num, sum, round } from '@/lib/money'

/**
 * GET /api/accounting/client-statement
 * Generates an accounts receivable statement for a specific client.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await resolveAuth(request)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId') ?? auth.companyId
    const clientId = searchParams.get('clientId')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    assertCompanyAccess(auth, companyId)

    if (!clientId) {
      return NextResponse.json({ error: 'clientId is required' }, { status: 400 })
    }

    // Verify client belongs to company
    const client = await db.client.findFirst({
      where: { id: clientId, companyId },
    })

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Build date filter
    const dateFilter: { date?: { gte?: Date; lte?: Date } } = {}
    if (startDate) dateFilter.date = { ...dateFilter.date, gte: new Date(startDate) }
    if (endDate) dateFilter.date = { ...dateFilter.date, lte: new Date(endDate) }

    // Fetch payment vouchers for this client
    const vouchers = await db.paymentVoucher.findMany({
      where: {
        clientId,
        companyId,
        status: 'posted',
        ...dateFilter,
      },
      orderBy: { date: 'asc' },
    })

    // Calculate totals
    const totalReceived = sum(vouchers.filter(v => v.direction === 'inbound').map(v => v.amount))
    const totalPaidOut = sum(vouchers.filter(v => v.direction === 'outbound').map(v => v.amount))
    const balance = round(subtract(totalPaidOut, totalReceived))

    const statement = {
      client: { id: client.id, name: client.name, code: client.code },
      period: { startDate, endDate },
      vouchers: vouchers.map(v => ({
        id: v.id,
        number: v.number,
        date: v.date,
        amount: v.amount,
        direction: v.direction,
        description: v.description,
        status: v.status,
      })),
      summary: {
        totalReceived: round(totalReceived),
        totalPaidOut: round(totalPaidOut),
        balance,
      },
    }

    return NextResponse.json(statement)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    if (message.startsWith('Forbidden:')) {
      return NextResponse.json({ error: message }, { status: 403 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
