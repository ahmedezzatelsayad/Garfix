/**
 * Accounts Receivable / Accounts Payable (AR/AP) Module
 * Part of the GarfiX Accounting System.
 *
 * FIX #8: PaymentVoucher does NOT have a `deletedAt` field.
 *         We must NOT include `deletedAt` in any PaymentVoucher where clause.
 *         Instead, we filter by `status !== 'cancelled'` to exclude cancelled records.
 *
 * FIX #9: Installment creation type mismatch — ensure all Installment
 *         create data matches the Prisma schema exactly.
 */

import { db } from '@/lib/db'
import { num, round, sum, subtract, add } from '@/lib/money'

// ─── Types ───

export interface ARSummary {
  clientId: string
  clientName: string
  clientCode: string
  totalOutstanding: number
  totalOverdue: number
  totalReceived: number
  lastPaymentDate: Date | null
}

export interface APSummary {
  supplierId: string
  supplierName: string
  supplierCode: string
  totalOutstanding: number
  totalOverdue: number
  totalPaid: number
  lastPaymentDate: Date | null
}

export interface PaymentVoucherWithDetails {
  id: string
  number: string
  date: Date
  amount: number
  paymentType: string
  direction: string
  status: string
  description: string | null
  clientId: string | null
  supplierId: string | null
  client?: { id: string; name: string; code: string } | null
  supplier?: { id: string; name: string; code: string } | null
  installments: InstallmentData[]
}

export interface InstallmentData {
  id: string
  amount: number
  dueDate: Date
  status: string
  paidDate: Date | null
  paymentRef: string | null
}

// ─── Accounts Receivable ───

/**
 * Get AR summary for all clients in a company.
 */
export async function getARSummary(companyId: string): Promise<ARSummary[]> {
  const clients = await db.client.findMany({
    where: { companyId, isActive: true },
    select: { id: true, name: true, code: true },
  })

  const summaries: ARSummary[] = []

  for (const client of clients) {
    // FIX #8: No `deletedAt` in where clause — PaymentVoucher model doesn't have that field.
    // Use status filter instead.
    const vouchers = await db.paymentVoucher.findMany({
      where: {
        clientId: client.id,
        companyId,
        direction: 'inbound',
        status: { in: ['posted', 'draft'] },
      },
      select: {
        id: true,
        amount: true,
        date: true,
        status: true,
      },
    })

    const outboundVouchers = await db.paymentVoucher.findMany({
      where: {
        clientId: client.id,
        companyId,
        direction: 'outbound',
        status: { in: ['posted', 'draft'] },
      },
      select: {
        id: true,
        amount: true,
        date: true,
        status: true,
      },
    })

    const totalReceived = round(sum(vouchers.filter(v => v.status === 'posted').map(v => num(v.amount))))
    const totalPaidOut = round(sum(outboundVouchers.filter(v => v.status === 'posted').map(v => num(v.amount))))
    const totalOutstanding = round(subtract(totalPaidOut, totalReceived))

    // Calculate overdue installments
    const overdueInstallments = await db.installment.findMany({
      where: {
        paymentVoucher: {
          clientId: client.id,
          companyId,
          status: 'posted',
          direction: 'outbound',
        },
        status: 'overdue',
      },
      select: { amount: true },
    })

    const totalOverdue = round(sum(overdueInstallments.map(i => num(i.amount))))
    const lastPaymentDate = vouchers.length > 0
      ? vouchers.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].date
      : null

    summaries.push({
      clientId: client.id,
      clientName: client.name,
      clientCode: client.code,
      totalOutstanding,
      totalOverdue,
      totalReceived,
      lastPaymentDate,
    })
  }

  return summaries
}

// ─── Accounts Payable ───

/**
 * Get AP summary for all suppliers in a company.
 */
