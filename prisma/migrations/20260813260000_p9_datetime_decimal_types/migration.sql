-- ═══════════════════════════════════════════════════════════════════════════
-- P9: DateTime + Decimal type reconciliation
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Problem
-- -------
-- Many schema.prisma fields are declared as DateTime or Decimal, but the
-- corresponding DB columns are TEXT. This causes Prisma runtime errors:
--
--   - DateTime fields: Prisma sends a Date, Postgres rejects with
--     "invalid byte sequence for encoding UTF8: 0x00" (Postgres tries to
--     interpret the binary date as UTF8 text)
--   - Decimal fields: Prisma sends a number, Postgres may silently coerce
--     to text but arithmetic comparisons break
--
-- Affected columns (17 DateTime + 9 Decimal = 26 total):
--   DateTime (17): inventory_items.expiryDate, fiscal_periods.startDate,
--     fiscal_periods.endDate, journal_entries.date, payment_vouchers.date,
--     letters_of_credit.issueDate, letters_of_credit.expiryDate,
--     bank_transactions.date, hr_attendance.date, hr_attendance.checkIn,
--     hr_attendance.checkOut, hr_leave_requests.startDate,
--     hr_leave_requests.endDate, invoices.issueDate, invoices.dueDate,
--     purchase_orders.expectedDelivery, post_dated_checks.dueDate
--
--   Decimal (9): inventory_items.quantity, inventory_items.reorderLevel,
--     installment_schedules.amount, profit_distributions.totalProfit,
--     profit_distribution_entries.shareRatio,
--     profit_distribution_entries.amount, budget_lines.plannedAmount,
--     budget_lines.actualAmount, hr_performance.rating
--
-- Strategy
-- --------
-- ALTER COLUMN TYPE for each. USING clauses handle the conversion:
--   TEXT → TIMESTAMP(3): cast text to timestamp (NULL stays NULL)
--   TEXT → DECIMAL(65,30): cast text to numeric (NULL stays NULL)
--
-- All wrapped in DO blocks for idempotency.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── DateTime columns: TEXT → TIMESTAMP(3) ─────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_items' AND column_name = 'expiryDate' AND data_type = 'text') THEN
    ALTER TABLE "inventory_items" ALTER COLUMN "expiryDate" TYPE TIMESTAMP(3) USING "expiryDate"::timestamp;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fiscal_periods' AND column_name = 'startDate' AND data_type = 'text') THEN
    ALTER TABLE "fiscal_periods" ALTER COLUMN "startDate" TYPE TIMESTAMP(3) USING "startDate"::timestamp;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fiscal_periods' AND column_name = 'endDate' AND data_type = 'text') THEN
    ALTER TABLE "fiscal_periods" ALTER COLUMN "endDate" TYPE TIMESTAMP(3) USING "endDate"::timestamp;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journal_entries' AND column_name = 'date' AND data_type = 'text') THEN
    ALTER TABLE "journal_entries" ALTER COLUMN "date" TYPE TIMESTAMP(3) USING "date"::timestamp;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payment_vouchers' AND column_name = 'date' AND data_type = 'text') THEN
    ALTER TABLE "payment_vouchers" ALTER COLUMN "date" TYPE TIMESTAMP(3) USING "date"::timestamp;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'letters_of_credit' AND column_name = 'issueDate' AND data_type = 'text') THEN
    ALTER TABLE "letters_of_credit" ALTER COLUMN "issueDate" TYPE TIMESTAMP(3) USING "issueDate"::timestamp;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'letters_of_credit' AND column_name = 'expiryDate' AND data_type = 'text') THEN
    ALTER TABLE "letters_of_credit" ALTER COLUMN "expiryDate" TYPE TIMESTAMP(3) USING "expiryDate"::timestamp;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bank_transactions' AND column_name = 'date' AND data_type = 'text') THEN
    ALTER TABLE "bank_transactions" ALTER COLUMN "date" TYPE TIMESTAMP(3) USING "date"::timestamp;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hr_attendance' AND column_name = 'date' AND data_type = 'text') THEN
    ALTER TABLE "hr_attendance" ALTER COLUMN "date" TYPE TIMESTAMP(3) USING "date"::timestamp;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hr_attendance' AND column_name = 'checkIn' AND data_type = 'text') THEN
    ALTER TABLE "hr_attendance" ALTER COLUMN "checkIn" TYPE TIMESTAMP(3) USING "checkIn"::timestamp;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hr_attendance' AND column_name = 'checkOut' AND data_type = 'text') THEN
    ALTER TABLE "hr_attendance" ALTER COLUMN "checkOut" TYPE TIMESTAMP(3) USING "checkOut"::timestamp;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hr_leave_requests' AND column_name = 'startDate' AND data_type = 'text') THEN
    ALTER TABLE "hr_leave_requests" ALTER COLUMN "startDate" TYPE TIMESTAMP(3) USING "startDate"::timestamp;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hr_leave_requests' AND column_name = 'endDate' AND data_type = 'text') THEN
    ALTER TABLE "hr_leave_requests" ALTER COLUMN "endDate" TYPE TIMESTAMP(3) USING "endDate"::timestamp;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'issueDate' AND data_type = 'text') THEN
    ALTER TABLE "invoices" ALTER COLUMN "issueDate" TYPE TIMESTAMP(3) USING "issueDate"::timestamp;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'dueDate' AND data_type = 'text') THEN
    ALTER TABLE "invoices" ALTER COLUMN "dueDate" TYPE TIMESTAMP(3) USING "dueDate"::timestamp;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_orders' AND column_name = 'expectedDelivery' AND data_type = 'text') THEN
    ALTER TABLE "purchase_orders" ALTER COLUMN "expectedDelivery" TYPE TIMESTAMP(3) USING "expectedDelivery"::timestamp;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'post_dated_checks' AND column_name = 'dueDate' AND data_type = 'text') THEN
    ALTER TABLE "post_dated_checks" ALTER COLUMN "dueDate" TYPE TIMESTAMP(3) USING "dueDate"::timestamp;
  END IF;
