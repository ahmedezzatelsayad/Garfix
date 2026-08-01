-- Multi-tenant Index Hardening (re-applied after upstream P3 rebase)
-- ============================================================================
-- Adds B-tree indexes on tenant-scoping columns (companyId / companySlug)
-- for every multi-tenant model that previously lacked one.
--
-- Why: With 98 models in the schema (after upstream P3 hardening), 62 have
-- `companyId` and 66 have `companySlug` as the FIRST filter applied by
-- tenant-isolation middleware (src/lib/tenantScope.ts) and Postgres RLS
-- policies (migration 20260725110000_enable_postgres_rls). Without an index,
-- every cross-tenant query degrades to a Seq Scan, and RLS policy evaluation
-- on every row becomes O(n) per query.
--
-- What: 83 single-column B-tree indexes. We deliberately did NOT add compound
-- indexes like [companySlug, status, createdAt] yet — those should be added
-- case-by-case based on EXPLAIN ANALYZE of actual hot queries after load
-- testing (G5 in the deployment-gate checklist).
--
-- Write amplification: each INSERT/UPDATE on companyId/companySlug now writes
-- one extra B-tree leaf. For a SaaS accounting workload this is negligible
-- (writes are low-frequency; reads dominate).
--
-- Rollback: DROP INDEX CONCURRENTLY "<index_name>"; for each index below.
-- Use `prisma migrate resolve --rolled-back` to mark this migration as
-- rolled back in the _prisma_migrations table.
-- ============================================================================

-- CreateIndex
CREATE INDEX "accounts_companySlug_idx" ON "accounts"("companySlug");

-- CreateIndex
CREATE INDEX "accounts_companyId_idx" ON "accounts"("companyId");

-- CreateIndex
CREATE INDEX "clients_companySlug_idx" ON "clients"("companySlug");

-- CreateIndex
CREATE INDEX "clients_companyId_idx" ON "clients"("companyId");

-- CreateIndex
CREATE INDEX "Supplier_companySlug_idx" ON "Supplier"("companySlug");

-- CreateIndex
CREATE INDEX "Supplier_companyId_idx" ON "Supplier"("companyId");

-- CreateIndex
CREATE INDEX "product_catalog_companySlug_idx" ON "product_catalog"("companySlug");

-- CreateIndex
CREATE INDEX "product_catalog_companyId_idx" ON "product_catalog"("companyId");

-- CreateIndex
CREATE INDEX "inventory_items_companySlug_idx" ON "inventory_items"("companySlug");

-- CreateIndex
CREATE INDEX "inventory_items_companyId_idx" ON "inventory_items"("companyId");

-- CreateIndex
CREATE INDEX "warehouses_companySlug_idx" ON "warehouses"("companySlug");

-- CreateIndex
CREATE INDEX "warehouses_companyId_idx" ON "warehouses"("companyId");

-- CreateIndex
CREATE INDEX "fiscal_periods_companySlug_idx" ON "fiscal_periods"("companySlug");

-- CreateIndex
CREATE INDEX "fiscal_periods_companyId_idx" ON "fiscal_periods"("companyId");

-- CreateIndex
CREATE INDEX "journal_entries_companySlug_idx" ON "journal_entries"("companySlug");

-- CreateIndex
CREATE INDEX "journal_entries_companyId_idx" ON "journal_entries"("companyId");

-- CreateIndex
CREATE INDEX "payment_vouchers_companySlug_idx" ON "payment_vouchers"("companySlug");

-- CreateIndex
CREATE INDEX "payment_vouchers_companyId_idx" ON "payment_vouchers"("companyId");

-- CreateIndex
CREATE INDEX "opening_balance_entries_companySlug_idx" ON "opening_balance_entries"("companySlug");

-- CreateIndex
CREATE INDEX "opening_balance_entries_companyId_idx" ON "opening_balance_entries"("companyId");

-- CreateIndex
CREATE INDEX "ProfitDistribution_companyId_idx" ON "ProfitDistribution"("companyId");

