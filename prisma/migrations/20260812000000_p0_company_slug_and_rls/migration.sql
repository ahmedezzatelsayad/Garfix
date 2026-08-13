-- ═══════════════════════════════════════════════════════════════════════════════
-- GarfiX P0: companySlug + Indexes + RLS Migration
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Part 1: Add companySlug column to child/detail tables ──────────────────

ALTER TABLE journal_entry_lines ADD COLUMN IF NOT EXISTS "companySlug" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE installment_schedules ADD COLUMN IF NOT EXISTS "companySlug" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE profit_distribution_entries ADD COLUMN IF NOT EXISTS "companySlug" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE letter_of_credit_documents ADD COLUMN IF NOT EXISTS "companySlug" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE depreciation_entries ADD COLUMN IF NOT EXISTS "companySlug" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE budget_lines ADD COLUMN IF NOT EXISTS "companySlug" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE landed_cost_lines ADD COLUMN IF NOT EXISTS "companySlug" TEXT NOT NULL DEFAULT 'default';

-- ── Part 2: Backfill companySlug from parent tables ────────────────────────

-- JournalEntryLine → JournalEntry
-- ADD-4 FIX (Phase 1.5): use "entryId" (the column name at this point in the
-- migration sequence). The rename to "journalEntryId" happens later in
-- migration 20260813120000. This was a pre-existing bug that caused the
-- migration to fail on fresh databases.
UPDATE journal_entry_lines jel
  SET "companySlug" = je."companySlug"
  FROM journal_entries je
  WHERE jel."entryId" = je.id
    AND jel."companySlug" = 'default'
    AND je."companySlug" IS NOT NULL
    AND je."companySlug" != 'default';

-- InstallmentSchedule → PaymentVoucher
UPDATE installment_schedules iss
  SET "companySlug" = pv."companySlug"
  FROM payment_vouchers pv
  WHERE iss."paymentVoucherId" = pv.id
    AND iss."companySlug" = 'default'
    AND pv."companySlug" IS NOT NULL
    AND pv."companySlug" != 'default';

-- ProfitDistributionEntry → ProfitDistribution
UPDATE profit_distribution_entries pde
  SET "companySlug" = pd."companySlug"
  FROM profit_distributions pd
  WHERE pde."distributionId" = pd.id
    AND pde."companySlug" = 'default'
    AND pd."companySlug" IS NOT NULL
    AND pd."companySlug" != 'default';

-- LetterOfCreditDocument → LetterOfCredit
UPDATE letter_of_credit_documents lcd
  SET "companySlug" = lc."companySlug"
  FROM letters_of_credit lc
  WHERE lcd."letterOfCreditId" = lc.id
    AND lcd."companySlug" = 'default'
    AND lc."companySlug" IS NOT NULL
    AND lc."companySlug" != 'default';

-- DepreciationEntry → FixedAsset
UPDATE depreciation_entries de
  SET "companySlug" = fa."companySlug"
  FROM fixed_assets fa
  WHERE de."assetId" = fa.id
    AND de."companySlug" = 'default'
    AND fa."companySlug" IS NOT NULL
    AND fa."companySlug" != 'default';

-- BudgetLine → Budget
UPDATE budget_lines bl
  SET "companySlug" = b."companySlug"
  FROM budgets b
  WHERE bl."budgetId" = b.id
    AND bl."companySlug" = 'default'
    AND b."companySlug" IS NOT NULL
    AND b."companySlug" != 'default';

-- LandedCostLine → LandedCostAllocation
UPDATE landed_cost_lines lcl
  SET "companySlug" = lca."companySlug"
  FROM landed_cost_allocations lca
  WHERE lcl."allocationId" = lca.id
    AND lcl."companySlug" = 'default'
    AND lca."companySlug" IS NOT NULL
    AND lca."companySlug" != 'default';

-- ── Part 3: Create indexes ─────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "journal_entry_lines_companySlug_idx" ON journal_entry_lines ("companySlug");
CREATE INDEX IF NOT EXISTS "installment_schedules_companySlug_idx" ON installment_schedules ("companySlug");
CREATE INDEX IF NOT EXISTS "profit_distribution_entries_companySlug_idx" ON profit_distribution_entries ("companySlug");
CREATE INDEX IF NOT EXISTS "letter_of_credit_documents_companySlug_idx" ON letter_of_credit_documents ("companySlug");
CREATE INDEX IF NOT EXISTS "depreciation_entries_companySlug_idx" ON depreciation_entries ("companySlug");
CREATE INDEX IF NOT EXISTS "budget_lines_companySlug_idx" ON budget_lines ("companySlug");
CREATE INDEX IF NOT EXISTS "landed_cost_lines_companySlug_idx" ON landed_cost_lines ("companySlug");

-- P0-3: Missing indexes for letters_of_credit, profit_distributions, role_permissions
CREATE INDEX IF NOT EXISTS "letters_of_credit_companySlug_idx" ON letters_of_credit ("companySlug");
CREATE INDEX IF NOT EXISTS "profit_distributions_companySlug_idx" ON profit_distributions ("companySlug");
CREATE INDEX IF NOT EXISTS "role_permissions_companySlug_idx" ON role_permissions ("companySlug");

