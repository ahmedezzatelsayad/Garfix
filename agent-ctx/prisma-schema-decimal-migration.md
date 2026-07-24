# Task: Update Prisma schema with Decimal monetary fields + add missing models

## Agent: Schema Architect
## Date: 2026-03-04

## Summary
Updated the Prisma schema from 17 models (324 lines) to **105 models (2315 lines)**, adding all missing models referenced by the API code and migration SQL, with all monetary/financial fields using Decimal type instead of String.

## Models Added (88 new models)
The original schema had 17 models. 88 new models were added:

### Core Platform
- AppUser, EmailVerification, MFASecret, SessionRegistry, SetupWizardProgress

### Accounting & Finance
- JournalEntry, JournalEntryLine, FiscalPeriod, CostCenter, EInvoice
- BankAccount, BankTransaction, BankReconciliation, PostDatedCheck
- FixedAsset, DepreciationEntry, LandedCostAllocation, LandedCostLine
- FxRevaluation, InterCompanyTransaction, WpsFile, TaxFiling
- OpeningBalanceEntry, AccountingAuditLog, PaymentVoucher, Installment, InstallmentSchedule
- Budget, LetterOfCredit, LetterOfCreditDocument
- Quotation, PurchaseOrder, PurchaseInvoice, SalesReturn, PurchaseReturn

### HR
- Employee, HRSalary, HRCommission, HRAttendance, HRLeaveRequest, HRPerformance

### Sales & Orders
- Invoice (complete structure with Kuwait compliance fields), OrderDelivery

### Payments & SaaS
- PaymentTransaction, RefundTransaction, SubscriptionSchedule
- PaymentProviderConfig, PaymentsVault

### Platform Admin
- FeatureFlag, Announcement, LandingContent, PlatformSettings, PlatformSettingsHistory
- AdminAuditLog, SupportTicket, TicketReply, ReviewQueue
- Permission, RolePermission, AuditLog, TamperEvidenceChain

### Webhooks & Notifications
- WebhookEndpoint, WebhookDelivery, Notification

### AI & ML
- AIProcessingLog, AIUsageLog, AIModelRegistry, AIBenchmarkResult
- AIRequestLog, AIFabricCacheEntry, AIMemoryEntry, AIMemoryNote
- InvoiceBrainTemplate, InvoiceBrainHeaderMap
- RuleCandidate, GlobalPattern, AiScoreSnapshot, CompiledRule
- CompanyRuntime, BudgetConfig, ProviderConfig, ProfitSnapshot

### Product Matching
- ProductAlias, ProductMatchAudit, MatchOverride

### Inventory
- Warehouse, StockMovement, ProductCatalog (updated structure)

### Other
- ChatHistory, UserWorkspaceState, JobQueue, IdempotencyKey
- Module, AutomationRule, AutomationExecutionLog
- InvoiceTemplate, InvoiceTemplateSettings
- ProfitDistribution, ProfitDistributionEntry (preserved from original)

## Existing Models Updated (9 models significantly changed)
- **Company**: Changed from String cuid ID to Int autoincrement, added `slug` (unique), `defaultTaxRate` (Decimal), `country`, `nameAr`, `vatNumber`, `commercialRegistration`, `plan`, `subscriptionStatus`, WhatsApp fields, `currentBillingCycleEnd`, and all proper relation arrays
- **Account**: Changed to Int id, added `companySlug` (instead of companyId), `nameAr`, `nameEn`, `balance` (Decimal), `currency`
- **Client**: Changed to Int id, added `companySlug`, `deletedAt`, `deletedBy`, renamed `company` String field to `clientCompany` to avoid collision with Company relation
- **Supplier**: Changed to Int id, added `companySlug`, `nameEn`, `deletedAt`
- **ProductCatalog**: Changed to Int id, added `code`, `aliases`, `companySlug`, `wholesalePrice` (Decimal?), updated `purchasePrice`/`sellingPrice` to Decimal?
- **InventoryItem**: Changed to Int id, added `companySlug`, `warehouseId`, proper relations
- **FinancialPeriod** (now FiscalPeriod): Changed to Int id, added `companySlug`, `fiscalYear`, `periodType`, `closedBy`, `closedAt`
- **Voucher** (now JournalEntry): Changed to Int id, added `companySlug`, `currency`, `reversedById`, `sourceType`, `sourceId`, `deletedAt`, `deletedBy`
- **VoucherLine** (now JournalEntryLine): Changed to Int id, `debit`/`credit` as Decimal, added `costCenterId`

## Decimal Fields (87 total)
All 36 migration steps are covered with proper Decimal types:

| Step | Model | Fields |
|------|-------|--------|
| 1 | Invoice | subtotal, taxRate, taxAmount, total, shipping, discount, paid |
| 2 | PurchaseInvoice | totalAmount |
| 3 | Quotation | subtotal, taxRate, taxAmount, total |
| 4 | PurchaseOrder | subtotal, taxRate, taxAmount, total |
| 5 | Company | defaultTaxRate |
| 6 | ProductCatalog | purchasePrice, sellingPrice, wholesalePrice |
| 7 | SalesReturn | totalAmount |
| 8 | PurchaseReturn | totalAmount |
| 9 | Account | balance |
| 10 | JournalEntryLine | debit, credit |
| 11 | Employee | baseSalary, allowances |
| 12 | HRSalary | baseSalary, allowances, deductions, bonus, netSalary |
| 13 | HRCommission | amount |
| 14 | PaymentTransaction | amount |
| 15 | RefundTransaction | refundAmount |
| 16 | SubscriptionSchedule | amount |
| 17 | OrderDelivery | deliveryFee |
| 18 | BankAccount | balance |
| 19 | BankTransaction | amount |
| 20 | BankReconciliation | statementBalance, bookBalance, adjustedBalance, difference |
| 21 | PostDatedCheck | amount |
| 22 | InstallmentSchedule | totalAmount |
| 23 | Installment | amount, paidAmount |
| 24 | FixedAsset | acquisitionCost, salvageValue, decliningRate, currentBookValue, accumulatedDepreciation, disposalAmount |
| 25 | DepreciationEntry | depreciationAmount, bookValueAfter |
| 26 | PaymentVoucher | amount |
| 27 | Budget | plannedAmount, actualAmount, variance |
| 28 | LetterOfCredit | amount, utilizationAmount |
| 29 | LandedCostAllocation | totalCost |
| 30 | LandedCostLine | allocatedCost, baseQuantity, baseValue |
| 31 | FxRevaluation | rate, realizedGain, realizedLoss, unrealizedGain, unrealizedLoss |
| 32 | InterCompanyTransaction | amount |
| 33 | WpsFile | totalAmount |
| 34 | TaxFiling | totalSales, totalPurchases, vatDue |
| 35 | OpeningBalanceEntry | amount |
| 36 | StockMovement | unitCost, totalCost |

## Validation
- `npx prisma@6 format` — ✅ Passed (formatted successfully, no validation errors)
- All @@map directives map model names to actual SQL table names
- All @@unique constraints match migration indexes
- All Decimal fields use `@default(0)` for required fields and `Decimal?` for nullable ones
