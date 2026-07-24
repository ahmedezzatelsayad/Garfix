import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'

/**
 * Seed script for the GarfiX accounting module.
 * Creates demo data so the dashboard is populated.
 */
async function seed() {
  console.log('🌱 Seeding GarfiX accounting module...')

  // Create demo company
  const company = await db.company.upsert({
    where: { slug: 'gfx-01' },
    update: {},
    create: {
      name: 'GarfiX Trading Co.',
      slug: 'gfx-01',
      currency: 'USD',
      vatNumber: 'US-12345',
      address: '123 Finance Street, New York, NY 10001',
    },
  })
  console.log(`✅ Company: ${company.name} (${company.slug})`)

  // Create demo user
  const user = await db.appUser.upsert({
    where: { email: 'admin@garfix.com' },
    update: {},
    create: {
      uid: 'admin-001',
      email: 'admin@garfix.com',
      passwordHash: '$2a$10$dummyhashnotforproduction',
      displayName: 'Admin User',
      role: 'admin',
      companies: JSON.stringify([company.slug]),
    },
  })
  console.log(`✅ User: ${user.displayName} (${user.id})`)

  // Create chart of accounts
  const accountData = [
    { code: '1000', nameAr: 'Cash', type: 'asset' },
    { code: '1100', nameAr: 'Accounts Receivable', type: 'asset' },
    { code: '1200', nameAr: 'Inventory', type: 'asset' },
    { code: '2000', nameAr: 'Accounts Payable', type: 'liability' },
    { code: '2100', nameAr: 'Bank Loans', type: 'liability' },
    { code: '3000', nameAr: 'Owner Equity', type: 'equity' },
    { code: '3100', nameAr: 'Retained Earnings', type: 'equity' },
    { code: '4000', nameAr: 'Sales Revenue', type: 'revenue' },
    { code: '4100', nameAr: 'Service Revenue', type: 'revenue' },
    { code: '5000', nameAr: 'Cost of Goods Sold', type: 'expense' },
    { code: '5100', nameAr: 'Operating Expenses', type: 'expense' },
    { code: '5200', nameAr: 'Salaries & Wages', type: 'expense' },
    { code: '5300', nameAr: 'Depreciation', type: 'expense' },
  ]

  const accounts = await db.$transaction(
    accountData.map(a =>
      db.account.upsert({
        where: { code_companySlug: { code: a.code, companySlug: company.slug } },
        update: {},
        create: {
          code: a.code,
          nameAr: a.nameAr,
          type: a.type,
          companySlug: company.slug,
        },
      })
    )
  )
  console.log(`✅ ${accounts.length} accounts created`)

  // Create financial period
  const period = await db.fiscalPeriod.upsert({
    where: { companySlug_name: { companySlug: company.slug, name: 'FY-2025' } },
    update: {},
    create: {
      name: 'FY-2025',
      startDate: '2025-01-01',
      endDate: '2025-12-31',
      fiscalYear: 2025,
      periodType: 'yearly',
      status: 'open',
      companySlug: company.slug,
    },
  })
  console.log(`✅ Period: ${period.name}`)

  // Create clients (no unique constraint besides id, so use findFirst + create)
  const clientData = [
    { name: 'Alpha Corp', email: 'alpha@example.com' },
    { name: 'Beta Industries', email: 'beta@example.com' },
    { name: 'Gamma Solutions', email: 'gamma@example.com' },
  ]
  const clients: { id: number; name: string }[] = []
  for (const c of clientData) {
    const existing = await db.client.findFirst({ where: { name: c.name, companySlug: company.slug } })
    if (existing) {
      clients.push(existing)
    } else {
      const created = await db.client.create({
        data: { name: c.name, email: c.email, companySlug: company.slug },
      })
      clients.push(created)
    }
  }
  console.log(`✅ ${clients.length} clients created`)

  // Create suppliers
  const supplierData = [
    { name: 'Delta Supplies', code: 'SUP-001', email: 'delta@supplier.com' },
    { name: 'Epsilon Manufacturing', code: 'SUP-002', email: 'epsilon@supplier.com' },
    { name: 'Zeta Raw Materials', code: 'SUP-003', email: 'zeta@supplier.com' },
  ]
  const suppliers: { id: number; name: string }[] = [];
  for (const s of supplierData) {
    const existing = await db.supplier.findFirst({ where: { name: s.name, companySlug: company.slug } });
    if (existing) {
      suppliers.push(existing);
    } else {
      const created = await db.supplier.create({
        data: { name: s.name, code: s.code, email: s.email, companySlug: company.slug },
      });
      suppliers.push(created);
    }
  }
  console.log(`✅ ${suppliers.length} suppliers created`)

  // Create product catalog
  const productData = [
    { name: 'Widget A', code: 'WGT-A', purchasePrice: 25.50, sellingPrice: 45.00, unit: 'piece' },
    { name: 'Widget B', code: 'WGT-B', purchasePrice: 30.00, sellingPrice: 55.00, unit: 'piece' },
    { name: 'Gear Assembly', code: 'GAR-001', purchasePrice: 120.00, sellingPrice: 200.00, unit: 'piece' },
    { name: 'Bolt Pack (100)', code: 'BLT-100', purchasePrice: 15.00, sellingPrice: 28.00, unit: 'pack' },
    { name: 'Motor Unit X', code: 'MTR-X', purchasePrice: 350.00, sellingPrice: 550.00, unit: 'piece' },
  ]
  const products: { id: number; name: string }[] = []
  for (const p of productData) {
    const existing = await db.productCatalog.findFirst({ where: { name: p.name, companySlug: company.slug } })
    if (existing) {
      products.push(existing)
    } else {
      const created = await db.productCatalog.create({
        data: {
          name: p.name,
          code: p.code,
          purchasePrice: new Prisma.Decimal(p.purchasePrice),
          sellingPrice: new Prisma.Decimal(p.sellingPrice),
          unit: p.unit,
          companySlug: company.slug,
        },
      })
      products.push(created)
    }
  }
  console.log(`✅ ${products.length} products created`)

  // Create warehouses
  const warehouseMain = await db.warehouse.upsert({
    where: { companySlug_code: { companySlug: company.slug, code: 'WH-MAIN' } },
    update: {},
    create: { name: 'Main Warehouse', code: 'WH-MAIN', companySlug: company.slug },
  })
  const warehouseB = await db.warehouse.upsert({
    where: { companySlug_code: { companySlug: company.slug, code: 'WH-B' } },
    update: {},
    create: { name: 'Warehouse B', code: 'WH-B', companySlug: company.slug },
  })

  // Create inventory items
  const inventoryData = [
    { productId: products[0].id, warehouseId: warehouseMain.id, quantity: '500' },
    { productId: products[1].id, warehouseId: warehouseMain.id, quantity: '300' },
    { productId: products[2].id, warehouseId: warehouseB.id, quantity: '100' },
    { productId: products[3].id, warehouseId: warehouseMain.id, quantity: '2000' },
    { productId: products[4].id, warehouseId: warehouseB.id, quantity: '50' },
  ]
  for (const item of inventoryData) {
    const existing = await db.inventoryItem.findUnique({
      where: { warehouseId_productId: { warehouseId: item.warehouseId, productId: item.productId } },
    })
    if (!existing) {
      await db.inventoryItem.create({
        data: {
          warehouseId: item.warehouseId,
          productId: item.productId,
          quantity: item.quantity,
          companySlug: company.slug,
        },
      })
    }
  }
  console.log(`✅ ${inventoryData.length} inventory items created`)

  // Create bank accounts
  const bankAccount1 = await db.bankAccount.create({
    data: {
      bankName: 'First National Bank',
      accountName: 'Main Operating Account',
      accountNumber: 'ACC-001',
      currency: 'USD',
      balance: new Prisma.Decimal(50000),
      accountType: 'checking',
      glAccountId: accounts.find(a => a.code === '1000')?.id,
      companySlug: company.slug,
    },
  })
  console.log(`✅ Bank account created: ${bankAccount1.accountName}`)

  // Create payment vouchers with installments
  const voucherData = [
    {
      voucherNumber: 'PV-001', date: '2025-02-15', amount: 12000,
      voucherType: 'receipt', payee: 'Alpha Corp', payer: company.name,
      clientId: clients[0].id, description: 'Payment from Alpha Corp - Invoice #INV-001',
    },
    {
      voucherNumber: 'PV-002', date: '2025-03-10', amount: 8500,
      voucherType: 'payment', payee: 'Delta Supplies', payer: company.name,
      supplierId: suppliers[0].id, description: 'Payment to Delta Supplies - PO #PO-001',
    },
    {
      voucherNumber: 'PV-003', date: '2025-04-01', amount: 15000,
      voucherType: 'receipt', payee: 'Beta Industries', payer: company.name,
      clientId: clients[1].id, description: 'Payment from Beta Industries - Invoice #INV-002',
    },
    {
      voucherNumber: 'PV-004', date: '2025-04-20', amount: 22000,
      voucherType: 'payment', payee: 'Epsilon Manufacturing', payer: company.name,
      supplierId: suppliers[1].id, description: 'Payment to Epsilon Manufacturing - PO #PO-002',
    },
    {
      voucherNumber: 'PV-005', date: '2025-05-05', amount: 5000,
      voucherType: 'receipt', payee: 'Gamma Solutions', payer: company.name,
      clientId: clients[2].id, description: 'Partial payment from Gamma Solutions',
    },
  ]

  for (const v of voucherData) {
    const existing = await db.paymentVoucher.findUnique({
      where: { companySlug_voucherNumber: { companySlug: company.slug, voucherNumber: v.voucherNumber } },
    })
    if (existing) continue

    await db.paymentVoucher.create({
      data: {
        companySlug: company.slug,
        voucherNumber: v.voucherNumber,
        voucherType: v.voucherType,
        date: v.date,
        amount: new Prisma.Decimal(v.amount),
        payee: v.payee,
        payer: v.payer,
        description: v.description,
        status: 'posted',
        createdBy: user.uid,
        clientId: v.clientId ?? null,
        supplierId: v.supplierId ?? null,
        bankAccountId: bankAccount1.id,
        installments: {
          create: [
            {
              amount: new Prisma.Decimal(v.amount * 0.5),
              dueDate: new Date('2025-03-15'),
              status: v.voucherType === 'receipt' ? 'paid' : 'pending',
              paidDate: v.voucherType === 'receipt' ? new Date(v.date) : null,
            },
            {
              amount: new Prisma.Decimal(v.amount * 0.5),
              dueDate: new Date('2025-04-15'),
              status: 'pending',
            },
          ],
        },
      },
    })
  }
  console.log(`✅ ${voucherData.length} payment vouchers created`)

  // Create journal entries
  const journalData = [
    {
      description: 'Record sales to Alpha Corp',
      lines: [
        { accountId: accounts.find(a => a.code === '1000')!.id, debit: 12000, credit: 0 },
        { accountId: accounts.find(a => a.code === '4000')!.id, debit: 0, credit: 12000 },
      ],
    },
    {
      description: 'Record purchase from Delta Supplies',
      lines: [
        { accountId: accounts.find(a => a.code === '5000')!.id, debit: 8500, credit: 0 },
        { accountId: accounts.find(a => a.code === '1000')!.id, debit: 0, credit: 8500 },
      ],
    },
  ]

  for (const j of journalData) {
    await db.journalEntry.create({
      data: {
        date: '2025-02-15',
        description: j.description,
        companySlug: company.slug,
        createdBy: user.uid,
        status: 'posted',
        lines: {
          create: j.lines.map(line => ({
            accountId: line.accountId,
            debit: new Prisma.Decimal(line.debit),
            credit: new Prisma.Decimal(line.credit),
          })),
        },
      },
    })
  }
  console.log(`✅ ${journalData.length} journal entries created`)

  // Create opening balances
  const balanceData = [
    { accountId: accounts.find(a => a.code === '1000')!.id, amount: 50000 },
    { accountId: accounts.find(a => a.code === '1100')!.id, amount: 30000 },
    { accountId: accounts.find(a => a.code === '2000')!.id, amount: -20000 },
    { accountId: accounts.find(a => a.code === '3000')!.id, amount: -60000 },
  ]

  for (const b of balanceData) {
    const existing = await db.openingBalanceEntry.findUnique({
      where: { companySlug_accountId_asOfDate: { companySlug: company.slug, accountId: b.accountId, asOfDate: '2025-01-01' } },
    })
    if (existing) continue

    await db.openingBalanceEntry.create({
      data: {
        accountId: b.accountId,
        amount: new Prisma.Decimal(b.amount),
        asOfDate: '2025-01-01',
        status: 'posted',
        companySlug: company.slug,
      },
    })
  }
  console.log(`✅ ${balanceData.length} opening balances created`)

  // Create letters of credit
  const lcData = [
    {
      lcNumber: 'LC-2025-001', amount: 50000, currency: 'USD',
      status: 'issued', issueDate: '2025-01-15', expiryDate: '2025-07-15',
      supplierId: suppliers[0].id, bankAccountId: bankAccount1.id,
    },
    {
      lcNumber: 'LC-2025-002', amount: 35000, currency: 'USD',
      status: 'confirmed', issueDate: '2025-02-01', expiryDate: '2025-08-01',
      bankAccountId: bankAccount1.id, supplierId: suppliers[1].id,
    },
    {
      lcNumber: 'LC-2025-003', amount: 25000, currency: 'EUR',
      status: 'draft', issueDate: '2025-03-01', expiryDate: '2025-09-01',
      supplierId: suppliers[2].id, bankAccountId: bankAccount1.id,
    },
  ]

  for (const lc of lcData) {
    const existing = await db.letterOfCredit.findUnique({
      where: { companySlug_lcNumber: { companySlug: company.slug, lcNumber: lc.lcNumber } },
    })
    if (existing) continue

    await db.letterOfCredit.create({
      data: {
        companySlug: company.slug,
        lcNumber: lc.lcNumber,
        amount: new Prisma.Decimal(lc.amount),
        currency: lc.currency,
        status: lc.status,
        issueDate: lc.issueDate,
        expiryDate: lc.expiryDate,
        supplierId: lc.supplierId,
        bankAccountId: lc.bankAccountId,
      },
    })
  }
  console.log(`✅ ${lcData.length} letters of credit created`)

  // Create profit distributions
  const existingPD = await db.profitDistribution.findFirst({ where: { companySlug: company.slug } })
  if (!existingPD) {
    await db.profitDistribution.create({
      data: {
        companySlug: company.slug,
        totalProfit: new Prisma.Decimal(45000),
        retained: new Prisma.Decimal(18000),
        distributed: new Prisma.Decimal(27000),
        distributionType: 'proportional',
        status: 'approved',
        entries: {
          create: [
            { shareholder: 'Partner A', shareRatio: new Prisma.Decimal(0.4), amount: new Prisma.Decimal(10800) },
            { shareholder: 'Partner B', shareRatio: new Prisma.Decimal(0.35), amount: new Prisma.Decimal(9450) },
            { shareholder: 'Partner C', shareRatio: new Prisma.Decimal(0.25), amount: new Prisma.Decimal(6750) },
          ],
        },
      },
    })
  }
  console.log('✅ Profit distribution created')

  console.log('🎉 GarfiX accounting module seeded successfully!')
  console.log(`\n📝 Demo company slug: ${company.slug}`)
  console.log('   Use this as companySlug in API requests or x-company-slug header.')
}

seed()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
