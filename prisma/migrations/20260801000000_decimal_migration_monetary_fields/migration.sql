-- P1: Decimal migration for monetary fields
-- Migrates all String fields representing monetary/numeric amounts to Decimal(65,30)
-- for accurate arithmetic on PostgreSQL. String was used originally for SQLite compatibility.
--
-- IMPORTANT: This migration uses USING clauses to cast existing string data to numeric.
-- Columns with default("0") or default("") are handled by setting defaults first.
-- Nullable columns (String?) become Decimal? and NULL values are preserved.
--
-- Step 1: Invoice monetary fields
ALTER TABLE "invoices" ALTER COLUMN "subtotal" TYPE Decimal(65,30) USING "subtotal"::Decimal;
ALTER TABLE "invoices" ALTER COLUMN "subtotal" SET DEFAULT 0;
ALTER TABLE "invoices" ALTER COLUMN "taxRate" TYPE Decimal(65,30) USING "taxRate"::Decimal;
ALTER TABLE "invoices" ALTER COLUMN "taxRate" SET DEFAULT 0;
ALTER TABLE "invoices" ALTER COLUMN "taxAmount" TYPE Decimal(65,30) USING "taxAmount"::Decimal;
ALTER TABLE "invoices" ALTER COLUMN "taxAmount" SET DEFAULT 0;
ALTER TABLE "invoices" ALTER COLUMN "total" TYPE Decimal(65,30) USING "total"::Decimal;
ALTER TABLE "invoices" ALTER COLUMN "total" SET DEFAULT 0;
ALTER TABLE "invoices" ALTER COLUMN "shipping" TYPE Decimal(65,30) USING "shipping"::Decimal;
ALTER TABLE "invoices" ALTER COLUMN "shipping" SET DEFAULT 0;
ALTER TABLE "invoices" ALTER COLUMN "discount" TYPE Decimal(65,30) USING "discount"::Decimal;
ALTER TABLE "invoices" ALTER COLUMN "discount" SET DEFAULT 0;
ALTER TABLE "invoices" ALTER COLUMN "paid" TYPE Decimal(65,30) USING "paid"::Decimal;
ALTER TABLE "invoices" ALTER COLUMN "paid" SET DEFAULT 0;

-- Step 2: PurchaseInvoice monetary field
ALTER TABLE "purchase_invoices" ALTER COLUMN "totalAmount" TYPE Decimal(65,30) USING "totalAmount"::Decimal;
ALTER TABLE "purchase_invoices" ALTER COLUMN "totalAmount" SET DEFAULT 0;

-- Step 3: Quotation monetary fields
ALTER TABLE "quotations" ALTER COLUMN "subtotal" TYPE Decimal(65,30) USING "subtotal"::Decimal;
ALTER TABLE "quotations" ALTER COLUMN "subtotal" SET DEFAULT 0;
ALTER TABLE "quotations" ALTER COLUMN "taxRate" TYPE Decimal(65,30) USING "taxRate"::Decimal;
ALTER TABLE "quotations" ALTER COLUMN "taxRate" SET DEFAULT 0;
ALTER TABLE "quotations" ALTER COLUMN "taxAmount" TYPE Decimal(65,30) USING "taxAmount"::Decimal;
ALTER TABLE "quotations" ALTER COLUMN "taxAmount" SET DEFAULT 0;
ALTER TABLE "quotations" ALTER COLUMN "total" TYPE Decimal(65,30) USING "total"::Decimal;
ALTER TABLE "quotations" ALTER COLUMN "total" SET DEFAULT 0;

-- Step 4: PurchaseOrder monetary fields
ALTER TABLE "purchase_orders" ALTER COLUMN "subtotal" TYPE Decimal(65,30) USING "subtotal"::Decimal;
ALTER TABLE "purchase_orders" ALTER COLUMN "subtotal" SET DEFAULT 0;
ALTER TABLE "purchase_orders" ALTER COLUMN "taxRate" TYPE Decimal(65,30) USING "taxRate"::Decimal;
ALTER TABLE "purchase_orders" ALTER COLUMN "taxRate" SET DEFAULT 0;
ALTER TABLE "purchase_orders" ALTER COLUMN "taxAmount" TYPE Decimal(65,30) USING "taxAmount"::Decimal;
ALTER TABLE "purchase_orders" ALTER COLUMN "taxAmount" SET DEFAULT 0;
ALTER TABLE "purchase_orders" ALTER COLUMN "total" TYPE Decimal(65,30) USING "total"::Decimal;
ALTER TABLE "purchase_orders" ALTER COLUMN "total" SET DEFAULT 0;