export async function getAPSummary(companyId: string): Promise<APSummary[]> {
  const suppliers = await db.supplier.findMany({
    where: { companyId, isActive: true },
    select: { id: true, name: true, code: true },
  })

  const summaries: APSummary[] = []

  for (const supplier of suppliers) {
    // FIX #8: No `deletedAt` in where clause — PaymentVoucher model doesn't have that field.
    const outboundVouchers = await db.paymentVoucher.findMany({
      where: {
        supplierId: supplier.id,
        companyId,
        direction: 'outbound',
        status: { in: ['posted', 'draft'] },
      },
      select: {
        id: true,
        amount: true,
        date: true,
        status: true,
      },
    })

    const inboundVouchers = await db.paymentVoucher.findMany({
      where: {
        supplierId: supplier.id,
        companyId,
        direction: 'inbound',
        status: { in: ['posted', 'draft'] },
      },
      select: {
        id: true,
        amount: true,
        date: true,
        status: true,
      },
    })

    const totalPaid = round(sum(outboundVouchers.filter(v => v.status === 'posted').map(v => num(v.amount))))
    const totalRefunded = round(sum(inboundVouchers.filter(v => v.status === 'posted').map(v => num(v.amount))))
    const totalOutstanding = round(subtract(totalPaid, totalRefunded))

    const overdueInstallments = await db.installment.findMany({
      where: {
        paymentVoucher: {
          supplierId: supplier.id,
          companyId,
          status: 'posted',
          direction: 'outbound',
        },
        status: 'overdue',
      },
      select: { amount: true },
    })

    const totalOverdue = round(sum(overdueInstallments.map(i => num(i.amount))))
    const lastPaymentDate = outboundVouchers.length > 0
      ? outboundVouchers.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].date
      : null

    summaries.push({
      supplierId: supplier.id,
      supplierName: supplier.name,
      supplierCode: supplier.code,
      totalOutstanding,
      totalOverdue,
      totalPaid,
      lastPaymentDate,
    })
  }

  return summaries
}

// ─── Payment Voucher Management ───

/**
 * Create a payment voucher with optional installments.
 */
export async function createPaymentVoucher(
  companyId: string,
  data: {
    number: string
    date: Date
    amount: number
    paymentType: string
    direction: string
    description?: string
    reference?: string
    clientId?: string
    supplierId?: string
    installments?: { amount: number; dueDate: Date }[]
  }
): Promise<PaymentVoucherWithDetails> {
  const voucher = await db.paymentVoucher.create({
    data: {
      number: data.number,
      date: data.date,
      amount: num(data.amount),
      paymentType: data.paymentType,
      direction: data.direction,
      status: 'draft',
      description: data.description ?? null,
      reference: data.reference ?? null,
      clientId: data.clientId ?? null,
      supplierId: data.supplierId ?? null,
      companyId,
      // FIX #9: Installment creation must match the Prisma schema exactly.
      // Each installment needs: amount, dueDate, status (default 'pending').
      // Do NOT include fields that don't exist on the Installment model.
      installments: data.installments
        ? {
            create: data.installments.map(inst => ({
              amount: num(inst.amount),
              dueDate: inst.dueDate,
              status: 'pending' as string, // Matches the schema's default value
            })),
          }
        : undefined,
    },
    include: {
      client: { select: { id: true, name: true, code: true } },
      supplier: { select: { id: true, name: true, code: true } },
      installments: true,
    },
  })

  return mapVoucherToDetails(voucher)
}

/**
 * Get a payment voucher with full details.
 */
export async function getPaymentVoucher(
  companyId: string,
  voucherId: string
): Promise<PaymentVoucherWithDetails | null> {
  // FIX #8: No `deletedAt` filter — use status-based filtering only.
  const voucher = await db.paymentVoucher.findFirst({
    where: {
      id: voucherId,
      companyId,
      status: { not: 'cancelled' },
    },
    include: {
      client: { select: { id: true, name: true, code: true } },
      supplier: { select: { id: true, name: true, code: true } },
      installments: { orderBy: { dueDate: 'asc' } },
    },
  })

  if (!voucher) return null

  return mapVoucherToDetails(voucher)
}

/**
 * List all payment vouchers for a company.
 */
export async function listPaymentVouchers(
  companyId: string,
  filters?: {
    clientId?: string
    supplierId?: string
    direction?: string
    status?: string
  }
): Promise<PaymentVoucherWithDetails[]> {
  // FIX #8: No `deletedAt` in the where clause — PaymentVoucher doesn't have this field.
  // Instead of `deletedAt: null`, we exclude cancelled vouchers via status filter.
  const where: Record<string, unknown> = {
    companyId,
    status: { not: 'cancelled' },
  }

  if (filters?.clientId) where.clientId = filters.clientId
  if (filters?.supplierId) where.supplierId = filters.supplierId
  if (filters?.direction) where.direction = filters.direction
  if (filters?.status) where.status = filters.status

  const vouchers = await db.paymentVoucher.findMany({
    where: where as Parameters<typeof db.paymentVoucher.findMany>[0]['where'],
    include: {
      client: { select: { id: true, name: true, code: true } },
      supplier: { select: { id: true, name: true, code: true } },
      installments: { orderBy: { dueDate: 'asc' } },
    },
    orderBy: { date: 'desc' },
  })

  return vouchers.map(mapVoucherToDetails)
}

