import { NextRequest, NextResponse } from 'next/server'
import { resolveAuth, assertCompanyAccess } from '@/lib/auth'
import { db } from '@/lib/db'
import { num, round } from '@/lib/money'

/**
 * GET /api/accounting/letters-of-credit
 * List all letters of credit for a company.
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
    const type = searchParams.get('type')

    assertCompanyAccess(auth, companyId)

    const where: Record<string, unknown> = { companyId }
    if (status) where.status = status
    if (type) where.type = type

    // FIX #3: Properly type the findMany result instead of relying on 'unknown'
    const lettersOfCredit = await db.letterOfCredit.findMany({
      where: where as Parameters<typeof db.letterOfCredit.findMany>[0]['where'],
      include: {
        supplier: { select: { id: true, name: true, code: true } },
        lcDocuments: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ lettersOfCredit })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    if (message.startsWith('Forbidden:')) {
      return NextResponse.json({ error: message }, { status: 403 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * POST /api/accounting/letters-of-credit
 * Create a new letter of credit.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await resolveAuth(request)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const companyId = body.companyId ?? auth.companyId

    assertCompanyAccess(auth, companyId)

    const {
      number,
      type,
      amount,
      currency,
      beneficiary,
      issuingBank,
      issueDate,
      expiryDate,
      description,
      reference,
      supplierId,
    } = body

    if (!number || !amount) {
      return NextResponse.json({ error: 'number and amount are required' }, { status: 400 })
    }

    // Validate supplier if provided
    if (supplierId) {
      const supplier = await db.supplier.findFirst({
        where: { id: supplierId, companyId },
      })
      if (!supplier) {
        return NextResponse.json({ error: 'Supplier not found' }, { status: 404 })
      }
    }

    const lc = await db.letterOfCredit.create({
      data: {
        number,
        type: type ?? 'import',
        amount: num(amount),
        currency: currency ?? 'USD',
        status: 'draft',
        beneficiary,
        issuingBank,
        issueDate: issueDate ? new Date(issueDate) : undefined,
        expiryDate: expiryDate ? new Date(expiryDate) : undefined,
        description,
        reference,
        supplierId,
        companyId,
      },
      include: {
        supplier: { select: { id: true, name: true, code: true } },
      },
    })

    return NextResponse.json({ letterOfCredit: lc }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * PATCH /api/accounting/letters-of-credit
 * Update a letter of credit (e.g., change status).
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await resolveAuth(request)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const companyId = body.companyId ?? auth.companyId
    const { id, status, amount, beneficiary, issuingBank, expiryDate, description } = body

    assertCompanyAccess(auth, companyId)

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    // Verify the LC belongs to the company
    const existing = await db.letterOfCredit.findFirst({
      where: { id, companyId },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Letter of credit not found' }, { status: 404 })
    }

    const updateData: Record<string, unknown> = {}
    if (status) updateData.status = status
    if (amount !== undefined) updateData.amount = num(amount)
    if (beneficiary) updateData.beneficiary = beneficiary
    if (issuingBank) updateData.issuingBank = issuingBank
    if (expiryDate) updateData.expiryDate = new Date(expiryDate)
    if (description) updateData.description = description

    // FIX #3 (continued): Use proper type assertion for update operations too
    const updated = await db.letterOfCredit.update({
      where: { id },
      data: updateData as Parameters<typeof db.letterOfCredit.update>[0]['data'],
    })

    return NextResponse.json({ letterOfCredit: updated })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * DELETE /api/accounting/letters-of-credit
 * Cancel (soft-delete by status change) a letter of credit.
 */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await resolveAuth(request)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId') ?? auth.companyId
    const id = searchParams.get('id')

    assertCompanyAccess(auth, companyId)

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const existing = await db.letterOfCredit.findFirst({
      where: { id, companyId },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Letter of credit not found' }, { status: 404 })
    }

    // Mark as cancelled instead of deleting
    const cancelled = await db.letterOfCredit.update({
      where: { id },
      data: { status: 'cancelled' },
    })

    return NextResponse.json({ letterOfCredit: cancelled })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