-- Step 5: Company.defaultTaxRate
ALTER TABLE "companies" ALTER COLUMN "defaultTaxRate" TYPE Decimal(65,30) USING "defaultTaxRate"::Decimal;
ALTER TABLE "companies" ALTER COLUMN "defaultTaxRate" SET DEFAULT 0;

-- Step 6: ProductCatalog price fields (nullable)
ALTER TABLE "product_catalog" ALTER COLUMN "purchasePrice" TYPE Decimal(65,30) USING "purchasePrice"::Decimal;
ALTER TABLE "product_catalog" ALTER COLUMN "sellingPrice" TYPE Decimal(65,30) USING "sellingPrice"::Decimal;
ALTER TABLE "product_catalog" ALTER COLUMN "wholesalePrice" TYPE Decimal(65,30) USING "wholesalePrice"::Decimal;

-- Step 7: SalesReturn.totalAmount
ALTER TABLE "sales_returns" ALTER COLUMN "totalAmount" TYPE Decimal(65,30) USING "totalAmount"::Decimal;
ALTER TABLE "sales_returns" ALTER COLUMN "totalAmount" SET DEFAULT 0;

-- Step 8: PurchaseReturn.totalAmount
ALTER TABLE "purchase_returns" ALTER COLUMN "totalAmount" TYPE Decimal(65,30) USING "totalAmount"::Decimal;
ALTER TABLE "purchase_returns" ALTER COLUMN "totalAmount" SET DEFAULT 0;

-- Step 9: Account.balance
ALTER TABLE "accounts" ALTER COLUMN "balance" TYPE Decimal(65,30) USING "balance"::Decimal;
ALTER TABLE "accounts" ALTER COLUMN "balance" SET DEFAULT 0;

-- Step 10: JournalEntryLine debit/credit
ALTER TABLE "journal_entry_lines" ALTER COLUMN "debit" TYPE Decimal(65,30) USING "debit"::Decimal;
ALTER TABLE "journal_entry_lines" ALTER COLUMN "debit" SET DEFAULT 0;
ALTER TABLE "journal_entry_lines" ALTER COLUMN "credit" TYPE Decimal(65,30) USING "credit"::Decimal;
ALTER TABLE "journal_entry_lines" ALTER COLUMN "credit" SET DEFAULT 0;

-- Step 11: Employee salary fields
ALTER TABLE "hr_employees" ALTER COLUMN "baseSalary" TYPE Decimal(65,30) USING "baseSalary"::Decimal;
ALTER TABLE "hr_employees" ALTER COLUMN "baseSalary" SET DEFAULT 0;
ALTER TABLE "hr_employees" ALTER COLUMN "allowances" TYPE Decimal(65,30) USING "allowances"::Decimal;
ALTER TABLE "hr_employees" ALTER COLUMN "allowances" SET DEFAULT 0;

-- Step 12: Salary fields
ALTER TABLE "hr_salaries" ALTER COLUMN "baseSalary" TYPE Decimal(65,30) USING "baseSalary"::Decimal;
ALTER TABLE "hr_salaries" ALTER COLUMN "baseSalary" SET DEFAULT 0;
ALTER TABLE "hr_salaries" ALTER COLUMN "allowances" TYPE Decimal(65,30) USING "allowances"::Decimal;
ALTER TABLE "hr_salaries" ALTER COLUMN "allowances" SET DEFAULT 0;
ALTER TABLE "hr_salaries" ALTER COLUMN "deductions" TYPE Decimal(65,30) USING "deductions"::Decimal;
ALTER TABLE "hr_salaries" ALTER COLUMN "deductions" SET DEFAULT 0;
ALTER TABLE "hr_salaries" ALTER COLUMN "bonus" TYPE Decimal(65,30) USING "bonus"::Decimal;
ALTER TABLE "hr_salaries" ALTER COLUMN "bonus" SET DEFAULT 0;
ALTER TABLE "hr_salaries" ALTER COLUMN "netSalary" TYPE Decimal(65,30) USING "netSalary"::Decimal;
ALTER TABLE "hr_salaries" ALTER COLUMN "netSalary" SET DEFAULT 0;

