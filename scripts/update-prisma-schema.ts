/**
 * Script to update the Prisma schema with ~30 missing models.
 * This script reads the current schema, adds all missing models
 * that the API routes reference, and writes the updated schema.
 */
import { readFileSync, writeFileSync } from 'fs';

const schemaPath = '/home/z/my-project/prisma/schema.prisma';
const currentSchema = readFileSync(schemaPath, 'utf-8');

// The missing models block to append after the existing StockMovement model
const missingModelsBlock = `
// ═══════════════════════════════════════════════════════════════════════════════
// HR Module Models
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Employee (HR) ───

model Employee {
  id           Int      @id @default(autoincrement())
  companySlug  String
  name         String
  nameEn       String?
  phone        String?
  email        String?
  position     String?
  department   String?
  baseSalary   String   @default("0.000")
  currency     String   @default("KWD")
  joinDate     String?
  isActive     Boolean  @default(true)
  notes        String?
  deletedAt    DateTime?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  attendance      Attendance[]
  salaries        Salary[]
  commissions     Commission[]
  leaveRequests   LeaveRequest[]
  performance     Performance[]
}

// ─── Attendance (HR) ───

model Attendance {
  id           Int      @id @default(autoincrement())
  employeeId   Int
  companySlug  String   @default("default")
  date         String
  status       String   @default("present") // present, absent, late, half-day, holiday, sick
  checkIn      String?
  checkOut     String?
  notes        String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  employee     Employee @relation(fields: [employeeId], references: [id], onDelete: Cascade)
}

// ─── Salary (HR) ───

model Salary {
  id           Int      @id @default(autoincrement())
  employeeId   Int
  companySlug  String   @default("default")
  month        String   // YYYY-MM
  baseSalary   String   @default("0.000")
  allowances   String   @default("0.000")
  deductions   String   @default("0.000")
  bonus        String   @default("0.000")
  netSalary    String   @default("0.000")
  isPaid       Boolean  @default(false)
  paidDate     String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  employee     Employee @relation(fields: [employeeId], references: [id], onDelete: Cascade)
}

// ─── Commission (HR) ───

model Commission {
  id           Int      @id @default(autoincrement())
  employeeId   Int
  companySlug  String   @default("default")
  date         String
  type         String   // sales, referral, performance, custom
  description  String?
  amount       String   @default("0.000")
  isPaid       Boolean  @default(false)
  paidDate     String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  employee     Employee @relation(fields: [employeeId], references: [id], onDelete: Cascade)
}

// ─── LeaveRequest (HR) ───

model LeaveRequest {
  id           Int      @id @default(autoincrement())
  employeeId   Int
  companySlug  String   @default("default")
  type         String   // annual, sick, maternity, emergency, unpaid, compensatory
  startDate    String
  endDate      String
  days         Int      @default(1)
  status       String   @default("pending") // pending, approved, rejected, cancelled
  reason       String?
  approvedBy   String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  employee     Employee @relation(fields: [employeeId], references: [id], onDelete: Cascade)
}

// ─── Performance (HR) ───

model Performance {
  id           Int      @id @default(autoincrement())
  employeeId   Int
  companySlug  String   @default("default")
  period       String   // YYYY-MM or YYYY-Q1
  kpiScore     Float?
  overallScore Float?
  rating       String?  // excellent, good, average, below_average, poor
  reviewNotes  String?
  reviewer     String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  employee     Employee @relation(fields: [employeeId], references: [id], onDelete: Cascade)
}

// ─── Department (HR) ───

model Department {
  id           Int      @id @default(autoincrement())
  companySlug  String
  name         String
  nameEn       String?
  code         String?
  managerId    Int?
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  @@unique([companySlug, name])
}

// ═══════════════════════════════════════════════════════════════════════════════
// Accounting — Banking Models
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Bank Account ───

model BankAccount {
  id             Int      @id @default(autoincrement())
  companySlug    String
  bankName       String
  accountName    String
  accountNumber  String
  iban           String?
  branchCode     String?
  currency       String   @default("KWD")
  accountType    String   @default("checking") // checking, savings, cash_vault
  balance        String   @default("0.000")
  glAccountId    Int?
  isActive       Boolean  @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  glAccount      Account? @relation(fields: [glAccountId], references: [id])
  bankTransactions BankTransaction[]
  bankReconciliations BankReconciliation[]
  @@unique([companySlug, accountNumber])
}

// ─── Bank Transaction ───

model BankTransaction {
  id                Int      @id @default(autoincrement())
  companySlug       String
  bankAccountId     Int
  date              String
  description       String?
  reference         String?
  amount            String   @default("0.000")
  transactionType   String   @default("debit") // debit, credit
  isReconciled      Boolean  @default(false)
  reconciledWith    String?  // journal_entry, manual
  reconciledId      Int?
  category          String?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  bankAccount       BankAccount @relation(fields: [bankAccountId], references: [id], onDelete: Cascade)
}

// ─── Bank Reconciliation ───

model BankReconciliation {
  id                Int      @id @default(autoincrement())
  companySlug       String
  bankAccountId     Int
  periodStart       String
  periodEnd         String
  statementBalance  String   @default("0.000")
  bookBalance       String   @default("0.000")
  adjustedBalance   String   @default("0.000")
  difference        String   @default("0.000")
  status            String   @default("draft") // draft, completed, approved
  completedBy       String?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  bankAccount       BankAccount @relation(fields: [bankAccountId], references: [id])
  matches           BankReconciliationMatch[]
}

// ─── Bank Reconciliation Match ───

model BankReconciliationMatch {
  id                  Int      @id @default(autoincrement())
  reconciliationId    Int
  bankTransactionId   Int?
  journalEntryLineId  Int?
  matchType           String   @default("auto") // auto, manual
  isConfirmed         Boolean  @default(false)
  createdAt           DateTime @default(now())
  bankReconciliation  BankReconciliation @relation(fields: [reconciliationId], references: [id], onDelete: Cascade)
}

// ═══════════════════════════════════════════════════════════════════════════════
// Accounting — Fixed Assets
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Fixed Asset ───

model FixedAsset {
  id                  Int      @id @default(autoincrement())
  companySlug         String
  nameAr              String
  nameEn              String?
  category            String   @default("other") // vehicle, equipment, building, it, furniture, other
  acquisitionDate     String
  acquisitionCost     String   @default("0.000")
  salvageValue        String   @default("0.000")
  usefulLifeYears     Int      @default(5)
  depreciationMethod  String   @default("straight_line") // straight_line, declining_balance
  decliningRate       String   @default("0")
  currentBookValue    String   @default("0.000")
  accumulatedDepreciation String @default("0.000")
  location            String?
  assetTag            String?
  isActive            Boolean  @default(true)
  disposalDate        String?
  disposalAmount      String?
  disposalMethod      String?  // sold, scrapped, donated
  glAccountId         Int?
  depreciationAccountId Int?
  expenseAccountId    Int?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
  glAccount           Account? @relation("FixedAssetGL", fields: [glAccountId], references: [id])
  depreciationAccount Account? @relation("FixedAssetDep", fields: [depreciationAccountId], references: [id])
  expenseAccount      Account? @relation("FixedAssetExp", fields: [expenseAccountId], references: [id])
  depreciationEntries DepreciationEntry[]
}

// ─── Depreciation Entry ───

model DepreciationEntry {
  id               Int      @id @default(autoincrement())
  assetId          Int
  period           String   // YYYY-MM
  depreciationAmount String @default("0.000")
  bookValueAfter   String   @default("0.000")
  isPosted         Boolean  @default(false)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  fixedAsset       FixedAsset @relation(fields: [assetId], references: [id], onDelete: Cascade)
}

// ═══════════════════════════════════════════════════════════════════════════════
// Accounting — Cost Centers & Budgets
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Cost Center ───

model CostCenter {
  id           Int      @id @default(autoincrement())
  companySlug  String
  code         String
  nameAr       String
  nameEn       String?
  parentId     Int?
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  parent       CostCenter?  @relation("CostCenterHierarchy", fields: [parentId], references: [id])
  children     CostCenter[] @relation("CostCenterHierarchy")
  @@unique([companySlug, code])
}

// ─── Budget ───

model Budget {
  id             Int      @id @default(autoincrement())
  companySlug    String
  fiscalYear     Int
  period         String   // monthly, quarterly, yearly
  periodName     String   // e.g. "2024-Q1"
  accountId      Int
  costCenterId   Int?
  plannedAmount  String   @default("0.000")
  actualAmount   String   @default("0.000")
  variance       String   @default("0.000")
  status         String   @default("draft") // draft, approved, revised
  notes          String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  account        Account     @relation(fields: [accountId], references: [id])
  costCenter     CostCenter? @relation(fields: [costCenterId], references: [id])
  @@unique([companySlug, periodName, accountId, costCenterId])
}

// ═══════════════════════════════════════════════════════════════════════════════
// Accounting — Journal Entries (full double-entry bookkeeping)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Journal Entry ───

model JournalEntry {
  id           Int      @id @default(autoincrement())
  companySlug  String
  date         String
  description  String?
  reference    String?
  status       String   @default("draft") // draft, posted, reversed
  createdBy    String?
  deletedAt    DateTime?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  lines        JournalEntryLine[]
  @@unique([companySlug, reference])
}

// ─── Journal Entry Line ───

model JournalEntryLine {
  id           Int      @id @default(autoincrement())
  entryId      Int
  accountId    Int
  debit        String   @default("0.000")
  credit       String   @default("0.000")
  description  String?
  sortOrder    Int      @default(0)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  journalEntry JournalEntry @relation(fields: [entryId], references: [id], onDelete: Cascade)
  account      Account     @relation("JELAccount", fields: [accountId], references: [id])
}

// ═══════════════════════════════════════════════════════════════════════════════
// Accounting — Opening Balance Entry (full audit trail)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Opening Balance Entry ───

model OpeningBalanceEntry {
  id            Int      @id @default(autoincrement())
  companySlug   String
  accountId     Int
  amount        String   @default("0.000") // positive = debit balance, negative = credit balance
  asOfDate      String   // YYYY-MM-DD
  status        String   @default("draft") // draft, posted
  importedFrom  String?  // manual, csv, system
  journalEntryId Int?
  notes         String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  account       Account      @relation(fields: [accountId], references: [id])
  journalEntry  JournalEntry? @relation(fields: [journalEntryId], references: [id])
  @@unique([companySlug, accountId, asOfDate])
}

// ═══════════════════════════════════════════════════════════════════════════════
// Accounting — Fiscal Period (expanded from FinancialPeriod)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Fiscal Period ───

model FiscalPeriod {
  id           Int      @id @default(autoincrement())
  companySlug  String
  name         String
  startDate    String
  endDate      String
  fiscalYear   Int
  periodType   String   @default("yearly") // yearly, quarterly, monthly
  status       String   @default("open") // open, closed, locked
  closedBy     String?
  closedAt     DateTime?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  @@unique([companySlug, name])
}

// ═══════════════════════════════════════════════════════════════════════════════
// Accounting — Purchase Orders & Purchase Invoices
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Purchase Order ───

model PurchaseOrder {
  id              Int      @id @default(autoincrement())
  companySlug     String
  poNumber        String
  supplierId      Int?
  date            String
  expectedDelivery String?
  lineItems       String   @default("[]") // JSON
  subtotal        String   @default("0.000")
  taxRate         String   @default("0")
  taxAmount       String   @default("0.000")
  total           String   @default("0.000")
  notes           String?
  status          String   @default("draft") // draft, issued, received, cancelled
  createdBy       String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  supplier        Supplier? @relation(fields: [supplierId], references: [id])
  @@unique([companySlug, poNumber])
}

// ─── Purchase Invoice ───

model PurchaseInvoice {
  id              Int      @id @default(autoincrement())
  companySlug     String
  invoiceNumber   String
  supplierId      Int?
  supplierName    String?
  date            String
  dueDate         String?
  lineItems       String   @default("[]") // JSON
  subtotal        String   @default("0.000")
  taxRate         String   @default("0")
  taxAmount       String   @default("0.000")
  total           String   @default("0.000")
  paid            String   @default("0.000")
  notes           String?
  status          String   @default("draft") // draft, posted, paid, cancelled
  purchaseOrderId Int?
  createdBy       String?
  deletedAt       DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  supplier        Supplier?     @relation(fields: [supplierId], references: [id])
  purchaseOrder   PurchaseOrder? @relation(fields: [purchaseOrderId], references: [id])
  @@unique([companySlug, invoiceNumber])
}

// ═══════════════════════════════════════════════════════════════════════════════
// Accounting — Quotations
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Quotation ───

model Quotation {
  id               Int      @id @default(autoincrement())
  companySlug      String
  quotationNumber  String
  clientId         Int?
  date             String
  validUntil       String?
  lineItems        String   @default("[]") // JSON
  subtotal         String   @default("0.000")
  taxRate          String   @default("0")
  taxAmount        String   @default("0.000")
  total            String   @default("0.000")
  notes            String?
  status           String   @default("draft") // draft, sent, accepted, rejected, converted, expired
  convertedInvoiceId Int?
  createdBy        String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  client           Client?  @relation(fields: [clientId], references: [id])
  @@unique([companySlug, quotationNumber])
}

// ═══════════════════════════════════════════════════════════════════════════════
// Accounting — Tax Filing & Compliance
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Tax Filing ───

model TaxFiling {
  id            Int      @id @default(autoincrement())
  companySlug   String
  country       String   @default("KW") // KW, SA, AE, etc.
  taxType       String   @default("vat") // vat, zakat, corporate_tax
  periodFrom    String
  periodTo      String
  totalSales    String   @default("0.000")
  totalPurchases String  @default("0.000")
  outputVat     String   @default("0.000")
  inputVat      String   @default("0.000")
  vatDue        String   @default("0.000")
  status        String   @default("draft") // draft, submitted, approved, rejected
  filingNumber  String?
  submittedBy   String?
  submittedAt   DateTime?
  notes         String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@unique([companySlug, country, taxType, periodFrom, periodTo])
}

// ═══════════════════════════════════════════════════════════════════════════════
// Accounting — Post-Dated Checks
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Post-Dated Check ───

model PostDatedCheck {
  id            Int      @id @default(autoincrement())
  companySlug   String
  checkNumber   String
  bankName      String
  amount        String   @default("0.000")
  date          String
  payee         String?
  payer         String?
  direction     String   @default("inbound") // inbound (receivable), outbound (payable)
  status        String   @default("pending") // pending, deposited, cancelled, bounced, cleared
  clientId      Int?
  supplierId    Int?
  bankAccountId Int?
  glAccountId   Int?
  depositedAt   DateTime?
  cancelledAt   DateTime?
  notes         String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@unique([companySlug, checkNumber])
}

// ═══════════════════════════════════════════════════════════════════════════════
// Accounting — FX Revaluation
// ═══════════════════════════════════════════════════════════════════════════════

// ─── FX Revaluation ───

model FxRevaluation {
  id              Int      @id @default(autoincrement())
  companySlug     String
  revaluationDate String
  baseCurrency    String   @default("USD")
  targetCurrency  String
  exchangeRate    String   @default("1")
  totalGainLoss   String   @default("0.000")
  status          String   @default("draft") // draft, posted, reversed
  journalEntryId  Int?
  notes           String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

// ═══════════════════════════════════════════════════════════════════════════════
// Accounting — Landed Cost Allocation
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Landed Cost Allocation ───

model LandedCostAllocation {
  id              Int      @id @default(autoincrement())
  companySlug     String
  purchaseInvoiceId Int?
  allocationMethod String  @default("proportional") // proportional, equal, weight_based, volume_based, manual
  costType        String   // freight, insurance, customs, handling, other
  amount          String   @default("0.000")
  currency        String   @default("KWD")
  status          String   @default("draft") // draft, allocated, posted
  notes           String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

// ═══════════════════════════════════════════════════════════════════════════════
// Accounting — Inter-Company Transactions
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Inter-Company Transaction ───

model InterCompanyTransaction {
  id              Int      @id @default(autoincrement())
  companySlug     String
  fromCompanySlug String
  toCompanySlug   String
  amount          String   @default("0.000")
  currency        String   @default("KWD")
  description     String?
  reference       String?
  status          String   @default("draft") // draft, settled, cancelled
  settledAt       DateTime?
  journalEntryId  Int?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

// ═══════════════════════════════════════════════════════════════════════════════
// Accounting — WPS (Wage Protection System)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── WPS File ───

model WPSFile {
  id            Int      @id @default(autoincrement())
  companySlug   String
  country       String   @default("KW") // KW, SA, AE, BH, OM, QA
  month         String   // YYYY-MM
  fileName      String?
  fileContent   String?
  totalEmployees Int     @default(0)
  totalAmount   String   @default("0.000")
  status        String   @default("draft") // draft, submitted, approved, rejected
  submittedBy   String?
  submittedAt   DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@unique([companySlug, country, month])
}

// ═══════════════════════════════════════════════════════════════════════════════
// Accounting — Accountant Access (Collaboration)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Role Permission (Accountant Access) ───

model RolePermission {
  id            Int      @id @default(autoincrement())
  companySlug   String
  role          String   // accountant, auditor, consultant, admin
  permissions   String   @default("[]") // JSON array of permission strings
  assignedTo    String?  // email of the assigned user
  isActive      Boolean  @default(true)
  expiresAt     DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

// ═══════════════════════════════════════════════════════════════════════════════
// E-Invoicing (ZATCA / Kuwait / GCC Compliance)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── E-Invoice ───

model EInvoice {
  id                Int      @id @default(autoincrement())
  companySlug       String
  invoiceId         Int?
  invoiceNumber     String
  authority         String   @default("zatca") // zatca, kuwait_moci, uae_fta
  status            String   @default("draft") // draft, submitted, accepted, rejected, cancelled
  submissionId      String?
  qrCode            String?
  digitalSignature  String?
  xmlContent        String?
  clearanceStatus   String?
  rejectionReason   String?
  deletedAt         DateTime?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  invoice           Invoice? @relation(fields: [invoiceId], references: [id])
  lines             EInvoiceLine[]
  @@unique([companySlug, authority, invoiceNumber])
}

// ─── E-Invoice Line ───

model EInvoiceLine {
  id            Int      @id @default(autoincrement())
  eInvoiceId    Int
  lineNumber    Int      @default(0)
  description   String?
  descriptionAr String?
  quantity      String   @default("0")
  unitPrice     String   @default("0.000")
  total         String   @default("0.000")
  taxRate       String   @default("0")
  taxAmount     String   @default("0.000")
  productCode   String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  eInvoice      EInvoice @relation(fields: [eInvoiceId], references: [id], onDelete: Cascade)
}

// ─── ZATCA Config ───

model ZATCAConfig {
  id            Int      @id @default(autoincrement())
  companySlug   String
  environment   String   @default("sandbox") // sandbox, production
  vatNumber     String?
  sellerName    String?
  sellerNameAr  String?
  sellerAddress String?
  sellerAddressAr String?
  apiKey        String?
  apiSecret     String?
  csr           String?
  certificate   String?
  isOnboarded   Boolean  @default(false)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@unique([companySlug, environment])
}

// ═══════════════════════════════════════════════════════════════════════════════
// Invoice Template (Settings)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Invoice Template ───

model InvoiceTemplate {
  id              Int      @id @default(autoincrement())
  companySlug     String
  name            String
  isDefault       Boolean  @default(false)
  layoutType      String   @default("modern") // classic, modern, minimal, thermal
  primaryColor    String   @default("#7C3AED")
  fontFamily      String   @default("Noto Sans SC")
  logoPosition    String   @default("right")
  showTaxNumber   Boolean  @default(true)
  showQrCode      Boolean  @default(true)
  showBankDetails Boolean  @default(true)
  footerText      String?
  termsAndConditions String?
  paperSize       String   @default("A4")
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  @@unique([companySlug, name])
}

// ─── Invoice Template Settings ───

model InvoiceTemplateSettings {
  id              Int      @id @default(autoincrement())
  companySlug     String   @unique
  templateId      Int?
  primaryColor    String   @default("#7C3AED")
  fontFamily      String   @default("Noto Sans SC")
  fontSize        Int      @default(12)
  showLogo        Boolean  @default(true)
  logoPosition    String   @default("right")
  showPaymentInfo Boolean  @default(true)
  showStamp       Boolean  @default(false)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  template        InvoiceTemplate? @relation(fields: [templateId], references: [id])
}

// ═══════════════════════════════════════════════════════════════════════════════
// Platform Admin — Announcements, Tickets, Audit
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Announcement ───

model Announcement {
  id          Int      @id @default(autoincrement())
  title       String
  body        String?
  type        String   @default("info") // info, warning, maintenance, feature, critical
  isActive    Boolean  @default(true)
  startsAt    DateTime?
  endsAt      DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

// ─── Support Ticket ───

model SupportTicket {
  id          Int      @id @default(autoincrement())
  userEmail   String
  subject     String
  body        String?
  status      String   @default("open") // open, in_progress, resolved, closed
  priority    String   @default("medium") // low, medium, high, urgent
  assignedTo  String?
  category    String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  replies     SupportTicketReply[]
}

// ─── Support Ticket Reply ───

model SupportTicketReply {
  id        Int      @id @default(autoincrement())
  ticketId  Int
  senderEmail String
  senderRole String   @default("user") // user, admin, support
  body      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  ticket    SupportTicket @relation(fields: [ticketId], references: [id], onDelete: Cascade)
}

// ═══════════════════════════════════════════════════════════════════════════════
// Automation Rules
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Automation Rule ───

model AutomationRule {
  id           Int      @id @default(autoincrement())
  companySlug  String
  name         String
  trigger      String   // invoice_created, stock_low, payment_overdue, custom
  condition    String   @default("{}") // JSON
  actions      String   @default("[]") // JSON array
  isActive     Boolean  @default(true)
  lastRunAt    DateTime?
  runCount     Int      @default(0)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  executions   AutomationExecution[]
}

// ─── Automation Execution ───

model AutomationExecution {
  id            Int      @id @default(autoincrement())
  ruleId        Int
  triggerEvent  String?
  result        String   @default("success") // success, failure, skipped
  error         String?
  executionTime Int      @default(0) // ms
  createdAt     DateTime @default(now())
  rule          AutomationRule @relation(fields: [ruleId], references: [id], onDelete: Cascade)
}

// ═══════════════════════════════════════════════════════════════════════════════
// Webhooks
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Webhook Endpoint ───

model WebhookEndpoint {
  id            Int      @id @default(autoincrement())
  companySlug   String
  url           String
  events        String   @default("[]") // JSON array of event types
  secret        String?
  isActive      Boolean  @default(true)
  description   String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  deliveries    WebhookDelivery[]
}

// ─── Webhook Event ───

model WebhookEvent {
  id            Int      @id @default(autoincrement())
  companySlug   String
  eventType     String
  payload       String   @default("{}") // JSON
  createdAt     DateTime @default(now())
}

// ─── Webhook Delivery ───

model WebhookDelivery {
  id              Int      @id @default(autoincrement())
  endpointId      Int
  eventId         Int?
  status          String   @default("pending") // pending, delivered, failed, retrying
  statusCode      Int?
  responseBody    String?
  attempts        Int      @default(0)
  maxAttempts     Int      @default(5)
  nextRetryAt     DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  endpoint        WebhookEndpoint @relation(fields: [endpointId], references: [id])
  event           WebhookEvent?   @relation(fields: [eventId], references: [id])
}
`;