/**
 * Post a payment voucher (change status from draft to posted).
 */
export async function postPaymentVoucher(
  companyId: string,
  voucherId: string
): Promise<PaymentVoucherWithDetails | null> {
  const existing = await db.paymentVoucher.findFirst({
    where: { id: voucherId, companyId, status: 'draft' },
  })

  if (!existing) return null

  const posted = await db.paymentVoucher.update({
    where: { id: voucherId },
    data: { status: 'posted' },
    include: {
      client: { select: { id: true, name: true, code: true } },
      supplier: { select: { id: true, name: true, code: true } },
      installments: true,
    },
  })

  return mapVoucherToDetails(posted)
}

/**
 * Cancel a payment voucher.
 */
export async function cancelPaymentVoucher(
  companyId: string,
  voucherId: string
): Promise<PaymentVoucherWithDetails | null> {
  const existing = await db.paymentVoucher.findFirst({
    where: { id: voucherId, companyId, status: { in: ['draft', 'posted'] } },
  })

  if (!existing) return null

  // FIX #8: Instead of setting `deletedAt`, we change the status to 'cancelled'.
  // PaymentVoucher does NOT have a `deletedAt` column in the Prisma schema.
  const cancelled = await db.paymentVoucher.update({
    where: { id: voucherId },
    data: { status: 'cancelled' },
    include: {
      client: { select: { id: true, name: true, code: true } },
      supplier: { select: { id: true, name: true, code: true } },
      installments: true,
    },
  })

  return mapVoucherToDetails(cancelled)
}

/**
 * Mark overdue installments.
 * Checks all pending installments with dueDate < now and marks them as overdue.
 */
export async function markOverdueInstallments(companyId: string): Promise<number> {
  const now = new Date()

  const overdue = await db.installment.updateMany({
    where: {
      status: 'pending',
      dueDate: { lt: now },
      paymentVoucher: {
        companyId,
        status: 'posted',
      },
    },
    data: {
      status: 'overdue',
    },
  })

  return overdue.count
}

/**
 * Pay an installment — mark as paid and record payment date.
 */
export async function payInstallment(
  installmentId: string,
  paidDate: Date,
  paymentRef?: string
): Promise<InstallmentData | null> {
  const installment = await db.installment.findUnique({
    where: { id: installmentId },
  })

  if (!installment || installment.status !== 'pending') return null

  // FIX #9: The update data must match Installment schema exactly.
  // status and paidDate are the only fields that change on payment.
  const paid = await db.installment.update({
    where: { id: installmentId },
    data: {
      status: 'paid' as string,
      paidDate: paidDate,
      paymentRef: paymentRef ?? null,
    },
  })

  return {
    id: paid.id,
    amount: num(paid.amount),
    dueDate: paid.dueDate,
    status: paid.status,
    paidDate: paid.paidDate,
    paymentRef: paid.paymentRef,
  }
}

// ─── Helper ───

function mapVoucherToDetails(
  voucher: Awaited<ReturnType<typeof db.paymentVoucher.findFirst<{
    include: {
      client: { select: { id: true; name: true; code: true } }
      supplier: { select: { id: true; name: true; code: true } }
      installments: true
    }
  }>>>
): PaymentVoucherWithDetails {
  return {
    id: voucher!.id,
    number: voucher!.number,
    date: voucher!.date,
    amount: num(voucher!.amount),
    paymentType: voucher!.paymentType,
    direction: voucher!.direction,
    status: voucher!.status,
    description: voucher!.description,
    clientId: voucher!.clientId,
    supplierId: voucher!.supplierId,
    client: voucher!.client,
    supplier: voucher!.supplier,
    installments: voucher!.installments.map(inst => ({
      id: inst.id,
      amount: num(inst.amount),
      dueDate: inst.dueDate,
      status: inst.status,
      paidDate: inst.paidDate,
      paymentRef: inst.paymentRef,
    })),
  }
}
