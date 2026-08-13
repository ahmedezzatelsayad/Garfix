-- ════════════════════════════════════════════════════════════════════════════
-- DB-01 FIX (Audit v2 · Phase 1): Strict RLS policies — remove IS NULL bypass
-- ════════════════════════════════════════════════════════════════════════════
--
-- PROBLEM: The existing RLS policy (migration 20260812000000) includes an
-- `IS NULL` bypass clause:
--
--   USING ("companySlug" = current_setting('app.current_company_slug', true)
--          OR current_setting('app.current_company_slug', true) IS NULL)
--
-- This means: if the session variable is not set (NULL), the policy allows
-- ALL rows. Since withTenantScope / runWithTenantContext was never wired
-- into any API route (DB-01), the session variable was ALWAYS NULL, so
-- RLS matched every row — effectively disabled.
--
-- FIX: Replace the IS NULL bypass with a strict equality check. The only
-- way to see rows is to have the session variable explicitly set to the
-- correct companySlug. Founder/platform-admin bypass is handled via a
-- separate session variable `app.is_platform` = 'on'.
--
-- This migration:
--   1. Creates a new function `app.enable_strict_rls_for_table` that
--      installs policies WITHOUT the IS NULL bypass.
--   2. Drops the old `tenant_isolation` policy on every tenant-scoped table.
--   3. Installs the new strict policy on every tenant-scoped table.
--   4. Installs a `platform_admin_bypass` policy that allows founders/admins
--      to see all rows when `app.is_platform` = 'on' is set.
--
-- This migration is IDEMPOTENT — uses IF EXISTS guards.
-- ════════════════════════════════════════════════════════════════════════════

-- Ensure the `app` schema exists (created by earlier migration, but add
-- IF NOT EXISTS for safety/idempotency).
CREATE SCHEMA IF NOT EXISTS app;

-- ─── Step 1: Create the strict RLS policy function ──────────────────────