-- Step 13: Commission.amount
ALTER TABLE "hr_commissions" ALTER COLUMN "amount" TYPE Decimal(65,30) USING "amount"::Decimal;
ALTER TABLE "hr_commissions" ALTER COLUMN "amount" SET DEFAULT 0;

-- Step 14: PaymentTransaction.amount
ALTER TABLE "payment_transactions" ALTER COLUMN "amount" TYPE Decimal(65,30) USING "amount"::Decimal;
ALTER TABLE "payment_transactions" ALTER COLUMN "amount" SET DEFAULT 0;

-- Step 15: RefundTransaction.refundAmount
ALTER TABLE "refund_transactions" ALTER COLUMN "refundAmount" TYPE Decimal(65,30) USING "refundAmount"::Decimal;
ALTER TABLE "refund_transactions" ALTER COLUMN "refundAmount" SET DEFAULT 0;

-- Step 16: SubscriptionSchedule.amount
ALTER TABLE "subscription_schedules" ALTER COLUMN "amount" TYPE Decimal(65,30) USING "amount"::Decimal;
ALTER TABLE "subscription_schedules" ALTER COLUMN "amount" SET DEFAULT 0;

-- Step 17: OrderDelivery.deliveryFee
ALTER TABLE "order_deliveries" ALTER COLUMN "deliveryFee" TYPE Decimal(65,30) USING "deliveryFee"::Decimal;
ALTER TABLE "order_deliveries" ALTER COLUMN "deliveryFee" SET DEFAULT 0;

-- Step 18: BankAccount.balance
ALTER TABLE "bank_accounts" ALTER COLUMN "balance" TYPE Decimal(65,30) USING "balance"::Decimal;
ALTER TABLE "bank_accounts" ALTER COLUMN "balance" SET DEFAULT 0;

-- Step 19: BankTransaction.amount
ALTER TABLE "bank_transactions" ALTER COLUMN "amount" TYPE Decimal(65,30) USING "amount"::Decimal;
ALTER TABLE "bank_transactions" ALTER COLUMN "amount" SET DEFAULT 0;

-- Step 20: BankReconciliation monetary fields
ALTER TABLE "bank_reconciliations" ALTER COLUMN "statementBalance" TYPE Decimal(65,30) USING "statementBalance"::Decimal;
ALTER TABLE "bank_reconciliations" ALTER COLUMN "statementBalance" SET DEFAULT 0;
ALTER TABLE "bank_reconciliations" ALTER COLUMN "bookBalance" TYPE Decimal(65,30) USING "bookBalance"::Decimal;
ALTER TABLE "bank_reconciliations" ALTER COLUMN "bookBalance" SET DEFAULT 0;
ALTER TABLE "bank_reconciliations" ALTER COLUMN "adjustedBalance" TYPE Decimal(65,30) USING "adjustedBalance"::Decimal;
ALTER TABLE "bank_reconciliations" ALTER COLUMN "adjustedBalance" SET DEFAULT 0;
ALTER TABLE "bank_reconciliations" ALTER COLUMN "difference" TYPE Decimal(65,30) USING "difference"::Decimal;
ALTER TABLE "bank_reconciliations" ALTER COLUMN "difference" SET DEFAULT 0;

-- Step 21: PostDatedCheck.amount
ALTER TABLE "post_dated_checks" ALTER COLUMN "amount" TYPE Decimal(65,30) USING "amount"::Decimal;
ALTER TABLE "post_dated_checks" ALTER COLUMN "amount" SET DEFAULT 0;

-- Step 22: InstallmentSchedule.totalAmount
ALTER TABLE "installment_schedules" ALTER COLUMN "totalAmount" TYPE Decimal(65,30) USING "totalAmount"::Decimal;
ALTER TABLE "installment_schedules" ALTER COLUMN "totalAmount" SET DEFAULT 0;

-- Step 23: Installment.amount and paidAmount
ALTER TABLE "installments" ALTER COLUMN "amount" TYPE Decimal(65,30) USING "amount"::Decimal;
ALTER TABLE "installments" ALTER COLUMN "amount" SET DEFAULT 0;
ALTER TABLE "installments" ALTER COLUMN "paidAmount" TYPE Decimal(65,30) USING "paidAmount"::Decimal;
ALTER TABLE "installments" ALTER COLUMN "paidAmount" SET DEFAULT 0;

