/**
 * Trade Finance Module
 * Part of the GarfiX Accounting System.
 *
 * FIX #12: ProductCatalog uses `purchasePrice`, NOT `cost`.
 *          Any select/query on ProductCatalog must use `purchasePrice`.
 *
 * FIX #13: ProductCatalogUncheckedUpdateInput uses `purchasePrice`, NOT `cost`.
 *          When updating a product's cost, use `purchasePrice` in the update data.
 */

import { db } from '@/lib/db'
import { num, round, subtract, add, multiply } from '@/lib/money'

// ─── Types ───

export interface LetterOfCreditSummary {
  id: string
  number: string
  type: string
  amount: number
  currency: string
  status: string
  beneficiary: string | null
  issuingBank: string | null
  issueDate: Date | null
  expiryDate: Date | null
  supplierId: string | null
  supplier?: { id: string; name: string; code: string } | null
  documents: LCDocumentData[]
}

export interface LCDocumentData {
  id: string
  documentType: string
  fileName: string
  fileUrl: string | null
  uploadedAt: Date
}

export interface TradeFinanceDashboard {
  totalLCAmount: number
  activeLCs: number
  expiredLCs: number
  lcByType: { import: number; export: number }
  lcByStatus: Record<string, number>
  productCosts: ProductCostSummary[]
  totalProductCost: number
}

export interface ProductCostSummary {
  productId: string
  productName: string
  sku: string
  // FIX #12: This field is `purchasePrice`, NOT `cost`.
  purchasePrice: number
  sellingPrice: number
  margin: number
  quantityOnHand: number
  totalInventoryCost: number
}

// ─── Letter of Credit Operations ───

/**
 * Get a letter of credit with full details.
 */
export async function getLetterOfCredit(
  companyId: string,
  lcId: string
): Promise<LetterOfCreditSummary | null> {
  const lc = await db.letterOfCredit.findFirst({
    where: { id: lcId, companyId },
    include: {
      supplier: { select: { id: true, name: true, code: true } },
      lcDocuments: true,
    },
  })

  if (!lc) return null

  return {
    id: lc.id,
    number: lc.number,
    type: lc.type,
    amount: num(lc.amount),
    currency: lc.currency,
    status: lc.status,
    beneficiary: lc.beneficiary,
    issuingBank: lc.issuingBank,
    issueDate: lc.issueDate,
    expiryDate: lc.expiryDate,
    supplierId: lc.supplierId,
    supplier: lc.supplier,
    documents: lc.lcDocuments.map(doc => ({
      id: doc.id,
      documentType: doc.documentType,
      fileName: doc.fileName,
      fileUrl: doc.fileUrl,
      uploadedAt: doc.uploadedAt,
    })),
  }
}

/**
 * List all letters of credit for a company.
 */