-- This function takes a table NAME (text), not a regclass, so we can check
-- existence before applying. Uses format('%I', tbl_name) for safe identifier quoting.
CREATE OR REPLACE FUNCTION app.enable_strict_rls_for_table(tbl_name text) RETURNS void AS $$
BEGIN
  -- Skip if the table doesn't exist (some tables may not be created in all environments)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = tbl_name AND table_schema = 'public'
  ) THEN
    RETURN;
  END IF;

  -- Skip if the table doesn't have a companySlug column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = tbl_name AND column_name = 'companySlug'
  ) THEN
    RETURN;
  END IF;

  -- Drop the old policy that had the IS NULL bypass
  EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tbl_name);
  EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_strict ON %I', tbl_name);
  EXECUTE format('DROP POLICY IF EXISTS platform_admin_bypass ON %I', tbl_name);

  -- Ensure RLS is enabled and forced
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl_name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl_name);

  -- Install strict tenant policy: ONLY rows matching the session variable
  EXECUTE format('
    CREATE POLICY tenant_isolation_strict ON %I
      USING ("companySlug" = current_setting(''app.current_company_slug'', true))
      WITH CHECK ("companySlug" = current_setting(''app.current_company_slug'', true));
  ', tbl_name);

  -- Install platform-admin bypass policy: founder/admin can see all rows
  -- when app.is_platform = 'on' is set (via set_config('app.is_platform', 'on', true))
  EXECUTE format('
    CREATE POLICY platform_admin_bypass ON %I
      USING (current_setting(''app.is_platform'', true) = ''on'')
      WITH CHECK (current_setting(''app.is_platform'', true) = ''on'');
  ', tbl_name);
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$ LANGUAGE plpgsql;

-- ─── Step 2: Apply strict RLS to all tenant-scoped tables ───────────────
-- These are the same 65 tables that had RLS enabled in migration 20260812000000.

SELECT app.enable_strict_rls_for_table('accounts');
SELECT app.enable_strict_rls_for_table('clients');
SELECT app.enable_strict_rls_for_table('suppliers');
SELECT app.enable_strict_rls_for_table('product_catalogs');
SELECT app.enable_strict_rls_for_table('inventory_items');
SELECT app.enable_strict_rls_for_table('warehouses');
SELECT app.enable_strict_rls_for_table('fiscal_periods');
SELECT app.enable_strict_rls_for_table('journal_entries');
SELECT app.enable_strict_rls_for_table('journal_entry_lines');
SELECT app.enable_strict_rls_for_table('payment_vouchers');
SELECT app.enable_strict_rls_for_table('installment_schedules');
SELECT app.enable_strict_rls_for_table('opening_balance_entries');
SELECT app.enable_strict_rls_for_table('profit_distributions');
SELECT app.enable_strict_rls_for_table('profit_distribution_entries');
SELECT app.enable_strict_rls_for_table('letters_of_credit');
SELECT app.enable_strict_rls_for_table('letter_of_credit_documents');
SELECT app.enable_strict_rls_for_table('bank_accounts');
SELECT app.enable_strict_rls_for_table('bank_transactions');
SELECT app.enable_strict_rls_for_table('bank_reconciliations');
SELECT app.enable_strict_rls_for_table('fixed_assets');
SELECT app.enable_strict_rls_for_table('depreciation_entries');
SELECT app.enable_strict_rls_for_table('budgets');
SELECT app.enable_strict_rls_for_table('budget_lines');
SELECT app.enable_strict_rls_for_table('cost_centers');
SELECT app.enable_strict_rls_for_table('fx_revaluations');
SELECT app.enable_strict_rls_for_table('inter_company_transactions');
SELECT app.enable_strict_rls_for_table('landed_cost_allocations');
SELECT app.enable_strict_rls_for_table('landed_cost_lines');
SELECT app.enable_strict_rls_for_table('employees');
SELECT app.enable_strict_rls_for_table('payroll_runs');
SELECT app.enable_strict_rls_for_table('payroll_lines');
SELECT app.enable_strict_rls_for_table('leave_requests');
SELECT app.enable_strict_rls_for_table('attendance_records');
SELECT app.enable_strict_rls_for_table('wps_files');
SELECT app.enable_strict_rls_for_table('wps_lines');
SELECT app.enable_strict_rls_for_table('invoices');
SELECT app.enable_strict_rls_for_table('invoice_items');
SELECT app.enable_strict_rls_for_table('payments');
SELECT app.enable_strict_rls_for_table('payment_transactions');
SELECT app.enable_strict_rls_for_table('purchase_invoices');
SELECT app.enable_strict_rls_for_table('purchase_invoice_lines');
SELECT app.enable_strict_rls_for_table('quotations');
SELECT app.enable_strict_rls_for_table('quotation_lines');
SELECT app.enable_strict_rls_for_table('deliveries');
SELECT app.enable_strict_rls_for_table('delivery_lines');
SELECT app.enable_strict_rls_for_table('stock_movements');
SELECT app.enable_strict_rls_for_table('stock_adjustments');
SELECT app.enable_strict_rls_for_table('recurring_journal_entries');
SELECT app.enable_strict_rls_for_table('fiscal_year_closes');
SELECT app.enable_strict_rls_for_table('tax_filings');
SELECT app.enable_strict_rls_for_table('audit_logs');
SELECT app.enable_strict_rls_for_table('webhook_endpoints');
SELECT app.enable_strict_rls_for_table('webhook_events');
SELECT app.enable_strict_rls_for_table('webhook_deliveries');
SELECT app.enable_strict_rls_for_table('storage_objects');
SELECT app.enable_strict_rls_for_table('company_ai_config');
SELECT app.enable_strict_rls_for_table('company_memberships');
SELECT app.enable_strict_rls_for_table('ai_request_logs');
SELECT app.enable_strict_rls_for_table('automation_rules');
SELECT app.enable_strict_rls_for_table('automation_runs');
SELECT app.enable_strict_rls_for_table('e_invoice_receipts');
SELECT app.enable_strict_rls_for_table('prompt_templates');
SELECT app.enable_strict_rls_for_table('admin_audit_logs');
SELECT app.enable_strict_rls_for_table('session_registry');
SELECT app.enable_strict_rls_for_table('notifications');

-- ─── Step 3: Update the tenant-middleware to set app.is_platform for founders ──
-- (This is done in the application code, not in SQL — see src/lib/api/tenant-middleware.ts)

-- ─── Step 4: Verification (run manually to confirm) ─────────────────────
-- SELECT tablename, policyname FROM pg_policies WHERE policyname LIKE 'tenant%' OR policyname = 'platform_admin_bypass' ORDER BY tablename, policyname;