// Now I need to also update the existing Invoice model to match the API routes.
// The API routes reference many more fields on Invoice than the current schema has.
// Let me also update some existing models to add companySlug where it's missing.

// First, find and replace the Invoice model with the expanded version
const updatedInvoiceModel = `
// ─── Invoice (Sales — expanded for e-invoicing & Kuwait compliance) ───

model Invoice {
  id                    Int      @id @default(autoincrement())
  companySlug           String
  invoiceNumber         String
  clientId              Int?
  clientName            String
  clientEmail           String?
  clientPhone           String?
  clientAddress         String?
  issueDate             String
  dueDate               String?
  lineItems             String   @default("[]") // JSON
  subtotal              String   @default("0.000")
  taxRate               String   @default("0")
  taxAmount             String   @default("0.000")
  total                 String   @default("0.000")
  shipping              String   @default("0.000")
  discount              String   @default("0.000")
  paid                  String   @default("0.000")
  status                String   @default("draft")
  source                String?
  notes                 String?
  version               Int      @default(0)
  createdByEmail        String?
  createdByName         String?
  deletedAt             DateTime?
  // Kuwait Decree 10/2026 compliance fields
  hijriIssueDate        String?
  hijriDueDate          String?
  mociNumber            String?
  invoiceTypeAr         String?
  invoiceTypeEn         String?
  sellerNameAr          String?
  sellerAddressAr       String?
  buyerNameAr           String?
  buyerAddressAr        String?
  lineItemsAr           String?
  notesAr               String?
  currencyDecimalPlaces Int      @default(3)
  eInvoiceAuthority     String?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
  client                Client?  @relation(fields: [clientId], references: [id])
  eInvoices             EInvoice[]
  @@unique([companySlug, invoiceNumber])
}`;