-- CreateIndex
CREATE INDEX "letters_of_credit_companyId_idx" ON "letters_of_credit"("companyId");

-- CreateIndex
CREATE INDEX "bank_accounts_companySlug_idx" ON "bank_accounts"("companySlug");

-- CreateIndex
CREATE INDEX "bank_accounts_companyId_idx" ON "bank_accounts"("companyId");

-- CreateIndex
CREATE INDEX "bank_transactions_companySlug_idx" ON "bank_transactions"("companySlug");

-- CreateIndex
CREATE INDEX "bank_transactions_companyId_idx" ON "bank_transactions"("companyId");

-- CreateIndex
CREATE INDEX "bank_reconciliations_companySlug_idx" ON "bank_reconciliations"("companySlug");

-- CreateIndex
CREATE INDEX "bank_reconciliations_companyId_idx" ON "bank_reconciliations"("companyId");

-- CreateIndex
CREATE INDEX "fixed_assets_companySlug_idx" ON "fixed_assets"("companySlug");

-- CreateIndex
CREATE INDEX "fixed_assets_companyId_idx" ON "fixed_assets"("companyId");

-- CreateIndex
CREATE INDEX "depreciation_entries_companyId_idx" ON "depreciation_entries"("companyId");

-- CreateIndex
CREATE INDEX "budgets_companySlug_idx" ON "budgets"("companySlug");

-- CreateIndex
CREATE INDEX "budgets_companyId_idx" ON "budgets"("companyId");

-- CreateIndex
CREATE INDEX "cost_centers_companySlug_idx" ON "cost_centers"("companySlug");

-- CreateIndex
CREATE INDEX "cost_centers_companyId_idx" ON "cost_centers"("companyId");

-- CreateIndex
CREATE INDEX "fx_revaluations_companySlug_idx" ON "fx_revaluations"("companySlug");

-- CreateIndex
CREATE INDEX "fx_revaluations_companyId_idx" ON "fx_revaluations"("companyId");

-- CreateIndex
CREATE INDEX "landed_cost_allocations_companySlug_idx" ON "landed_cost_allocations"("companySlug");

-- CreateIndex
CREATE INDEX "landed_cost_allocations_companyId_idx" ON "landed_cost_allocations"("companyId");

-- CreateIndex
CREATE INDEX "hr_employees_companySlug_idx" ON "hr_employees"("companySlug");

-- CreateIndex
CREATE INDEX "hr_employees_companyId_idx" ON "hr_employees"("companyId");

-- CreateIndex
CREATE INDEX "invoices_companyId_idx" ON "invoices"("companyId");

-- CreateIndex
CREATE INDEX "purchase_invoices_companySlug_idx" ON "purchase_invoices"("companySlug");

-- CreateIndex
CREATE INDEX "purchase_invoices_companyId_idx" ON "purchase_invoices"("companyId");

-- CreateIndex
CREATE INDEX "quotations_companySlug_idx" ON "quotations"("companySlug");

-- CreateIndex
CREATE INDEX "quotations_companyId_idx" ON "quotations"("companyId");

-- CreateIndex
CREATE INDEX "purchase_orders_companySlug_idx" ON "purchase_orders"("companySlug");

-- CreateIndex
CREATE INDEX "purchase_orders_companyId_idx" ON "purchase_orders"("companyId");

-- CreateIndex
CREATE INDEX "stock_movements_companySlug_idx" ON "stock_movements"("companySlug");

-- CreateIndex
CREATE INDEX "payment_transactions_companySlug_idx" ON "payment_transactions"("companySlug");

-- CreateIndex
CREATE INDEX "payment_transactions_companyId_idx" ON "payment_transactions"("companyId");

-- CreateIndex
CREATE INDEX "RefundTransaction_companySlug_idx" ON "RefundTransaction"("companySlug");

