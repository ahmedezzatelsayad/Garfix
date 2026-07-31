/**
 * check-orphans.ts — Comprehensive Orphan Record Detection Script
 * 
 * This script scans the database for orphaned records:
 * 1. Records with companyId that doesn't exist in companies table
 * 2. Records with nullable foreign keys pointing to non-existent parents
 * 3. Records that should have a parent but don't
 * 
 * Run: npx tsx scripts/check-orphans.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface OrphanReport {
  table: string;
  field: string;
  count: number;
  sampleIds: string[];
  severity: 'critical' | 'warning' | 'info';
}

const reports: OrphanReport[] = [];

async function checkOrphans() {
  console.log('🔍 Starting Orphan Record Detection...\n');
  console.log('═'.repeat(70));
  
  // ─── Get all valid company IDs ──────────────────────────────────────
  const companies = await prisma.company.findMany({ select: { id: true, slug: true } });
  const companyIds = new Set(companies.map(c => c.id));
  console.log(`📊 Found ${companies.size} valid companies\n`);
  
  // ═══════════════════════════════════════════════════════════════════
  // 1. CRITICAL: Records with invalid companyId
  // ═══════════════════════════════════════════════════════════════════
  
  console.log('━━━ SECTION 1: Invalid Company References (CRITICAL) ━━━\n');
  
  // Check Accounts with invalid companyId
  const accountsWithInvalidCompany = await prisma.$queryRaw`
    SELECT "id", "code", "companyId" FROM "accounts" 
    WHERE "companyId" IS NOT NULL AND "companyId" NOT IN (SELECT "id" FROM "companies")
    LIMIT 20
  ` as Array<{id: string; code: string; companyId: string}>;
  
  if (accountsWithInvalidCompany.length > 0) {
    reports.push({
      table: 'accounts',
      field: 'companyId',
      count: accountsWithInvalidCompany.length,
      sampleIds: accountsWithInvalidCompany.slice(0, 5).map(a => a.id),
      severity: 'critical'
    });
    console.log(`❌ Accounts with invalid companyId: ${accountsWithInvalidCompany.length}`);
    accountsWithInvalidCompany.slice(0, 5).forEach(a => 
      console.log(`   - Account ${a.code} (ID: ${a.id}) → companyId: ${a.companyId}`)
    );
  } else {
    console.log('✅ All accounts have valid company references');
  }
  
  // Check Clients with invalid companyId
  const clientsWithInvalidCompany = await prisma.$queryRaw`
    SELECT "id", "name", "companyId" FROM "clients" 
    WHERE "companyId" IS NOT NULL AND "companyId" NOT IN (SELECT "id" FROM "companies")
    LIMIT 20
  ` as Array<{id: string; name: string; companyId: string}>;
  
  if (clientsWithInvalidCompany.length > 0) {
    reports.push({
      table: 'clients',
      field: 'companyId',
      count: clientsWithInvalidCompany.length,
      sampleIds: clientsWithInvalidCompany.slice(0, 5).map(c => c.id),
      severity: 'critical'
    });
    console.log(`❌ Clients with invalid companyId: ${clientsWithInvalidCompany.length}`);
  } else {
    console.log('✅ All clients have valid company references');
  }
  
  // Check Invoices with invalid companyId
  const invoicesWithInvalidCompany = await prisma.$queryRaw`
    SELECT "id", "invoiceNumber", "companyId" FROM "invoices" 
    WHERE "companyId" IS NOT NULL AND "companyId" NOT IN (SELECT "id" FROM "companies")
    LIMIT 20
  ` as Array<{id: string; invoiceNumber: string; companyId: string}>;
  
  if (invoicesWithInvalidCompany.length > 0) {
    reports.push({
      table: 'invoices',
      field: 'companyId',
      count: invoicesWithInvalidCompany.length,
      sampleIds: invoicesWithInvalidCompany.slice(0, 5).map(i => String(i.id)),
      severity: 'critical'
    });
    console.log(`❌ Invoices with invalid companyId: ${invoicesWithInvalidCompany.length}`);
  } else {
    console.log('✅ All invoices have valid company references');
  }
  
  // Check Journal Entries with invalid companyId
  const journalEntriesWithInvalidCompany = await prisma.$queryRaw`
    SELECT "id", "number", "companyId" FROM "journal_entries" 
    WHERE "companyId" NOT IN (SELECT "id" FROM "companies")
    LIMIT 20
  ` as Array<{id: string; number: string; companyId: string}>;
  
  if (journalEntriesWithInvalidCompany.length > 0) {
    reports.push({
      table: 'journal_entries',
      field: 'companyId',
      count: journalEntriesWithInvalidCompany.length,
      sampleIds: journalEntriesWithInvalidCompany.slice(0, 5).map(j => j.id),
      severity: 'critical'
    });
    console.log(`❌ Journal Entries with invalid companyId: ${journalEntriesWithInvalidCompany.length}`);
  } else {
    console.log('✅ All journal entries have valid company references');
  }
  
  // Check Employees with invalid companyId
  const employeesWithInvalidCompany = await prisma.$queryRaw`
    SELECT "id", "name", "companyId" FROM "hr_employees" 
    WHERE "companyId" NOT IN (SELECT "id" FROM "companies")
    LIMIT 20
  ` as Array<{id: string; name: string; companyId: string}>;
  
  if (employeesWithInvalidCompany.length > 0) {
    reports.push({
      table: 'hr_employees',
      field: 'companyId',
      count: employeesWithInvalidCompany.length,
      sampleIds: employeesWithInvalidCompany.slice(0, 5).map(e => e.id),
      severity: 'critical'
    });
    console.log(`❌ Employees with invalid companyId: ${employeesWithInvalidCompany.length}`);
  } else {
    console.log('✅ All employees have valid company references');
  }
  
  // Check Product Catalog with invalid companyId
  const productsWithInvalidCompany = await prisma.$queryRaw`
    SELECT "id", "name", "companyId" FROM "product_catalog" 
    WHERE "companyId" IS NOT NULL AND "companyId" NOT IN (SELECT "id" FROM "companies")
    LIMIT 20
  ` as Array<{id: string; name: string; companyId: string}>;
  
  if (productsWithInvalidCompany.length > 0) {
    reports.push({
      table: 'product_catalog',
      field: 'companyId',
      count: productsWithInvalidCompany.length,
      sampleIds: productsWithInvalidCompany.slice(0, 5).map(p => p.id),
      severity: 'critical'
    });
    console.log(`❌ Products with invalid companyId: ${productsWithInvalidCompany.length}`);
  } else {
    console.log('✅ All products have valid company references');
  }
  
  // Check Inventory Items with invalid productId
  const inventoryItemsWithInvalidProduct = await prisma.$queryRaw`
    SELECT "id", "productId" FROM "inventory_items" 
    WHERE "productId" NOT IN (SELECT "id" FROM "product_catalog")
    LIMIT 20
  ` as Array<{id: string; productId: string}>;
  
  if (inventoryItemsWithInvalidProduct.length > 0) {
    reports.push({
      table: 'inventory_items',
      field: 'productId',
      count: inventoryItemsWithInvalidProduct.length,
      sampleIds: inventoryItemsWithInvalidProduct.slice(0, 5).map(i => i.id),
      severity: 'critical'
    });
    console.log(`❌ Inventory Items with invalid productId: ${inventoryItemsWithInvalidProduct.length}`);
  } else {
    console.log('✅ All inventory items have valid product references');
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // 2. WARNING: Nullable Foreign Keys pointing to non-existent records
  // ═══════════════════════════════════════════════════════════════════
  
  console.log('\n━━━ SECTION 2: Broken Foreign Key References (WARNING) ━━━\n');
  
  // Invoices with clientId pointing to non-existent client
  const invoicesWithInvalidClient = await prisma.$queryRaw`
    SELECT "id", "invoiceNumber", "clientId" FROM "invoices" 
    WHERE "clientId" IS NOT NULL AND "clientId" NOT IN (SELECT "id" FROM "clients")
    LIMIT 20
  ` as Array<{id: number; invoiceNumber: string; clientId: string}>;
  
  if (invoicesWithInvalidClient.length > 0) {
    reports.push({
      table: 'invoices',
      field: 'clientId',
      count: invoicesWithInvalidClient.length,
      sampleIds: invoicesWithInvalidClient.slice(0, 5).map(i => String(i.id)),
      severity: 'warning'
    });
    console.log(`⚠️  Invoices with invalid clientId: ${invoicesWithInvalidClient.length}`);
    invoicesWithInvalidClient.slice(0, 5).forEach(i =>
      console.log(`   - Invoice #${i.invoiceNumber} (ID: ${i.id}) → clientId: ${i.clientId}`)
    );
  } else {
    console.log('✅ All invoice client references are valid');
  }
  
  // Purchase Invoices with supplierId pointing to non-existent supplier
  const purchasesWithInvalidSupplier = await prisma.$queryRaw`
    SELECT "id", "num", "supplierId" FROM "purchase_invoices" 
    WHERE "supplierId" IS NOT NULL AND "supplierId" NOT IN (SELECT "id" FROM "suppliers")
    LIMIT 20
  ` as Array<{id: string; num: string; supplierId: string}>;
  
  if (purchasesWithInvalidSupplier.length > 0) {
    reports.push({
      table: 'purchase_invoices',
      field: 'supplierId',
      count: purchasesWithInvalidSupplier.length,
      sampleIds: purchasesWithInvalidSupplier.slice(0, 5).map(p => p.id),
      severity: 'warning'
    });
    console.log(`⚠️  Purchase Invoices with invalid supplierId: ${purchasesWithInvalidSupplier.length}`);
  } else {
    console.log('✅ All purchase invoice supplier references are valid');
  }
  
  // Inventory Items with warehouseId pointing to non-existent warehouse
  const inventoryWithInvalidWarehouse = await prisma.$queryRaw`
    SELECT "id", "warehouseId" FROM "inventory_items" 
    WHERE "warehouseId" IS NOT NULL AND "warehouseId" NOT IN (SELECT "id" FROM "warehouses")
    LIMIT 20
  ` as Array<{id: string; warehouseId: string}>;
  
  if (inventoryWithInvalidWarehouse.length > 0) {
    reports.push({
      table: 'inventory_items',
      field: 'warehouseId',
      count: inventoryWithInvalidWarehouse.length,
      sampleIds: inventoryWithInvalidWarehouse.slice(0, 5).map(i => i.id),
      severity: 'warning'
    });
    console.log(`⚠️  Inventory Items with invalid warehouseId: ${inventoryWithInvalidWarehouse.length}`);
  } else {
    console.log('✅ All inventory warehouse references are valid');
  }
  
  // Payment Vouchers with invalid client/supplier
  const vouchersWithInvalidRefs = await prisma.$queryRaw`
    SELECT "id", "number", "clientId", "supplierId" FROM "payment_vouchers" 
    WHERE ("clientId" IS NOT NULL AND "clientId" NOT IN (SELECT "id" FROM "clients"))
       OR ("supplierId" IS NOT NULL AND "supplierId" NOT IN (SELECT "id" FROM "suppliers"))
    LIMIT 20
  ` as Array<{id: string; number: string; clientId: string | null; supplierId: string | null}>;
  
  if (vouchersWithInvalidRefs.length > 0) {
    reports.push({
      table: 'payment_vouchers',
      field: 'clientId/supplierId',
      count: vouchersWithInvalidRefs.length,
      sampleIds: vouchersWithInvalidRefs.slice(0, 5).map(v => v.id),
      severity: 'warning'
    });
    console.log(`⚠️  Payment Vouchers with invalid client/supplier: ${vouchersWithInvalidRefs.length}`);
  } else {
    console.log('✅ All payment voucher references are valid');
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // 3. INFO: Records missing optional parent references
  // ═══════════════════════════════════════════════════════════════════
  
  console.log('\n━━━ SECTION 3: Missing Optional References (INFO) ━━━\n');
  
  // Invoices without any company reference
  const invoicesWithoutCompany = await prisma.invoice.count({
    where: { companyId: null }
  });
  
  if (invoicesWithoutCompany > 0) {
    reports.push({
      table: 'invoices',
      field: 'companyId',
      count: invoicesWithoutCompany,
      sampleIds: [],
      severity: 'info'
    });
    console.log(`ℹ️  Invoices without companyId: ${invoicesWithoutCompany}`);
  } else {
    console.log('✅ All invoices have company references');
  }
  
  // Products without company reference
  const productsWithoutCompany = await prisma.productCatalog.count({
    where: { companyId: null }
  });
  
  if (productsWithoutCompany > 0) {
    reports.push({
      table: 'product_catalog',
      field: 'companyId',
      count: productsWithoutCompany,
      sampleIds: [],
      severity: 'info'
    });
    console.log(`ℹ️  Products without companyId: ${productsWithoutCompany}`);
  } else {
    console.log('✅ All products have company references');
  }
  
  // Clients without company reference
  const clientsWithoutCompany = await prisma.client.count({
    where: { companyId: null }
  });
  
  if (clientsWithoutCompany > 0) {
    reports.push({
      table: 'clients',
      field: 'companyId',
      count: clientsWithoutCompany,
      sampleIds: [],
      severity: 'info'
    });
    console.log(`ℹ️  Clients without companyId: ${clientsWithoutCompany}`);
  } else {
    console.log('✅ All clients have company references');
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // 4. HR-SPECIFIC: Orphaned HR records
  // ═══════════════════════════════════════════════════════════════════
  
  console.log('\n━━━ SECTION 4: HR Orphan Records ━━━\n');
  
  // Salaries with invalid employeeId
  const salariesWithInvalidEmployee = await prisma.$queryRaw`
    SELECT "id", "employeeId" FROM "hr_salaries" 
    WHERE "employeeId" NOT IN (SELECT "id" FROM "hr_employees")
    LIMIT 20
  ` as Array<{id: string; employeeId: string}>;
  
  if (salariesWithInvalidEmployee.length > 0) {
    reports.push({
      table: 'hr_salaries',
      field: 'employeeId',
      count: salariesWithInvalidEmployee.length,
      sampleIds: salariesWithInvalidEmployee.slice(0, 5).map(s => s.id),
      severity: 'critical'
    });
    console.log(`❌ Salaries with invalid employeeId: ${salariesWithInvalidEmployee.length}`);
  } else {
    console.log('✅ All salary records have valid employee references');
  }
  
  // Attendance with invalid employeeId
  const attendanceWithInvalidEmployee = await prisma.$queryRaw`
    SELECT "id", "employeeId" FROM "hr_attendance" 
    WHERE "employeeId" NOT IN (SELECT "id" FROM "hr_employees")
    LIMIT 20
  ` as Array<{id: string; employeeId: string}>;
  
  if (attendanceWithInvalidEmployee.length > 0) {
    reports.push({
      table: 'hr_attendance',
      field: 'employeeId',
      count: attendanceWithInvalidEmployee.length,
      sampleIds: attendanceWithInvalidEmployee.slice(0, 5).map(a => a.id),
      severity: 'critical'
    });
    console.log(`❌ Attendance records with invalid employeeId: ${attendanceWithInvalidEmployee.length}`);
  } else {
    console.log('✅ All attendance records have valid employee references');
  }
  
  // Commissions with invalid employeeId
  const commissionsWithInvalidEmployee = await prisma.$queryRaw`
    SELECT "id", "employeeId" FROM "hr_commissions" 
    WHERE "employeeId" NOT IN (SELECT "id" FROM "hr_employees")
    LIMIT 20
  ` as Array<{id: string; employeeId: string}>;
  
  if (commissionsWithInvalidEmployee.length > 0) {
    reports.push({
      table: 'hr_commissions',
      field: 'employeeId',
      count: commissionsWithInvalidEmployee.length,
      sampleIds: commissionsWithInvalidEmployee.slice(0, 5).map(c => c.id),
      severity: 'critical'
    });
    console.log(`❌ Commissions with invalid employeeId: ${commissionsWithInvalidEmployee.length}`);
  } else {
    console.log('✅ All commission records have valid employee references');
  }
  
  // Leave Requests with invalid employeeId
  const leavesWithInvalidEmployee = await prisma.$queryRaw`
    SELECT "id", "employeeId" FROM "hr_leave_requests" 
    WHERE "employeeId" NOT IN (SELECT "id" FROM "hr_employees")
    LIMIT 20
  ` as Array<{id: string; employeeId: string}>;
  
  if (leavesWithInvalidEmployee.length > 0) {
    reports.push({
      table: 'hr_leave_requests',
      field: 'employeeId',
      count: leavesWithInvalidEmployee.length,
      sampleIds: leavesWithInvalidEmployee.slice(0, 5).map(l => l.id),
      severity: 'critical'
    });
    console.log(`❌ Leave Requests with invalid employeeId: ${leavesWithInvalidEmployee.length}`);
  } else {
    console.log('✅ All leave request records have valid employee references');
  }
  
  // Performance reviews with invalid employeeId
  const performanceWithInvalidEmployee = await prisma.$queryRaw`
    SELECT "id", "employeeId" FROM "hr_performance" 
    WHERE "employeeId" NOT IN (SELECT "id" FROM "hr_employees")
    LIMIT 20
  ` as Array<{id: string; employeeId: string}>;
  
  if (performanceWithInvalidEmployee.length > 0) {
    reports.push({
      table: 'hr_performance',
      field: 'employeeId',
      count: performanceWithInvalidEmployee.length,
      sampleIds: performanceWithInvalidEmployee.slice(0, 5).map(p => p.id),
      severity: 'critical'
    });
    console.log(`❌ Performance Reviews with invalid employeeId: ${performanceWithInvalidEmployee.length}`);
  } else {
    console.log('✅ All performance review records have valid employee references');
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // 5. ACCOUNTING-SPECIFIC: Orphaned accounting records
  // ═══════════════════════════════════════════════════════════════════
  
  console.log('\n━━━ SECTION 5: Accounting Orphan Records ━━━\n');
  
  // Journal Entry Lines with invalid accountId
  const jeLinesWithInvalidAccount = await prisma.$queryRaw`
    SELECT "id", "accountId", "journalEntryId" FROM "journal_entry_lines" 
    WHERE "accountId" NOT IN (SELECT "id" FROM "accounts")
    LIMIT 20
  ` as Array<{id: string; accountId: string; journalEntryId: string}>;
  
  if (jeLinesWithInvalidAccount.length > 0) {
    reports.push({
      table: 'journal_entry_lines',
      field: 'accountId',
      count: jeLinesWithInvalidAccount.length,
      sampleIds: jeLinesWithInvalidAccount.slice(0, 5).map(l => l.id),
      severity: 'critical'
    });
    console.log(`❌ Journal Entry Lines with invalid accountId: ${jeLinesWithInvalidAccount.length}`);
  } else {
    console.log('✅ All journal entry lines have valid account references');
  }
  
  // Opening Balance Entries with invalid accountId or periodId
  const openingBalancesWithInvalidRefs = await prisma.$queryRaw`
    SELECT "id", "accountId", "periodId" FROM "opening_balance_entries" 
    WHERE "accountId" NOT IN (SELECT "id" FROM "accounts")
       OR "periodId" NOT IN (SELECT "id" FROM "fiscal_periods")
    LIMIT 20
  ` as Array<{id: string; accountId: string; periodId: string}>;
  
  if (openingBalancesWithInvalidRefs.length > 0) {
    reports.push({
      table: 'opening_balance_entries',
      field: 'accountId/periodId',
      count: openingBalancesWithInvalidRefs.length,
      sampleIds: openingBalancesWithInvalidRefs.slice(0, 5).map(o => o.id),
      severity: 'critical'
    });
    console.log(`❌ Opening Balance Entries with invalid refs: ${openingBalancesWithInvalidRefs.length}`);
  } else {
    console.log('✅ All opening balance entries have valid references');
  }
  
  // Budget Lines with invalid budgetId or accountId
  const budgetLinesWithInvalidRefs = await prisma.$queryRaw`
    SELECT "id", "budgetId", "accountId" FROM "budget_lines" 
    WHERE "budgetId" NOT IN (SELECT "id" FROM "budgets")
       OR ("accountId" IS NOT NULL AND "accountId" NOT IN (SELECT "id" FROM "accounts"))
    LIMIT 20
  ` as Array<{id: string; budgetId: string; accountId: string | null}>;
  
  if (budgetLinesWithInvalidRefs.length > 0) {
    reports.push({
      table: 'budget_lines',
      field: 'budgetId/accountId',
      count: budgetLinesWithInvalidRefs.length,
      sampleIds: budgetLinesWithInvalidRefs.slice(0, 5).map(b => b.id),
      severity: 'critical'
    });
    console.log(`❌ Budget Lines with invalid refs: ${budgetLinesWithInvalidRefs.length}`);
  } else {
    console.log('✅ All budget lines have valid references');
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════
  
  console.log('\n' + '═'.repeat(70));
  console.log('📋 ORPHAN RECORD DETECTION SUMMARY');
  console.log('═'.repeat(70) + '\n');
  
  const criticalCount = reports.filter(r => r.severity === 'critical').length;
  const warningCount = reports.filter(r => r.severity === 'warning').length;
  const infoCount = reports.filter(r => r.severity === 'info').length;
  
  console.log(`🔴 Critical Issues: ${criticalCount}`);
  console.log(`🟡 Warnings:       ${warningCount}`);
  console.log(`🔵 Info:           ${infoCount}`);
  console.log(`\nTotal Issues Found: ${reports.reduce((sum, r) => sum + r.count, 0)} orphan records\n`);
  
  if (reports.length === 0) {
    console.log('🎉 CONGRATULATIONS! No orphan records found!');
    console.log('   The database is clean and well-maintained.\n');
  } else {
    console.log('Detailed Report:');
    console.log('─'.repeat(70));
    
    reports.forEach((report, idx) => {
      const icon = report.severity === 'critical' ? '🔴' : report.severity === 'warning' ? '🟡' : '🔵';
      console.log(`${idx + 1}. ${icon} [${report.severity.toUpperCase()}] ${report.table}.${report.field}`);
      console.log(`   Count: ${report.count}`);
      if (report.sampleIds.length > 0) {
        console.log(`   Sample IDs: ${report.sampleIds.join(', ')}`);
      }
      console.log('');
    });
  }
  
  // Return exit code based on critical issues
  process.exit(criticalCount > 0 ? 1 : 0);
}

checkOrphans()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
