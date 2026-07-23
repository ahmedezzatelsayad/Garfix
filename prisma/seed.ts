import { db } from '@/lib/db'

/**
 * Seed script for the GarfiX accounting module.
 * Creates demo data so the dashboard is populated.
 */
async function seed() {
  console.log('🌱 Seeding GarfiX accounting module...')

  // Create demo company
  const company = await db.company.upsert({
    where: { code: 'GFX-01' },
    update: {},
    create: {
      name: 'GarfiX Trading Co.',
      code: 'GFX-01',
      currency: 'USD',
      taxId: 'US-12345',
      address: '123 Finance Street, New York, NY 10001',
    },
  })
  console.log(`✅ Company: ${company.name} (${company.id})`)

  // Create demo user
  const user = await db.user.upsert({
    where: { email: 'admin@garfix.com' },
    update: {},
    create: {
      email: 'admin@garfix.com',
      name: 'Admin User',
      role: 'admin',
      companyId: company.id,
    },
  })
  console.log(`✅ User: ${user.name} (${user.id})`)

  // Create chart of accounts
  const accountData = [
    { code: '1000', name: 'Cash', type: 'asset' },
    { code: '1100', name: 'Accounts Receivable', type: 'asset' },
    { code: '1200', name: 'Inventory', type: 'asset' },
    { code: '2000', name: 'Accounts Payable', type: 'liability' },
    { code: '2100', name: 'Bank Loans', type: 'liability' },
    { code: '3000', name: 'Owner Equity', type: 'equity' },
    { code: '3100', name: 'Retained Earnings', type: 'equity' },
    { code: '4000', name: 'Sales Revenue', type: 'revenue' },
    { code: '4100', name: 'Service Revenue', type: 'revenue' },
    { code: '5000', name: 'Cost of Goods Sold', type: 'expense' },
    { code: '5100', name: 'Operating Expenses', type: 'expense' },
    { code: '5200', name: 'Salaries & Wages', type: 'expense' },
    { code: '5300', name: 'Depreciation', type: 'expense' },
  ]

  const accounts = await db.$transaction(
    accountData.map(a =>
      db.account.upsert({
        where: { code_companyId: { code: a.code, companyId: company.id } },
        update: {},
        create: {
          code: a.code,
          name: a.name,
          type: a.type,
          companyId: company.id,
        },
      })
    )
  )
  console.log(`✅ ${accounts.length} accounts created`)

  // Create financial period
  const period = await db.financialPeriod.upsert({
    where: { name_companyId: { name: 'FY-2025', companyId: company.id } },
    update: {},
    create: {
      name: 'FY-2025',
      startDate: new Date('2025-01-01'),
      endDate: new Date('2025-12-31'),
      status: 'open',
      companyId: company.id,
    },
  })
  console.log(`✅ Period: ${period.name}`)

  // Create clients
  const clientData = [
    { name: 'Alpha Corp', code: 'CLI-001', email: 'alpha@example.com' },
    { name: 'Beta Industries', code: 'CLI-002', email: 'beta@example.com' },
    { name: 'Gamma Solutions', code: 'CLI-003', email: 'gamma@example.com' },
  ]
  const clients = await db.$transaction(
    clientData.map(c =>
      db.client.upsert({
        where: { code_companyId: { code: c.code, companyId: company.id } },
        update: {},
        create: {
          name: c.name,
          code: c.code,
          email: c.email,
          companyId: company.id,
        },
      })
    )
  )
  console.log(`✅ ${clients.length} clients created`)

  // Create suppliers
  const supplierData = [
    { name: 'Delta Supplies', code: 'SUP-001', email: 'delta@supplier.com' },
    { name: 'Epsilon Manufacturing', code: 'SUP-002', email: 'epsilon@supplier.com' },
    { name: 'Zeta Raw Materials', code: 'SUP-003', email: 'zeta@supplier.com' },
  ]
  const suppliers = await db.$transaction(
    supplierData.map(s =>
      db.supplier.upsert({
        where: { code_companyId: { code: s.code, companyId: company.id } },
        update: {},
        create: {
          name: s.name,
          code: s.code,
          email: s.email,
          companyId: company.id,
        },
      })
    )
  )
  console.log(`✅ ${suppliers.length} suppliers created`)

  // Create product catalog — using purchasePrice (NOT cost)
  const productData = [
    { name: 'Widget A', sku: 'WGT-A', category: 'Widgets', purchasePrice: 25.50, sellingPrice: 45.00, unit: 'piece' },
    { name: 'Widget B', sku: 'WGT-B', category: 'Widgets', purchasePrice: 30.00, sellingPrice: 55.00, unit: 'piece' },
    { name: 'Gear Assembly', sku: 'GAR-001', category: 'Assemblies', purchasePrice: 120.00, sellingPrice: 200.00, unit: 'piece' },
    { name: 'Bolt Pack (100)', sku: 'BLT-100', category: 'Fasteners', purchasePrice: 15.00, sellingPrice: 28.00, unit: 'pack' },
    { name: 'Motor Unit X', sku: 'MTR-X', category: 'Motors', purchasePrice: 350.00, sellingPrice: 550.00, unit: 'piece' },
  ]
  const products = await db.$transaction(
    productData.map(p =>
      db.productCatalog.upsert({
        where: { sku_companyId: { sku: p.sku, companyId: company.id } },
        update: {},
        create: {
          name: p.name,
          sku: p.sku,
          category: p.category,
          purchasePrice: p.purchasePrice,
          sellingPrice: p.sellingPrice,
          unit: p.unit,
          companyId: company.id,
        },
      })
    )
  )
  console.log(`✅ ${products.length} products created`)

  // Create inventory items
  const inventoryData = [
    { productId: products[0].id, quantity: 500, warehouse: 'Main' },
    { productId: products[1].id, quantity: 300, warehouse: 'Main' },
    { productId: products[2].id, quantity: 100, warehouse: 'Warehouse B' },
    { productId: products[3].id, quantity: 2000, warehouse: 'Main' },
    { productId: products[4].id, quantity: 50, warehouse: 'Warehouse B' },
  ]
  for (const item of inventoryData) {
    await db.inventoryItem.upsert({
      where: { id: `inv-${item.productId.slice(-4)}` },
      update: { quantity: item.quantity },
      create: {
        id: `inv-${item.productId.slice(-4)}`,
        productId: item.productId,
        quantity: item.quantity,
        warehouse: item.warehouse,
        companyId: company.id,
      },
    })
  }
  console.log(`✅ ${inventoryData.length} inventory items created`)

  // Create payment vouchers with installments
  const voucherData = [
    {
      number: 'PV-001', date: new Date('2025-02-15'), amount: 12000,
      paymentType: 'receipt', direction: 'inbound', clientId: clients[0].id,
      description: 'Payment from Alpha Corp - Invoice #INV-001',
    },
    {
      number: 'PV-002', date: new Date('2025-03-10'), amount: 8500,
      paymentType: 'payment', direction: 'outbound', supplierId: suppliers[0].id,
      description: 'Payment to Delta Supplies - PO #PO-001',
    },
    {
      number: 'PV-003', date: new Date('2025-04-01'), amount: 15000,
      paymentType: 'receipt', direction: 'inbound', clientId: clients[1].id,
      description: 'Payment from Beta Industries - Invoice #INV-002',
    },
    {
      number: 'PV-004', date: new Date('2025-04-20'), amount: 22000,
      paymentType: 'payment', direction: 'outbound', supplierId: suppliers[1].id,
      description: 'Payment to Epsilon Manufacturing - PO #PO-002',
    },
    {
      number: 'PV-005', date: new Date('2025-05-05'), amount: 5000,
      paymentType: 'receipt', direction: 'inbound', clientId: clients[2].id,
      description: 'Partial payment from Gamma Solutions',
    },
  ]

  for (const v of voucherData) {
    await db.paymentVoucher.upsert({
      where: { number_companyId: { number: v.number, companyId: company.id } },
      update: {},
      create: {
        number: v.number,
        date: v.date,
        amount: v.amount,
        paymentType: v.paymentType,
        direction: v.direction,
        status: 'posted',
        description: v.description,
        clientId: v.clientId ?? null,
        supplierId: v.supplierId ?? null,
        companyId: company.id,
        installments: {
          create: [
            {
              amount: v.amount * 0.5,
              dueDate: new Date(v.date.getTime() + 30 * 24 * 60 * 60 * 1000),
              status: v.direction === 'inbound' ? 'paid' : 'pending',
              paidDate: v.direction === 'inbound' ? v.date : null,
            },
            {
              amount: v.amount * 0.5,
              dueDate: new Date(v.date.getTime() + 60 * 24 * 60 * 60 * 1000),
              status: 'pending',
            },
          ],
        },
      },
    })
  }
  console.log(`✅ ${voucherData.length} payment vouchers created`)

  // Create vouchers (journal entries)
  const journalData = [
    {
      number: 'JV-001', date: new Date('2025-02-15'), description: 'Record sales to Alpha Corp',
      voucherType: 'receipt', status: 'posted',
      lines: [
        { accountId: accounts.find(a => a.code === '1000')!.id, debit: 12000, credit: 0 },
        { accountId: accounts.find(a => a.code === '4000')!.id, debit: 0, credit: 12000 },
      ],
    },
    {
      number: 'JV-002', date: new Date('2025-03-10'), description: 'Record purchase from Delta Supplies',
      voucherType: 'payment', status: 'posted',
      lines: [
        { accountId: accounts.find(a => a.code === '5000')!.id, debit: 8500, credit: 0 },
        { accountId: accounts.find(a => a.code === '1000')!.id, debit: 0, credit: 8500 },
      ],
    },
  ]

  for (const j of journalData) {
    await db.voucher.upsert({
      where: { number_companyId: { number: j.number, companyId: company.id } },
      update: {},
      create: {
        number: j.number,
        date: j.date,
        description: j.description,
        voucherType: j.voucherType,
        status: j.status,
        companyId: company.id,
        lines: {
          create: j.lines.map((line, index) => ({
            accountId: line.accountId,
            debit: line.debit,
            credit: line.credit,
            sortOrder: index,
          })),
        },
      },
    })
  }
  console.log(`✅ ${journalData.length} journal entries created`)

  // Create opening balances
  const balanceData = [
    { accountId: accounts.find(a => a.code === '1000')!.id, debit: 50000, credit: 0 },
    { accountId: accounts.find(a => a.code === '1100')!.id, debit: 30000, credit: 0 },
    { accountId: accounts.find(a => a.code === '2000')!.id, debit: 0, credit: 20000 },
    { accountId: accounts.find(a => a.code === '3000')!.id, debit: 0, credit: 60000 },
  ]

  for (const b of balanceData) {
    await db.openingBalance.upsert({
      where: { accountId_periodId: { accountId: b.accountId, periodId: period.id } },
      update: {},
      create: {
        accountId: b.accountId,
        periodId: period.id,
        debit: b.debit,
        credit: b.credit,
        companyId: company.id,
      },
    })
  }
  console.log(`✅ ${balanceData.length} opening balances created`)

  // Create letters of credit
  const lcData = [
    {
      number: 'LC-2025-001', type: 'import', amount: 50000, currency: 'USD',
      status: 'issued', beneficiary: 'Delta Supplies Ltd.', issuingBank: 'First National Bank',
      issueDate: new Date('2025-01-15'), expiryDate: new Date('2025-07-15'),
      supplierId: suppliers[0].id,
    },
    {
      number: 'LC-2025-002', type: 'export', amount: 35000, currency: 'USD',
      status: 'confirmed', beneficiary: 'Alpha Corp Inc.', issuingBank: 'Global Trade Bank',
      issueDate: new Date('2025-02-01'), expiryDate: new Date('2025-08-01'),
    },
    {
      number: 'LC-2025-003', type: 'import', amount: 25000, currency: 'EUR',
      status: 'draft', beneficiary: 'Zeta Raw Materials GmbH.', issuingBank: 'European Credit Bank',
      supplierId: suppliers[2].id,
    },
  ]

  for (const lc of lcData) {
    await db.letterOfCredit.upsert({
      where: { number_companyId: { number: lc.number, companyId: company.id } },
      update: {},
      create: {
        number: lc.number,
        type: lc.type,
        amount: lc.amount,
        currency: lc.currency,
        status: lc.status,
        beneficiary: lc.beneficiary,
        issuingBank: lc.issuingBank,
        issueDate: lc.issueDate,
        expiryDate: lc.expiryDate,
        supplierId: lc.supplierId ?? null,
        companyId: company.id,
      },
    })
  }
  console.log(`✅ ${lcData.length} letters of credit created`)

  // Create profit distributions
  const profitDist = await db.profitDistribution.create({
    data: {
      periodId: period.id,
      totalProfit: 45000,
      retained: 18000,
      distributed: 27000,
      distributionType: 'proportional',
      status: 'approved',
      companyId: company.id,
      entries: {
        create: [
          { shareholder: 'Partner A', shareRatio: 0.4, amount: 10800 },
          { shareholder: 'Partner B', shareRatio: 0.35, amount: 9450 },
          { shareholder: 'Partner C', shareRatio: 0.25, amount: 6750 },
        ],
      },
    },
  })
  console.log(`✅ Profit distribution created: ${profitDist.id}`)

  console.log('🎉 GarfiX accounting module seeded successfully!')
  console.log(`\n📝 Demo company ID: ${company.id}`)
  console.log('   Use this as companyId in API requests or x-company-id header.')
}

seed()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
