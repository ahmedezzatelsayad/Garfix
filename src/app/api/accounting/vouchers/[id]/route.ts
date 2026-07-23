import { NextRequest, NextResponse } from 'next/server'
import { resolveAuth, assertCompanyAccess } from '@/lib/auth'
import { db } from '@/lib/db'
import { num } from '@/lib/money'

type VoucherLineInput = {
  accountId: string
  debit: number
  credit: number
  description?: string
}

/**
 * GET /api/accounting/vouchers/[id]
 * Get a single voucher by ID.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await resolveAuth(request)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId') ?? auth.companyId

    assertCompanyAccess(auth, companyId)

    const voucher = await db.voucher.findFirst({
      where: { id, companyId },
      include: {
        lines: {
          include: {
            account: { select: { id: true, code: true, name: true, type: true } },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    })

    if (!voucher) {
      return NextResponse.json({ error: 'Voucher not found' }, { status: 404 })
    }

    // FIX #7: Only ONE 'ok' property — do NOT duplicate it.
    // The response object below has a single 'ok' field, not two.
    return NextResponse.json({ ok: true, voucher })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    if (message.startsWith('Forbidden:')) {
      return NextResponse.json({ error: message }, { status: 403 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * PUT /api/accounting/vouchers/[id]
 * Update a voucher (edit lines, change status, etc.)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await resolveAuth(request)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const companyId = body.companyId ?? auth.companyId

    assertCompanyAccess(auth, companyId)

    const existing = await db.voucher.findFirst({
      where: { id, companyId },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Voucher not found' }, { status: 404 })
    }

    if (existing.status === 'posted') {
      return NextResponse.json({ error: 'Cannot update a posted voucher' }, { status: 400 })
    }

    const { description, reference, status, lines } = body as {
      description?: string
      reference?: string
      status?: string
      lines?: VoucherLineInput[]
    }

    // If lines are provided, validate debit/credit totals balance
    if (lines && Array.isArray(lines)) {
      const totalDebit = num(lines.reduce((sum, l) => sum + num(l.debit), 0))
      const totalCredit = num(lines.reduce((sum, l) => sum + num(l.credit), 0))

      if (totalDebit !== totalCredit) {
        return NextResponse.json(
          { error: `Debit total (${totalDebit}) must equal credit total (${totalCredit})` },
          { status: 400 }
        )
      }
    }

    // Update voucher and replace lines in a transaction
    const updated = await db.$transaction(async (tx) => {
      // Delete old lines if new ones are provided
      if (lines && Array.isArray(lines)) {
        await tx.voucherLine.deleteMany({ where: { voucherId: id } })

        // Create new lines
        await tx.voucherLine.createMany({
          data: lines.map((line: VoucherLineInput, index: number) => ({
            accountId: line.accountId,
            debit: num(line.debit),
            credit: num(line.credit),
            description: line.description,
            sortOrder: index,
            voucherId: id,
          })),
        })
      }

      // Update voucher metadata
      return tx.voucher.update({
        where: { id },
        data: {
          ...(description !== undefined ? { description } : {}),
          ...(reference !== undefined ? { reference } : {}),
          ...(status ? { status } : {}),
        },
        include: {
          lines: {
            include: {
              account: { select: { id: true, code: true, name: true, type: true } },
            },
            orderBy: { sortOrder: 'asc' },
          },
        },
      })
    })

    // FIX #7 (continued): Single 'ok' property, not duplicated
    return NextResponse.json({ ok: true, voucher: updated })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * DELETE /api/accounting/vouchers/[id]
 * Delete a draft voucher.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await resolveAuth(request)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId') ?? auth.companyId

    assertCompanyAccess(auth, companyId)

    const existing = await db.voucher.findFirst({
      where: { id, companyId },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Voucher not found' }, { status: 404 })
    }

    if (existing.status === 'posted') {
      return NextResponse.json({ error: 'Cannot delete a posted voucher; cancel it instead' }, { status: 400 })
    }

    // Delete lines first (they have cascade, but explicit is safer)
    await db.voucherLine.deleteMany({ where: { voucherId: id } })
    await db.voucher.delete({ where: { id } })

    return NextResponse.json({ ok: true, deleted: id })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
