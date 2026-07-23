/**
 * Financial Dashboard Module
 * Part of the GarfiX Accounting System.
 *
 * FIX #10: ProductCatalog uses `purchasePrice`, NOT `cost`.
 *          Any reference to `.cost` must be changed to `.purchasePrice`.
 *
 * FIX #11: InventoryItem has a `product` relation (via productId),
 *          but you must include it in the Prisma query with `include: { product: true }`
 *          to access it. Simply referencing `item.product` without the include
 *          will result in a type error. If you need the product data, include it
 *          in the query. Alternatively, use `item.productId` if you only need the ID.
 */

import { db } from '@/lib/db'
import { num, round, sum, add, subtract } from '@/lib/money'

// ─── Dashboard Types ───

export interface DashboardSummary {
  totalRevenue: number
  totalExpenses: number
  netProfit: number
  totalAROutstanding: number
  totalAPOutstanding: number
  inventoryValue: number
  topProducts: ProductRanking[]
  recentTransactions: RecentTransaction[]
  arBreakdown: ARBreakdown
  apBreakdown: APBreakdown
}

export interface ProductRanking {
  productId: string
  productName: string
  sku: string
  totalQuantity: number
  unitPrice: number
  totalValue: number
  // FIX #10: This field is `purchasePrice`, NOT `cost`.
  purchasePrice: number
}

export interface RecentTransaction {
  id: string
  number: string
  date: Date
  amount: number
  type: string
  status: string
  description: string | null
}

export interface ARBreakdown {
  current: number
  overdue30: number
  overdue60: number
  overdue90: number
  total: number
}

export interface APBreakdown {
  current: number
  overdue30: number
  overdue60: number
  overdue90: number
  total: number
}

// ─── Dashboard Data ───

/**
 * Generate a comprehensive financial dashboard for a company.
 */
export async function getFinancialDashboard(companyId: string): Promise<DashboardSummary> {
  // Revenue from posted inbound vouchers
  const revenueVouchers = await db.paymentVoucher.findMany({
    where: { companyId, direction: 'inbound', status: 'posted' },
    select: { amount: true },
  })
  const totalRevenue = round(sum(revenueVouchers.map(v => num(v.amount))))

  // Expenses from posted outbound vouchers
  const expenseVouchers = await db.paymentVoucher.findMany({
    where: { companyId, direction: 'outbound', status: 'posted' },
    select: { amount: true },
  })
  const totalExpenses = round(sum(expenseVouchers.map(v => num(v.amount))))
  const netProfit = round(subtract(totalRevenue, totalExpenses))

  // AR outstanding
  const arOutstanding = await db.paymentVoucher.findMany({
    where: { companyId, direction: 'outbound', status: 'posted', clientId: { not: null } },
    select: { amount: true },
  })
  const arReceived = await db.paymentVoucher.findMany({
    where: { companyId, direction: 'inbound', status: 'posted', clientId: { not: null } },
    select: { amount: true },
  })
  const totalAROutstanding = round(subtract(sum(arOutstanding.map(v => num(v.amount))), sum(arReceived.map(v => num(v.amount)))))

  // AP outstanding
  const apOutstanding = await db.paymentVoucher.findMany({
    where: { companyId, direction: 'outbound', status: 'posted', supplierId: { not: null } },
    select: { amount: true },
  })
  const apRefunded = await db.paymentVoucher.findMany({
    where: { companyId, direction: 'inbound', status: 'posted', supplierId: { not: null } },
    select: { amount: true },
  })
  const totalAPOutstanding = round(subtract(sum(apOutstanding.map(v => num(v.amount))), sum(apRefunded.map(v => num(v.amount)))))

  // Inventory value — FIX #10 and #11
  const inventoryItems = await db.inventoryItem.findMany({
    where: { companyId },
    // FIX #11: Must include the `product` relation to access item.product
    include: {
      product: {
        select: {
          id: true,
          name: true,
          sku: true,
          // FIX #10: Use `purchasePrice`, NOT `cost` — ProductCatalog has no `cost` field
          purchasePrice: true,
          sellingPrice: true,
        },
      },
    },
  })

  // Calculate inventory value
  // FIX #10: Access `purchasePrice` (not `cost`) from the included product relation
  const inventoryValue = round(
    sum(inventoryItems.map(item => {
      // FIX #11: `item.product` is available because we included it in the query
      // If we hadn't included it, we'd need to use `item.productId` only
      const productPrice = num(item.product.purchasePrice) // NOT item.product.cost
      return productPrice * num(item.quantity)
    }))
  )

  // Top products by inventory value — FIX #10 and #11
  const topProducts: ProductRanking[] = inventoryItems
    .map(item => ({
      productId: item.product.id,
      productName: item.product.name,
      sku: item.product.sku,
      totalQuantity: item.quantity,
      unitPrice: num(item.product.sellingPrice),
      totalValue: round(num(item.product.sellingPrice) * num(item.quantity)),
      // FIX #10: This is `purchasePrice`, NOT `cost`
      purchasePrice: num(item.product.purchasePrice),
    }))
    .sort((a, b) => b.totalValue - a.totalValue)
    .slice(0, 10)

  // Recent transactions
  const recentVouchers = await db.voucher.findMany({
    where: { companyId, status: 'posted' },
    select: {
      id: true,
      number: true,
      date: true,
      description: true,
      status: true,
      voucherType: true,
      lines: { select: { debit: true, credit: true } },
    },
    orderBy: { date: 'desc' },
    take: 20,
  })

  const recentTransactions: RecentTransaction[] = recentVouchers.map(v => ({
    id: v.id,
    number: v.number,
    date: v.date,
    amount: round(sum(v.lines.map(l => num(l.debit)))),
    type: v.voucherType,
    status: v.status,
    description: v.description,
  }))

  // AR/AP breakdowns by aging
  const arBreakdown = await getARBreakdown(companyId)
  const apBreakdown = await getAPBreakdown(companyId)

  return {
    totalRevenue,
    totalExpenses,
    netProfit,
    totalAROutstanding,
    totalAPOutstanding,
    inventoryValue,
    topProducts,
    recentTransactions,
    arBreakdown,
    apBreakdown,
  }
}