-- CreateIndex
CREATE INDEX "RefundTransaction_companyId_idx" ON "RefundTransaction"("companyId");

-- CreateIndex
CREATE INDEX "post_dated_checks_companySlug_idx" ON "post_dated_checks"("companySlug");

-- CreateIndex
CREATE INDEX "post_dated_checks_companyId_idx" ON "post_dated_checks"("companyId");

-- CreateIndex
CREATE INDEX "tax_filings_companySlug_idx" ON "tax_filings"("companySlug");

-- CreateIndex
CREATE INDEX "tax_filings_companyId_idx" ON "tax_filings"("companyId");

-- CreateIndex
CREATE INDEX "e_invoices_companySlug_idx" ON "e_invoices"("companySlug");

-- CreateIndex
CREATE INDEX "product_aliases_companySlug_idx" ON "product_aliases"("companySlug");

-- CreateIndex
CREATE INDEX "product_match_audit_companySlug_idx" ON "product_match_audit"("companySlug");

-- CreateIndex
CREATE INDEX "match_overrides_companySlug_idx" ON "match_overrides"("companySlug");

-- CreateIndex
CREATE INDEX "support_tickets_companySlug_idx" ON "support_tickets"("companySlug");

-- CreateIndex
CREATE INDEX "audit_logs_companySlug_idx" ON "audit_logs"("companySlug");

-- CreateIndex
CREATE INDEX "accounting_audit_logs_companySlug_idx" ON "accounting_audit_logs"("companySlug");

-- CreateIndex
CREATE INDEX "TamperEvidenceChain_companySlug_idx" ON "TamperEvidenceChain"("companySlug");

-- CreateIndex
CREATE INDEX "ai_request_logs_companySlug_idx" ON "ai_request_logs"("companySlug");

-- CreateIndex
CREATE INDEX "ai_usage_logs_companySlug_idx" ON "ai_usage_logs"("companySlug");

-- CreateIndex
CREATE INDEX "ai_memory_entries_companySlug_idx" ON "ai_memory_entries"("companySlug");

-- CreateIndex
CREATE INDEX "ai_memory_notes_companySlug_idx" ON "ai_memory_notes"("companySlug");

-- CreateIndex
CREATE INDEX "ai_processing_logs_companySlug_idx" ON "ai_processing_logs"("companySlug");

-- CreateIndex
CREATE INDEX "ai_fabric_cache_entries_companySlug_idx" ON "ai_fabric_cache_entries"("companySlug");

-- CreateIndex
CREATE INDEX "budget_configs_companySlug_idx" ON "budget_configs"("companySlug");

-- CreateIndex
CREATE INDEX "notifications_companySlug_idx" ON "notifications"("companySlug");

-- CreateIndex
CREATE INDEX "rule_candidates_companySlug_idx" ON "rule_candidates"("companySlug");

-- CreateIndex
CREATE INDEX "profit_snapshots_companySlug_idx" ON "profit_snapshots"("companySlug");

-- CreateIndex
CREATE INDEX "compiled_rules_companySlug_idx" ON "compiled_rules"("companySlug");

-- CreateIndex
CREATE INDEX "automation_rules_companySlug_idx" ON "automation_rules"("companySlug");

-- CreateIndex
CREATE INDEX "WebhookEndpoint_companySlug_idx" ON "WebhookEndpoint"("companySlug");

-- CreateIndex
CREATE INDEX "WebhookEndpoint_companyId_idx" ON "WebhookEndpoint"("companyId");

-- CreateIndex
CREATE INDEX "invoice_templates_companySlug_idx" ON "invoice_templates"("companySlug");

-- CreateIndex
CREATE INDEX "chat_history_companySlug_idx" ON "chat_history"("companySlug");

-- CreateIndex
CREATE INDEX "SubscriptionSchedule_companySlug_idx" ON "SubscriptionSchedule"("companySlug");

-- CreateIndex
CREATE INDEX "wps_files_companySlug_idx" ON "wps_files"("companySlug");