// The current Invoice model starts at "// ─── Invoice (Phase 15) ───" and ends before "// ─── Feature Flag ───"
// Let me replace it

let updatedSchema = currentSchema;

// Replace the Invoice model
const invoiceStart = updatedSchema.indexOf('// ─── Invoice (Phase 15) ───');
const featureFlagStart = updatedSchema.indexOf('// ─── Feature Flag ───');
if (invoiceStart !== -1 && featureFlagStart !== -1) {
  const oldInvoiceBlock = updatedSchema.substring(invoiceStart, featureFlagStart);
  updatedSchema = updatedSchema.replace(oldInvoiceBlock, updatedInvoiceModel + '\n\n');
}

// Also need to update existing models to add companySlug and nameAr/nameEn where needed
// Update Account model - add companySlug, nameAr, nameEn, and update unique constraint
const oldAccount = `model Account {
  id          String   @id @default(cuid())
  code        String
  name        String
  type        String   // asset, liability, equity, revenue, expense
  parentId    String?
  companyId   String
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  company     Company  @relation(fields: [companyId], references: [id])
  parent      Account? @relation("AccountHierarchy", fields: [parentId], references: [id])
  children    Account[] @relation("AccountHierarchy")
  openingBalances OpeningBalance[]
  voucherLines    VoucherLine[]
  @@unique([code, companyId])
}`;