-- Step 24: FixedAsset monetary fields
ALTER TABLE "fixed_assets" ALTER COLUMN "acquisitionCost" TYPE Decimal(65,30) USING "acquisitionCost"::Decimal;
ALTER TABLE "fixed_assets" ALTER COLUMN "acquisitionCost" SET DEFAULT 0;
ALTER TABLE "fixed_assets" ALTER COLUMN "salvageValue" TYPE Decimal(65,30) USING "salvageValue"::Decimal;
ALTER TABLE "fixed_assets" ALTER COLUMN "salvageValue" SET DEFAULT 0;
ALTER TABLE "fixed_assets" ALTER COLUMN "decliningRate" TYPE Decimal(65,30) USING "decliningRate"::Decimal;
ALTER TABLE "fixed_assets" ALTER COLUMN "decliningRate" SET DEFAULT 0;
ALTER TABLE "fixed_assets" ALTER COLUMN "currentBookValue" TYPE Decimal(65,30) USING "currentBookValue"::Decimal;
ALTER TABLE "fixed_assets" ALTER COLUMN "currentBookValue" SET DEFAULT 0;
ALTER TABLE "fixed_assets" ALTER COLUMN "accumulatedDepreciation" TYPE Decimal(65,30) USING "accumulatedDepreciation"::Decimal;
ALTER TABLE "fixed_assets" ALTER COLUMN "accumulatedDepreciation" SET DEFAULT 0;
ALTER TABLE "fixed_assets" ALTER COLUMN "disposalAmount" TYPE Decimal(65,30) USING "disposalAmount"::Decimal;

-- Step 25: DepreciationEntry fields
ALTER TABLE "depreciation_entries" ALTER COLUMN "depreciationAmount" TYPE Decimal(65,30) USING "depreciationAmount"::Decimal;
ALTER TABLE "depreciation_entries" ALTER COLUMN "depreciationAmount" SET DEFAULT 0;
ALTER TABLE "depreciation_entries" ALTER COLUMN "bookValueAfter" TYPE Decimal(65,30) USING "bookValueAfter"::Decimal;
ALTER TABLE "depreciation_entries" ALTER COLUMN "bookValueAfter" SET DEFAULT 0;

-- Step 26: PaymentVoucher.amount
ALTER TABLE "payment_vouchers" ALTER COLUMN "amount" TYPE Decimal(65,30) USING "amount"::Decimal;
ALTER TABLE "payment_vouchers" ALTER COLUMN "amount" SET DEFAULT 0;

-- Step 27: Budget monetary fields
ALTER TABLE "budgets" ALTER COLUMN "plannedAmount" TYPE Decimal(65,30) USING "plannedAmount"::Decimal;
ALTER TABLE "budgets" ALTER COLUMN "plannedAmount" SET DEFAULT 0;
ALTER TABLE "budgets" ALTER COLUMN "actualAmount" TYPE Decimal(65,30) USING "actualAmount"::Decimal;
ALTER TABLE "budgets" ALTER COLUMN "actualAmount" SET DEFAULT 0;
ALTER TABLE "budgets" ALTER COLUMN "variance" TYPE Decimal(65,30) USING "variance"::Decimal;
ALTER TABLE "budgets" ALTER COLUMN "variance" SET DEFAULT 0;

-- Step 28: LetterOfCredit monetary fields
ALTER TABLE "letters_of_credit" ALTER COLUMN "amount" TYPE Decimal(65,30) USING "amount"::Decimal;
ALTER TABLE "letters_of_credit" ALTER COLUMN "amount" SET DEFAULT 0;
ALTER TABLE "letters_of_credit" ALTER COLUMN "utilizationAmount" TYPE Decimal(65,30) USING "utilizationAmount"::Decimal;
ALTER TABLE "letters_of_credit" ALTER COLUMN "utilizationAmount" SET DEFAULT 0;

-- Step 29: LandedCostAllocation.totalCost
ALTER TABLE "landed_cost_allocations" ALTER COLUMN "totalCost" TYPE Decimal(65,30) USING "totalCost"::Decimal;
ALTER TABLE "landed_cost_allocations" ALTER COLUMN "totalCost" SET DEFAULT 0;