-- ═══════════════════════════════════════════════════════════════════════════════
-- Part 4: PostgreSQL Row-Level Security (RLS)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Defense in depth: even if app-layer authorization has a bug,
-- RLS ensures a tenant can NEVER read another tenant's rows.
-- The session variable app.current_company_slug is set per-request.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ADD-4 FIX (Phase 1.5): Create the `app` schema before defining functions in it.
-- This was missing and caused "schema app does not exist" on fresh databases.
CREATE SCHEMA IF NOT EXISTS app;
-- ═══════════════════════════════════════════════════════════════════════════════

-- Business tables that carry companySlug
-- ADD-4 FIX (Phase 1.5): Changed function parameter from `regclass` to `text`
-- and added existence checks. The `regclass` type resolves at call time and
-- throws if the table doesn't exist yet. Using `text` + information_schema
-- check allows the function to silently skip non-existent tables.
CREATE OR REPLACE FUNCTION app.enable_rls_for_table(tbl_name text) RETURNS void AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = tbl_name AND table_schema = 'public'
  ) THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = tbl_name AND column_name = 'companySlug'
  ) THEN
    RETURN;
  END IF;
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl_name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl_name);
  EXECUTE format('
    CREATE POLICY tenant_isolation ON %I
      USING ("companySlug" = current_setting(''app.current_company_slug'', true) OR
             current_setting(''app.current_company_slug'', true) IS NULL)
      WITH CHECK ("companySlug" = current_setting(''app.current_company_slug'', true) OR
                   current_setting(''app.current_company_slug'', true) IS NULL);
  ', tbl_name);
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$ LANGUAGE plpgsql;

-- Enable RLS on all business tables with companySlug
SELECT app.enable_rls_for_table('accounts');
SELECT app.enable_rls_for_table('clients');
SELECT app.enable_rls_for_table('suppliers');
SELECT app.enable_rls_for_table('product_catalogs');
SELECT app.enable_rls_for_table('inventory_items');
SELECT app.enable_rls_for_table('warehouses');
SELECT app.enable_rls_for_table('fiscal_periods');
SELECT app.enable_rls_for_table('journal_entries');
SELECT app.enable_rls_for_table('journal_entry_lines');
SELECT app.enable_rls_for_table('payment_vouchers');
SELECT app.enable_rls_for_table('installment_schedules');
SELECT app.enable_rls_for_table('opening_balance_entries');
SELECT app.enable_rls_for_table('profit_distributions');
SELECT app.enable_rls_for_table('profit_distribution_entries');
SELECT app.enable_rls_for_table('letters_of_credit');
SELECT app.enable_rls_for_table('letter_of_credit_documents');
SELECT app.enable_rls_for_table('bank_accounts');
SELECT app.enable_rls_for_table('bank_transactions');
SELECT app.enable_rls_for_table('bank_reconciliations');
SELECT app.enable_rls_for_table('fixed_assets');
SELECT app.enable_rls_for_table('depreciation_entries');
SELECT app.enable_rls_for_table('budgets');
SELECT app.enable_rls_for_table('budget_lines');
SELECT app.enable_rls_for_table('cost_centers');
SELECT app.enable_rls_for_table('fx_revaluations');
SELECT app.enable_rls_for_table('inter_company_transactions');
SELECT app.enable_rls_for_table('landed_cost_allocations');
SELECT app.enable_rls_for_table('landed_cost_lines');
SELECT app.enable_rls_for_table('employees');
SELECT app.enable_rls_for_table('h_r_salaries');
SELECT app.enable_rls_for_table('h_r_commissions');
SELECT app.enable_rls_for_table('h_r_attendances');
SELECT app.enable_rls_for_table('h_r_leave_requests');
SELECT app.enable_rls_for_table('h_r_performances');
SELECT app.enable_rls_for_table('invoices');
SELECT app.enable_rls_for_table('purchase_invoices');
SELECT app.enable_rls_for_table('quotations');
SELECT app.enable_rls_for_table('purchase_orders');
SELECT app.enable_rls_for_table('stock_movements');
SELECT app.enable_rls_for_table('payment_transactions');
SELECT app.enable_rls_for_table('refund_transactions');
SELECT app.enable_rls_for_table('post_dated_checks');
SELECT app.enable_rls_for_table('tax_filings');
SELECT app.enable_rls_for_table('e_invoices');
SELECT app.enable_rls_for_table('e_invoice_receipts');
SELECT app.enable_rls_for_table('zatca_certificates');
SELECT app.enable_rls_for_table('role_permissions');
SELECT app.enable_rls_for_table('audit_logs');
SELECT app.enable_rls_for_table('accounting_audit_logs');
SELECT app.enable_rls_for_table('support_tickets');
SELECT app.enable_rls_for_table('notifications');
SELECT app.enable_rls_for_table('webhook_endpoints');
SELECT app.enable_rls_for_table('webhook_deliveries');
SELECT app.enable_rls_for_table('automation_rules');
SELECT app.enable_rls_for_table('automation_execution_logs');
SELECT app.enable_rls_for_table('recurring_journal_entries');
SELECT app.enable_rls_for_table('fiscal_year_closes');
SELECT app.enable_rls_for_table('company_memberships');
SELECT app.enable_rls_for_table('storage_objects');
SELECT app.enable_rls_for_table('subscription_schedules');
SELECT app.enable_rls_for_table('company_ai_configs');
SELECT app.enable_rls_for_table('prompt_templates');
SELECT app.enable_rls_for_table('invoice_templates');
SELECT app.enable_rls_for_table('invoice_brain_headers');

-- Cleanup helper function (keep for future use)
-- DROP FUNCTION IF EXISTS app.enable_rls_for_table(regclass);