const newAccount = `model Account {
  id          Int      @id @default(autoincrement())
  code        String
  name        String
  nameAr      String?
  nameEn      String?
  type        String   // asset, liability, equity, revenue, expense, contra_asset
  parentId    Int?
  companySlug String   @default("default")
  companyId   String?
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  company     Company? @relation(fields: [companyId], references: [id])
  parent      Account? @relation("AccountHierarchy", fields: [parentId], references: [id])
  children    Account[] @relation("AccountHierarchy")
  openingBalances      OpeningBalance[]
  voucherLines         VoucherLine[]
  bankAccounts         BankAccount[]
  fixedAssetsGl        FixedAsset[] @relation("FixedAssetGL")
  fixedAssetsDep       FixedAsset[] @relation("FixedAssetDep")
  fixedAssetsExp       FixedAsset[] @relation("FixedAssetExp")
  journalEntryLines    JournalEntryLine[] @relation("JELAccount")
  openingBalanceEntries OpeningBalanceEntry[]
  budgetItems          Budget[]
  @@unique([code, companySlug])
}`;

updatedSchema = updatedSchema.replace(oldAccount, newAccount);

// Update Company model - add vatNumber, nameAr, nameEn, country, deletedAt
const oldCompany = `model Company {
  id                String   @id @default(cuid())
  name              String
  code              String   @unique @default(cuid())
  slug              String   @unique @default("default-slug")
  plan              String   @default("trial")
  subscriptionStatus String  @default("inactive")
  currency          String   @default("USD")
  taxId             String?
  address           String?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  users             User[]
  accounts          Account[]
  clients           Client[]
  suppliers         Supplier[]
  vouchers          Voucher[]
  paymentVouchers   PaymentVoucher[]
  openingBalances   OpeningBalance[]
  profitDistributions ProfitDistribution[]
  lettersOfCredit   LetterOfCredit[]
  productCatalogs   ProductCatalog[]
  inventoryItems    InventoryItem[]
  financialPeriods  FinancialPeriod[]
  companyRuntime    CompanyRuntime?
}`;