-- Step 30: LandedCostLine monetary fields
ALTER TABLE "landed_cost_lines" ALTER COLUMN "allocatedCost" TYPE Decimal(65,30) USING "allocatedCost"::Decimal;
ALTER TABLE "landed_cost_lines" ALTER COLUMN "allocatedCost" SET DEFAULT 0;
ALTER TABLE "landed_cost_lines" ALTER COLUMN "baseQuantity" TYPE Decimal(65,30) USING "baseQuantity"::Decimal;
ALTER TABLE "landed_cost_lines" ALTER COLUMN "baseValue" TYPE Decimal(65,30) USING "baseValue"::Decimal;

-- Step 31: FxRevaluation monetary fields
ALTER TABLE "fx_revaluations" ALTER COLUMN "rate" TYPE Decimal(65,30) USING "rate"::Decimal;
ALTER TABLE "fx_revaluations" ALTER COLUMN "rate" SET DEFAULT 0;
ALTER TABLE "fx_revaluations" ALTER COLUMN "realizedGain" TYPE Decimal(65,30) USING "realizedGain"::Decimal;
ALTER TABLE "fx_revaluations" ALTER COLUMN "realizedGain" SET DEFAULT 0;
ALTER TABLE "fx_revaluations" ALTER COLUMN "realizedLoss" TYPE Decimal(65,30) USING "realizedLoss"::Decimal;
ALTER TABLE "fx_revaluations" ALTER COLUMN "realizedLoss" SET DEFAULT 0;
ALTER TABLE "fx_revaluations" ALTER COLUMN "unrealizedGain" TYPE Decimal(65,30) USING "unrealizedGain"::Decimal;
ALTER TABLE "fx_revaluations" ALTER COLUMN "unrealizedGain" SET DEFAULT 0;
ALTER TABLE "fx_revaluations" ALTER COLUMN "unrealizedLoss" TYPE Decimal(65,30) USING "unrealizedLoss"::Decimal;
ALTER TABLE "fx_revaluations" ALTER COLUMN "unrealizedLoss" SET DEFAULT 0;

-- Step 32: InterCompanyTransaction.amount
ALTER TABLE "inter_company_transactions" ALTER COLUMN "amount" TYPE Decimal(65,30) USING "amount"::Decimal;
ALTER TABLE "inter_company_transactions" ALTER COLUMN "amount" SET DEFAULT 0;

-- Step 33: WpsFile.totalAmount
ALTER TABLE "wps_files" ALTER COLUMN "totalAmount" TYPE Decimal(65,30) USING "totalAmount"::Decimal;
ALTER TABLE "wps_files" ALTER COLUMN "totalAmount" SET DEFAULT 0;

-- Step 34: TaxFiling monetary fields
ALTER TABLE "tax_filings" ALTER COLUMN "totalSales" TYPE Decimal(65,30) USING "totalSales"::Decimal;
ALTER TABLE "tax_filings" ALTER COLUMN "totalSales" SET DEFAULT 0;
ALTER TABLE "tax_filings" ALTER COLUMN "totalPurchases" TYPE Decimal(65,30) USING "totalPurchases"::Decimal;
ALTER TABLE "tax_filings" ALTER COLUMN "totalPurchases" SET DEFAULT 0;
ALTER TABLE "tax_filings" ALTER COLUMN "vatDue" TYPE Decimal(65,30) USING "vatDue"::Decimal;
ALTER TABLE "tax_filings" ALTER COLUMN "vatDue" SET DEFAULT 0;

-- Step 35: OpeningBalanceEntry.amount
ALTER TABLE "opening_balance_entries" ALTER COLUMN "amount" TYPE Decimal(65,30) USING "amount"::Decimal;
ALTER TABLE "opening_balance_entries" ALTER COLUMN "amount" SET DEFAULT 0;

-- Step 36: StockMovement cost fields (nullable)
ALTER TABLE "stock_movements" ALTER COLUMN "unitCost" TYPE Decimal(65,30) USING "unitCost"::Decimal;
ALTER TABLE "stock_movements" ALTER COLUMN "totalCost" TYPE Decimal(65,30) USING "totalCost"::Decimal;