END $$;

-- ─── Decimal columns: TEXT → DECIMAL(65,30) ────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_items' AND column_name = 'quantity' AND data_type = 'text') THEN
    ALTER TABLE "inventory_items" ALTER COLUMN "quantity" TYPE DECIMAL(65,30) USING "quantity"::numeric;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_items' AND column_name = 'reorderLevel' AND data_type = 'text') THEN
    ALTER TABLE "inventory_items" ALTER COLUMN "reorderLevel" TYPE DECIMAL(65,30) USING "reorderLevel"::numeric;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'installment_schedules' AND column_name = 'amount' AND data_type = 'text') THEN
    ALTER TABLE "installment_schedules" ALTER COLUMN "amount" TYPE DECIMAL(65,30) USING "amount"::numeric;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profit_distributions' AND column_name = 'totalProfit' AND data_type = 'text') THEN
    ALTER TABLE "profit_distributions" ALTER COLUMN "totalProfit" TYPE DECIMAL(65,30) USING "totalProfit"::numeric;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profit_distribution_entries' AND column_name = 'shareRatio' AND data_type = 'text') THEN
    ALTER TABLE "profit_distribution_entries" ALTER COLUMN "shareRatio" TYPE DECIMAL(65,30) USING "shareRatio"::numeric;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profit_distribution_entries' AND column_name = 'amount' AND data_type = 'text') THEN
    ALTER TABLE "profit_distribution_entries" ALTER COLUMN "amount" TYPE DECIMAL(65,30) USING "amount"::numeric;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'budget_lines' AND column_name = 'plannedAmount' AND data_type = 'text') THEN
    ALTER TABLE "budget_lines" ALTER COLUMN "plannedAmount" TYPE DECIMAL(65,30) USING "plannedAmount"::numeric;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'budget_lines' AND column_name = 'actualAmount' AND data_type = 'text') THEN
    ALTER TABLE "budget_lines" ALTER COLUMN "actualAmount" TYPE DECIMAL(65,30) USING "actualAmount"::numeric;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hr_performance' AND column_name = 'rating' AND data_type = 'text') THEN
    ALTER TABLE "hr_performance" ALTER COLUMN "rating" TYPE DECIMAL(65,30) USING "rating"::numeric;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- End of P9 migration.
-- ═══════════════════════════════════════════════════════════════════════════