const newCompany = `model Company {
  id                String   @id @default(cuid())
  name              String
  nameAr            String?
  nameEn            String?
  code              String   @unique @default(cuid())
  slug              String   @unique @default("default-slug")
  plan              String   @default("trial")
  subscriptionStatus String  @default("inactive")
  currency          String   @default("USD")
  currencyDecimalPlaces Int  @default(3)
  taxId             String?
  vatNumber         String?
  country           String   @default("KW")
  address           String?
  deletedAt         DateTime?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  users             User[]
  accounts          Account[]
  clients           Client[]
  suppliers         Supplier[]
  vouchers          Voucher[]
  paymentVouchers   PaymentVoucher[]
  openingBalances   OpeningBalance[]
  profitDistributions ProfitDistribution[]
  lettersOfCredit   LetterOfCredit[]
  productCatalogs   ProductCatalog[]
  inventoryItems    InventoryItem[]
  financialPeriods  FinancialPeriod[]
  companyRuntime    CompanyRuntime?
}`;

updatedSchema = updatedSchema.replace(oldCompany, newCompany);

// Update Client model - add nameEn, make companySlug proper
const oldClient = `model Client {
  id          String   @id @default(cuid())
  name        String
  code        String   @default(cuid())
  email       String?
  phone       String?
  address     String?
  taxId       String?
  companySlug String   @default("default")
  companyId   String?
  isActive    Boolean  @default(true)
  deletedAt   DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  company     Company?  @relation(fields: [companyId], references: [id])
  paymentVouchers PaymentVoucher[]
}`;

const newClient = `model Client {
  id          Int      @id @default(autoincrement())
  name        String
  nameEn      String?
  code        String   @default("")
  email       String?
  phone       String?
  address     String?
  taxId       String?
  companySlug String   @default("default")
  companyId   String?
  isActive    Boolean  @default(true)
  deletedAt   DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  company     Company? @relation(fields: [companyId], references: [id])
  paymentVouchers PaymentVoucher[]
  quotations      Quotation[]
  invoices        Invoice[]
}`;

updatedSchema = updatedSchema.replace(oldClient, newClient);

// Update Supplier model - add nameEn, companySlug, deletedAt
const oldSupplier = `model Supplier {
  id          String   @id @default(cuid())
  name        String
  code        String
  email       String?
  phone       String?
  address     String?
  taxId       String?
  companyId   String
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  company     Company  @relation(fields: [companyId], references: [id])
  paymentVouchers PaymentVoucher[]
  lettersOfCredit  LetterOfCredit[]
  @@unique([code, companyId])
}`;