export async function listLettersOfCredit(
  companyId: string,
  filters?: {
    type?: string
    status?: string
    supplierId?: string
  }
): Promise<LetterOfCreditSummary[]> {
  const where: Record<string, unknown> = { companyId }
  if (filters?.type) where.type = filters.type
  if (filters?.status) where.status = filters.status
  if (filters?.supplierId) where.supplierId = filters.supplierId

  const lcs = await db.letterOfCredit.findMany({
    where: where as Parameters<typeof db.letterOfCredit.findMany>[0]['where'],
    include: {
      supplier: { select: { id: true, name: true, code: true } },
      lcDocuments: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  return lcs.map(lc => ({
    id: lc.id,
    number: lc.number,
    type: lc.type,
    amount: num(lc.amount),
    currency: lc.currency,
    status: lc.status,
    beneficiary: lc.beneficiary,
    issuingBank: lc.issuingBank,
    issueDate: lc.issueDate,
    expiryDate: lc.expiryDate,
    supplierId: lc.supplierId,
    supplier: lc.supplier,
    documents: lc.lcDocuments.map(doc => ({
      id: doc.id,
      documentType: doc.documentType,
      fileName: doc.fileName,
      fileUrl: doc.fileUrl,
      uploadedAt: doc.uploadedAt,
    })),
  }))
}

// ─── Trade Finance Dashboard ───

/**
 * Generate trade finance dashboard data.
 */
export async function getTradeFinanceDashboard(companyId: string): Promise<TradeFinanceDashboard> {
  // LC statistics
  const lcs = await db.letterOfCredit.findMany({
    where: { companyId },
    select: { amount: true, type: true, status: true, currency: true },
  })

  const totalLCAmount = round(sum(lcs.filter(lc => lc.status !== 'cancelled').map(lc => num(lc.amount))))
  const activeLCs = lcs.filter(lc => ['issued', 'confirmed', 'utilized'].includes(lc.status)).length
  const expiredLCs = lcs.filter(lc => lc.status === 'expired').length

  const lcByType = {
    import: lcs.filter(lc => lc.type === 'import').length,
    export: lcs.filter(lc => lc.type === 'export').length,
  }

  const lcByStatus: Record<string, number> = {}
  for (const lc of lcs) {
    lcByStatus[lc.status] = (lcByStatus[lc.status] ?? 0) + 1
  }

  // Product costs — FIX #12 and #13
  const products = await db.productCatalog.findMany({
    where: { companyId, isActive: true },
    select: {
      id: true,
      name: true,
      sku: true,
      // FIX #12: Use `purchasePrice`, NOT `cost` — ProductCatalogSelect has no `cost` field
      purchasePrice: true,
      sellingPrice: true,
    },
  })

  // Get inventory quantities for each product
  const inventoryItems = await db.inventoryItem.findMany({
    where: { companyId },
    include: {
      product: {
        select: {
          id: true,
          // FIX #12: Use `purchasePrice` in the include select, NOT `cost`
          purchasePrice: true,
          sellingPrice: true,
        },
      },
    },
  })

  // Build product cost summaries — FIX #12: Access purchasePrice, not cost
  const productCosts: ProductCostSummary[] = products.map(product => {
    const items = inventoryItems.filter(item => item.productId === product.id)
    const quantityOnHand = items.reduce((sum, item) => sum + item.quantity, 0)

    // FIX #12: Use `purchasePrice` (NOT `cost`) to calculate margin
    const margin = round(subtract(num(product.sellingPrice), num(product.purchasePrice)))
    const totalInventoryCost = round(multiply(num(product.purchasePrice), quantityOnHand))

    return {
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      // FIX #12: This field is `purchasePrice`, NOT `cost`
      purchasePrice: num(product.purchasePrice),
      sellingPrice: num(product.sellingPrice),
      margin,
      quantityOnHand,
      totalInventoryCost,
    }
  })

  // FIX #12: Sum `purchasePrice` based inventory costs, not `cost`
  const totalProductCost = round(sum(productCosts.map(pc => pc.totalInventoryCost)))

  return {
    totalLCAmount,
    activeLCs,
    expiredLCs,
    lcByType,
    lcByStatus,
    productCosts,
    totalProductCost,
  }
}

/**
 * Update a product's purchase price (trade finance cost adjustment).
 */
export async function updateProductPurchasePrice(
  companyId: string,
  productId: string,
  newPurchasePrice: number
): Promise<ProductCostSummary | null> {
  // Verify product belongs to company
  const product = await db.productCatalog.findFirst({
    where: { id: productId, companyId },
  })

  if (!product) return null

  // FIX #13: Use `purchasePrice` in the update data, NOT `cost`.
  // ProductCatalogUncheckedUpdateInput has `purchasePrice`, not `cost`.
  const updated = await db.productCatalog.update({
    where: { id: productId },
    data: {
      // FIX #13: This must be `purchasePrice`, NOT `cost`
      purchasePrice: num(newPurchasePrice),
    },
  })

  // Get inventory quantity
  const inventoryItems = await db.inventoryItem.findMany({
    where: { productId, companyId },
    select: { quantity: true },
  })
  const quantityOnHand = inventoryItems.reduce((sum, item) => sum + item.quantity, 0)

  const margin = round(subtract(num(updated.sellingPrice), num(updated.purchasePrice)))
  const totalInventoryCost = round(multiply(num(updated.purchasePrice), quantityOnHand))

  return {
    productId: updated.id,
    productName: updated.name,
    sku: updated.sku,
    // FIX #12: `purchasePrice`, NOT `cost`
    purchasePrice: num(updated.purchasePrice),
    sellingPrice: num(updated.sellingPrice),
    margin,
    quantityOnHand,
    totalInventoryCost,
  }
}

/**
 * Add a document to a letter of credit.
 */
export async function addLCDocument(
  lcId: string,
  documentType: string,
  fileName: string,
  fileUrl?: string
): Promise<LCDocumentData> {
  const doc = await db.letterOfCreditDocument.create({
    data: {
      letterOfCreditId: lcId,
      documentType,
      fileName,
      fileUrl: fileUrl ?? null,
    },
  })

  return {
    id: doc.id,
    documentType: doc.documentType,
    fileName: doc.fileName,
    fileUrl: doc.fileUrl,
    uploadedAt: doc.uploadedAt,
  }
}