// ─── Aging Breakdowns ───

async function getARBreakdown(companyId: string): Promise<ARBreakdown> {
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

  const installments = await db.installment.findMany({
    where: {
      status: { in: ['pending', 'overdue'] },
      paymentVoucher: {
        companyId,
        status: 'posted',
        direction: 'outbound',
        clientId: { not: null },
      },
    },
    select: { amount: true, dueDate: true, status: true },
  })

  const current = round(sum(installments.filter(i => new Date(i.dueDate) >= now).map(i => num(i.amount))))
  const overdue30 = round(sum(installments.filter(i => new Date(i.dueDate) >= thirtyDaysAgo && new Date(i.dueDate) < now).map(i => num(i.amount))))
  const overdue60 = round(sum(installments.filter(i => new Date(i.dueDate) >= sixtyDaysAgo && new Date(i.dueDate) < thirtyDaysAgo).map(i => num(i.amount))))
  const overdue90 = round(sum(installments.filter(i => new Date(i.dueDate) < ninetyDaysAgo).map(i => num(i.amount))))
  const total = round(add(current, overdue30, overdue60, overdue90))

  return { current, overdue30, overdue60, overdue90, total }
}

async function getAPBreakdown(companyId: string): Promise<APBreakdown> {
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

  const installments = await db.installment.findMany({
    where: {
      status: { in: ['pending', 'overdue'] },
      paymentVoucher: {
        companyId,
        status: 'posted',
        direction: 'outbound',
        supplierId: { not: null },
      },
    },
    select: { amount: true, dueDate: true, status: true },
  })

  const current = round(sum(installments.filter(i => new Date(i.dueDate) >= now).map(i => num(i.amount))))
  const overdue30 = round(sum(installments.filter(i => new Date(i.dueDate) >= thirtyDaysAgo && new Date(i.dueDate) < now).map(i => num(i.amount))))
  const overdue60 = round(sum(installments.filter(i => new Date(i.dueDate) >= sixtyDaysAgo && new Date(i.dueDate) < thirtyDaysAgo).map(i => num(i.amount))))
  const overdue90 = round(sum(installments.filter(i => new Date(i.dueDate) < ninetyDaysAgo).map(i => num(i.amount))))
  const total = round(add(current, overdue30, overdue60, overdue90))

  return { current, overdue30, overdue60, overdue90, total }
}