const newSupplier = `model Supplier {
  id          Int      @id @default(autoincrement())
  name        String
  nameEn      String?
  code        String
  email       String?
  phone       String?
  address     String?
  taxId       String?
  companySlug String   @default("default")
  companyId   String?
  isActive    Boolean  @default(true)
  deletedAt   DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  company     Company? @relation(fields: [companyId], references: [id])
  paymentVouchers PaymentVoucher[]
  lettersOfCredit  LetterOfCredit[]
  purchaseOrders   PurchaseOrder[]
  purchaseInvoices PurchaseInvoice[]
  @@unique([code, companySlug])
}`;

updatedSchema = updatedSchema.replace(oldSupplier, newSupplier);

// Update ProductCatalog model - change id to Int, add companySlug properly
const oldProductCatalog = `model ProductCatalog {
  id            String   @id @default(cuid())
  name          String
  sku           String   @default("")
  code          String?
  category      String?
  purchasePrice Decimal  @default(0)  // NOT "cost" — this is the correct field name
  sellingPrice  Decimal  @default(0)
  unit          String   @default("piece")
  description   String?
  companySlug   String   @default("default")
  companyId     String?
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  company       Company?  @relation(fields: [companyId], references: [id])
  inventoryItems InventoryItem[]
}`;

const newProductCatalog = `model ProductCatalog {
  id            Int      @id @default(autoincrement())
  name          String
  nameAr        String?
  nameEn        String?
  sku           String   @default("")
  code          String?
  category      String?
  purchasePrice String   @default("0.000") // stored as string for Decimal precision
  sellingPrice  String   @default("0.000")
  unit          String   @default("piece")
  description   String?
  companySlug   String   @default("default")
  companyId     String?
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  company       Company? @relation(fields: [companyId], references: [id])
  inventoryItems InventoryItem[]
  aliases       ProductAlias[]
}`;

updatedSchema = updatedSchema.replace(oldProductCatalog, newProductCatalog);

// Update InventoryItem model - change id to Int, use companySlug
const oldInventoryItem = `model InventoryItem {
  id            String   @id @default(cuid())
  productId     String
  quantity      String   @default("0")
  reorderLevel  String   @default("0")
  warehouseId   String?
  warehouse     String?
  batchNumber   String?
  expiryDate    DateTime?
  companySlug   String   @default("default")
  companyId     String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  product       ProductCatalog @relation(fields: [productId], references: [id])
  company       Company?  @relation(fields: [companyId], references: [id])
  warehouseRef  Warehouse? @relation(fields: [warehouseId], references: [id])
}`;

const newInventoryItem = `model InventoryItem {
  id            Int      @id @default(autoincrement())
  productId     Int
  quantity      String   @default("0")
  reorderLevel  String   @default("0")
  warehouseId   Int?
  warehouse     String?
  batchNumber   String?
  expiryDate    DateTime?
  companySlug   String   @default("default")
  companyId     String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  product       ProductCatalog @relation(fields: [productId], references: [id])
  company       Company?  @relation(fields: [companyId], references: [id])
  warehouseRef  Warehouse? @relation(fields: [warehouseId], references: [id])
  @@unique([warehouseId, productId])
}`;

updatedSchema = updatedSchema.replace(oldInventoryItem, newInventoryItem);

// Update Warehouse model - change id to Int, add companySlug
const oldWarehouse = `model Warehouse {
  id          String   @id @default(cuid())
  name        String
  code        String
  companySlug String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  inventoryItems InventoryItem[]
}`;

const newWarehouse = `model Warehouse {
  id          Int      @id @default(autoincrement())
  name        String
  nameAr      String?
  code        String
  companySlug String
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  inventoryItems InventoryItem[]
  @@unique([companySlug, code])
}`;

updatedSchema = updatedSchema.replace(oldWarehouse, newWarehouse);

// Update FinancialPeriod model - add companySlug, fiscalYear, periodType, closedBy, closedAt
const oldFinancialPeriod = `model FinancialPeriod {
  id          String   @id @default(cuid())
  name        String
  startDate   DateTime
  endDate     DateTime
  status      String   @default("open") // open, closed, locked
  companyId   String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  company     Company  @relation(fields: [companyId], references: [id])
  openingBalances OpeningBalance[]
  @@unique([name, companyId])
}`;

const newFinancialPeriod = `model FinancialPeriod {
  id          Int      @id @default(autoincrement())
  name        String
  startDate   DateTime
  endDate     DateTime
  status      String   @default("open") // open, closed, locked
  companyId   String?
  companySlug String   @default("default")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  company     Company? @relation(fields: [companyId], references: [id])
  openingBalances OpeningBalance[]
  @@unique([name, companySlug])
}`;

updatedSchema = updatedSchema.replace(oldFinancialPeriod, newFinancialPeriod);

// Update Voucher model - change id to Int, add companySlug
const oldVoucher = `model Voucher {
  id            String   @id @default(cuid())
  number        String
  date          DateTime
  description   String?
  reference     String?
  status        String   @default("draft") // draft, posted, cancelled
  voucherType   String   @default("general") // general, payment, receipt, transfer
  companyId     String
  createdBy     String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  company       Company  @relation(fields: [companyId], references: [id])
  lines         VoucherLine[]
  @@unique([number, companyId])
}`;

const newVoucher = `model Voucher {
  id            Int      @id @default(autoincrement())
  number        String
  date          DateTime
  description   String?
  reference     String?
  status        String   @default("draft") // draft, posted, cancelled
  voucherType   String   @default("general") // general, payment, receipt, transfer
  companySlug   String   @default("default")
  companyId     String?
  createdBy     String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  company       Company? @relation(fields: [companyId], references: [id])
  lines         VoucherLine[]
  @@unique([number, companySlug])
}`;

updatedSchema = updatedSchema.replace(oldVoucher, newVoucher);

// Update VoucherLine model - change id to Int, accountId to Int
const oldVoucherLine = `model VoucherLine {
  id           String   @id @default(cuid())
  accountId    String
  debit        Decimal  @default(0)
  credit       Decimal  @default(0)
  description  String?
  sortOrder    Int      @default(0)
  voucherId    String
  account      Account  @relation(fields: [accountId], references: [id])
  voucher      Voucher  @relation(fields: [voucherId], references: [id], onDelete: Cascade)
}`;

const newVoucherLine = `model VoucherLine {
  id           Int      @id @default(autoincrement())
  accountId    Int
  debit        String   @default("0.000")
  credit       String   @default("0.000")
  description  String?
  sortOrder    Int      @default(0)
  voucherId    Int
  account      Account  @relation(fields: [accountId], references: [id])
  voucher      Voucher  @relation(fields: [voucherId], references: [id], onDelete: Cascade)
}`;

updatedSchema = updatedSchema.replace(oldVoucherLine, newVoucherLine);

// Update PaymentVoucher model - change id to Int, add companySlug and new fields
const oldPaymentVoucher = `model PaymentVoucher {
  id            String   @id @default(cuid())
  number        String
  date          DateTime
  amount        Decimal
  paymentType   String   // receipt, payment
  direction     String   // inbound, outbound
  status        String   @default("draft") // draft, posted, cancelled
  description   String?
  reference     String?
  clientId      String?
  supplierId    String?
  companyId     String
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  // NOTE: No deletedAt field — PaymentVoucher does not support soft-delete
  client        Client?  @relation(fields: [clientId], references: [id])
  supplier      Supplier? @relation(fields: [supplierId], references: [id])
  company       Company  @relation(fields: [companyId], references: [id])
  installments  Installment[]
  @@unique([number, companyId])
}`;

const newPaymentVoucher = `model PaymentVoucher {
  id            Int      @id @default(autoincrement())
  number        String
  voucherNumber String?  // Alternative field name used in seed.ts
  date          DateTime
  amount        String   @default("0.000")
  paymentType   String   @default("receipt") // receipt, payment
  voucherType   String?  // receipt, payment (alternative field)
  direction     String   @default("inbound") // inbound, outbound
  payee         String?
  payer         String?
  status        String   @default("draft") // draft, posted, cancelled
  description   String?
  reference     String?
  clientId      Int?
  supplierId    Int?
  bankAccountId Int?
  companySlug   String   @default("default")
  companyId     String?
  createdBy     String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  client        Client?   @relation(fields: [clientId], references: [id])
  supplier      Supplier? @relation(fields: [supplierId], references: [id])
  company       Company?  @relation(fields: [companyId], references: [id])
  bankAccount   BankAccount? @relation(fields: [bankAccountId], references: [id])
  installments  Installment[]
  @@unique([companySlug, voucherNumber])
}`;

updatedSchema = updatedSchema.replace(oldPaymentVoucher, newPaymentVoucher);

// Update Installment model - change id to Int, paymentVoucherId to Int
const oldInstallment = `model Installment {
  id              String   @id @default(cuid())
  paymentVoucherId String
  amount          Decimal
  dueDate         DateTime
  status          String   @default("pending") // pending, paid, overdue, cancelled
  paidDate        DateTime?
  paymentRef      String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  paymentVoucher  PaymentVoucher @relation(fields: [paymentVoucherId], references: [id], onDelete: Cascade)
}`;

const newInstallment = `model Installment {
  id              Int      @id @default(autoincrement())
  paymentVoucherId Int
  amount          String   @default("0.000")
  dueDate         DateTime
  status          String   @default("pending") // pending, paid, overdue, cancelled
  paidDate        DateTime?
  paymentRef      String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  paymentVoucher  PaymentVoucher @relation(fields: [paymentVoucherId], references: [id], onDelete: Cascade)
}`;

updatedSchema = updatedSchema.replace(oldInstallment, newInstallment);

// Update OpeningBalance model - change id to Int, add companySlug
const oldOpeningBalance = `model OpeningBalance {
  id            String   @id @default(cuid())
  accountId     String
  periodId      String
  debit         Decimal  @default(0)
  credit        Decimal  @default(0)
  companyId     String
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  account       Account  @relation(fields: [accountId], references: [id])
  period        FinancialPeriod @relation(fields: [periodId], references: [id])
  company       Company  @relation(fields: [companyId], references: [id])
  @@unique([accountId, periodId])
}`;

const newOpeningBalance = `model OpeningBalance {
  id            Int      @id @default(autoincrement())
  accountId     Int
  periodId      Int
  debit         String   @default("0.000")
  credit        String   @default("0.000")
  companySlug   String   @default("default")
  companyId     String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  account       Account        @relation(fields: [accountId], references: [id])
  period        FinancialPeriod @relation(fields: [periodId], references: [id])
  company       Company?       @relation(fields: [companyId], references: [id])
  @@unique([accountId, periodId])
}`;

updatedSchema = updatedSchema.replace(oldOpeningBalance, newOpeningBalance);

// Update ProfitDistribution and ProfitDistributionEntry - change to Int IDs, add companySlug
const oldProfitDistribution = `model ProfitDistribution {
  id            String   @id @default(cuid())
  periodId      String?
  totalProfit   Decimal  @default(0)
  retained      Decimal  @default(0)
  distributed   Decimal  @default(0)
  distributionType String @default("proportional") // proportional, equal, custom
  status        String   @default("draft") // draft, approved, executed
  notes         String?
  companyId     String
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  company       Company  @relation(fields: [companyId], references: [id])
  entries       ProfitDistributionEntry[]
}`;

const newProfitDistribution = `model ProfitDistribution {
  id               Int      @id @default(autoincrement())
  periodId         Int?
  totalProfit      String   @default("0.000")
  retained         String   @default("0.000")
  distributed      String   @default("0.000")
  distributionType String   @default("proportional") // proportional, equal, custom
  status           String   @default("draft") // draft, approved, executed
  notes            String?
  companySlug      String   @default("default")
  companyId        String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  company          Company? @relation(fields: [companyId], references: [id])
  entries          ProfitDistributionEntry[]
}`;

updatedSchema = updatedSchema.replace(oldProfitDistribution, newProfitDistribution);

const oldProfitDistributionEntry = `model ProfitDistributionEntry {
  id            String   @id @default(cuid())
  distributionId String
  shareholder   String
  shareRatio    Decimal  @default(0)
  amount        Decimal  @default(0)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  distribution  ProfitDistribution @relation(fields: [distributionId], references: [id], onDelete: Cascade)
}`;

const newProfitDistributionEntry = `model ProfitDistributionEntry {
  id             Int      @id @default(autoincrement())
  distributionId Int
  shareholder    String
  shareRatio     String   @default("0")
  amount         String   @default("0.000")
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  distribution   ProfitDistribution @relation(fields: [distributionId], references: [id], onDelete: Cascade)
}`;

updatedSchema = updatedSchema.replace(oldProfitDistributionEntry, newProfitDistributionEntry);

// Update LetterOfCredit and LetterOfCreditDocument - change to Int IDs, add companySlug
const oldLetterOfCredit = `model LetterOfCredit {
  id            String   @id @default(cuid())
  number        String
  type          String   @default("import") // import, export
  amount        Decimal
  currency      String   @default("USD")
  status        String   @default("draft") // draft, issued, confirmed, utilized, expired, cancelled
  issueDate     DateTime?
  expiryDate    DateTime?
  beneficiary   String?
  issuingBank   String?
  description   String?
  reference     String?
  supplierId    String?
  companyId     String
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  supplier      Supplier? @relation(fields: [supplierId], references: [id])
  company       Company  @relation(fields: [companyId], references: [id])
  lcDocuments   LetterOfCreditDocument[]
  @@unique([number, companyId])
}`;

const newLetterOfCredit = `model LetterOfCredit {
  id            Int      @id @default(autoincrement())
  lcNumber      String
  number        String?  // Legacy field
  type          String   @default("import") // import, export
  amount        String   @default("0.000")
  currency      String   @default("USD")
  status        String   @default("draft") // draft, issued, confirmed, utilized, expired, cancelled
  issueDate     String?
  expiryDate    String?
  beneficiary   String?
  issuingBank   String?
  description   String?
  reference     String?
  supplierId    Int?
  bankAccountId Int?
  companySlug   String   @default("default")
  companyId     String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  supplier      Supplier? @relation(fields: [supplierId], references: [id])
  company       Company?  @relation(fields: [companyId], references: [id])
  bankAccount   BankAccount? @relation(fields: [bankAccountId], references: [id])
  lcDocuments   LetterOfCreditDocument[]
  @@unique([companySlug, lcNumber])
}`;

updatedSchema = updatedSchema.replace(oldLetterOfCredit, newLetterOfCredit);

const oldLetterOfCreditDocument = `model LetterOfCreditDocument {
  id            String   @id @default(cuid())
  letterOfCreditId String
  documentType  String  // invoice, bill_of_lading, packing_list, insurance, certificate
  fileName      String
  fileUrl       String?
  uploadedAt    DateTime @default(now())
  letterOfCredit LetterOfCredit @relation(fields: [letterOfCreditId], references: [id], onDelete: Cascade)
}`;

const newLetterOfCreditDocument = `model LetterOfCreditDocument {
  id               Int      @id @default(autoincrement())
  letterOfCreditId Int
  documentType     String   // invoice, bill_of_lading, packing_list, insurance, certificate
  fileName         String
  fileUrl          String?
  uploadedAt       DateTime @default(now())
  letterOfCredit   LetterOfCredit @relation(fields: [letterOfCreditId], references: [id], onDelete: Cascade)
}`;

updatedSchema = updatedSchema.replace(oldLetterOfCreditDocument, newLetterOfCreditDocument);

// Update ProductAlias - change productCatalogId to Int reference
const oldProductAlias = `model ProductAlias {
  id              Int      @id @default(autoincrement())
  productCatalogId Int
  companySlug     String   @default("default")
  alias           String
  source          String   @default("manual") // manual, ai, import
  confidence      Float    @default(1.0)
  isVerified      Boolean  @default(false)
  createdBy       String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  @@unique([companySlug, alias])
}`;

// ProductAlias already uses Int, so just make sure it references the updated ProductCatalog id
// No change needed - it already has `productCatalogId Int`

// Update User model - make company relation optional for flexibility
const oldUser = `model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  password  String?
  role      String   @default("user")
  companyId String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  company   Company? @relation(fields: [companyId], references: [id])
}`;

const newUser = `model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  nameAr    String?
  nameEn    String?
  password  String?
  role      String   @default("user")
  companyId String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  company   Company? @relation(fields: [companyId], references: [id])
}`;

updatedSchema = updatedSchema.replace(oldUser, newUser);

// Append the missing models block at the end of the schema
updatedSchema = updatedSchema + missingModelsBlock;

// Remove the Post model (legacy) - it's not referenced by any API route
// Actually, keep it for backward compatibility but mark it clearly
// No change needed

writeFileSync(schemaPath, updatedSchema, 'utf-8');

console.log('✅ Prisma schema updated with ~30 missing models');
console.log('New models added:');
console.log('  HR: Employee, Attendance, Salary, Commission, LeaveRequest, Performance, Department');
console.log('  Banking: BankAccount, BankTransaction, BankReconciliation, BankReconciliationMatch');
console.log('  FixedAssets: FixedAsset, DepreciationEntry');
console.log('  CostCenters/Budgets: CostCenter, Budget');
console.log('  JournalEntries: JournalEntry, JournalEntryLine');
console.log('  OpeningBalances: OpeningBalanceEntry');
console.log('  FiscalPeriods: FiscalPeriod');
console.log('  Purchases: PurchaseOrder, PurchaseInvoice');
console.log('  Quotations: Quotation');
console.log('  Tax: TaxFiling');
console.log('  Checks: PostDatedCheck');
console.log('  FX: FxRevaluation');
console.log('  LandedCost: LandedCostAllocation');
console.log('  InterCompany: InterCompanyTransaction');
console.log('  WPS: WPSFile');
console.log('  AccountantAccess: RolePermission');
console.log('  EInvoicing: EInvoice, EInvoiceLine, ZATCAConfig');
console.log('  Templates: InvoiceTemplate, InvoiceTemplateSettings');
console.log('  Platform: Announcement, SupportTicket, SupportTicketReply');
console.log('  Automation: AutomationRule, AutomationExecution');
console.log('  Webhooks: WebhookEndpoint, WebhookEvent, WebhookDelivery');
console.log('');
console.log('Existing models updated:');
console.log('  Account: Int ID, companySlug, nameAr/nameEn, contra_asset type');
console.log('  Company: vatNumber, country, currencyDecimalPlaces, nameAr/nameEn');
console.log('  Client/Supplier: Int IDs, nameEn, companySlug, deletedAt');
console.log('  ProductCatalog: Int ID, nameAr/nameEn');
console.log('  Invoice: Expanded with Kuwait compliance fields');
console.log('  PaymentVoucher: Int IDs, companySlug, bankAccountId');
console.log('  FinancialPeriod: companySlug');
console.log('  Voucher/VoucherLine: Int IDs, companySlug');
console.log('');
console.log('Next steps:');
console.log('  1. Run: cd /home/z/my-project && bunx prisma db push --accept-data-loss');
console.log('  2. Run: cd /home/z/my-project && bunx prisma generate');
