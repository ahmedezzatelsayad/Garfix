-- ════════════════════════════════════════════════════════════════════════════
-- REVIEW-2 FIX (2026-08-24): company_ai_configs column-name drift reconciliation
-- ════════════════════════════════════════════════════════════════════════════
--
-- PROBLEM: migration 20260803000000 hand-wrote the company_ai_configs table
-- with snake_case column names (company_id, chat_api_key, ...) and company_id
-- as INTEGER, while schema.prisma declares camelCase fields (companyId,
-- chatApiKey, ...) as String. Prisma therefore queries
--   SELECT ... "companyId" ... FROM company_ai_configs
-- which fails with 'column "companyId" does not exist' → every
-- /api/founder-panel/ai-config call returned 500 once the founder-access
-- check was fixed. The table-level drift-scan (scripts/drift-scan.cjs) only
-- compared TABLE names, so this was invisible until now.
--
-- FIX: rename all 37 columns to the exact identifiers schema.prisma expects
-- (quoted camelCase), cast company_id INTEGER → TEXT (the route layer stores
-- company SLUGS in it — see getOrCreateCompanyAIConfig(membership.companySlug)),
-- and rebuild the unique/index constraints on the new names.
--
-- A DB-level FK to companies(id) is deliberately NOT added: the application
-- stores slugs in this column, so a real FK would break every write.
--
-- The table is empty on this database (verified), so no data migration is
-- needed; the renames are still written data-safely (they preserve values).
-- IDEMPOTENT: guarded by column-existence checks.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  -- Helper: rename a column only when the OLD name exists and the NEW name
  -- does not (idempotent re-runs are no-ops).
  PERFORM 1; -- placeholder to keep DO block valid if all IFs are false

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='company_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='companyId') THEN
    ALTER TABLE company_ai_configs RENAME COLUMN company_id TO "companyId";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='chat_api_key')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='chatApiKey') THEN
    ALTER TABLE company_ai_configs RENAME COLUMN chat_api_key TO "chatApiKey";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='chat_model')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='chatModel') THEN
    ALTER TABLE company_ai_configs RENAME COLUMN chat_model TO "chatModel";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='chat_enabled')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='chatEnabled') THEN
    ALTER TABLE company_ai_configs RENAME COLUMN chat_enabled TO "chatEnabled";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='chat_rate_limit_rpm')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='chatRateLimitRpm') THEN
    ALTER TABLE company_ai_configs RENAME COLUMN chat_rate_limit_rpm TO "chatRateLimitRpm";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='chat_tokens_used')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='chatTokensUsed') THEN
    ALTER TABLE company_ai_configs RENAME COLUMN chat_tokens_used TO "chatTokensUsed";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='chat_requests_count')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='chatRequestsCount') THEN
    ALTER TABLE company_ai_configs RENAME COLUMN chat_requests_count TO "chatRequestsCount";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='invoice_api_key')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='invoiceApiKey') THEN
    ALTER TABLE company_ai_configs RENAME COLUMN invoice_api_key TO "invoiceApiKey";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='invoice_model')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='invoiceModel') THEN
    ALTER TABLE company_ai_configs RENAME COLUMN invoice_model TO "invoiceModel";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='invoice_enabled')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='invoiceEnabled') THEN
    ALTER TABLE company_ai_configs RENAME COLUMN invoice_enabled TO "invoiceEnabled";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='invoice_rate_limit_rpm')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='invoiceRateLimitRpm') THEN
    ALTER TABLE company_ai_configs RENAME COLUMN invoice_rate_limit_rpm TO "invoiceRateLimitRpm";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='invoice_tokens_used')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='invoiceTokensUsed') THEN
    ALTER TABLE company_ai_configs RENAME COLUMN invoice_tokens_used TO "invoiceTokensUsed";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='invoice_requests_count')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='invoiceRequestsCount') THEN
    ALTER TABLE company_ai_configs RENAME COLUMN invoice_requests_count TO "invoiceRequestsCount";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='parse_api_key')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='parseApiKey') THEN
    ALTER TABLE company_ai_configs RENAME COLUMN parse_api_key TO "parseApiKey";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='parse_model')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='parseModel') THEN
    ALTER TABLE company_ai_configs RENAME COLUMN parse_model TO "parseModel";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='parse_enabled')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='parseEnabled') THEN
    ALTER TABLE company_ai_configs RENAME COLUMN parse_enabled TO "parseEnabled";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='parse_rate_limit_rpm')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='parseRateLimitRpm') THEN
    ALTER TABLE company_ai_configs RENAME COLUMN parse_rate_limit_rpm TO "parseRateLimitRpm";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='parse_tokens_used')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='parseTokensUsed') THEN
    ALTER TABLE company_ai_configs RENAME COLUMN parse_tokens_used TO "parseTokensUsed";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='parse_requests_count')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='parseRequestsCount') THEN
    ALTER TABLE company_ai_configs RENAME COLUMN parse_requests_count TO "parseRequestsCount";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='memory_api_key')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='memoryApiKey') THEN
    ALTER TABLE company_ai_configs RENAME COLUMN memory_api_key TO "memoryApiKey";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='memory_model')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='memoryModel') THEN
    ALTER TABLE company_ai_configs RENAME COLUMN memory_model TO "memoryModel";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='memory_enabled')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='memoryEnabled') THEN
    ALTER TABLE company_ai_configs RENAME COLUMN memory_enabled TO "memoryEnabled";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='memory_rate_limit_rpm')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='memoryRateLimitRpm') THEN
    ALTER TABLE company_ai_configs RENAME COLUMN memory_rate_limit_rpm TO "memoryRateLimitRpm";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='memory_tokens_used')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='memoryTokensUsed') THEN
    ALTER TABLE company_ai_configs RENAME COLUMN memory_tokens_used TO "memoryTokensUsed";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='memory_requests_count')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='memoryRequestsCount') THEN
    ALTER TABLE company_ai_configs RENAME COLUMN memory_requests_count TO "memoryRequestsCount";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='primary_provider')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='primaryProvider') THEN
    ALTER TABLE company_ai_configs RENAME COLUMN primary_provider TO "primaryProvider";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='fallback_provider')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='fallbackProvider') THEN
    ALTER TABLE company_ai_configs RENAME COLUMN fallback_provider TO "fallbackProvider";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='system_prompt')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='systemPrompt') THEN
    ALTER TABLE company_ai_configs RENAME COLUMN system_prompt TO "systemPrompt";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='memory_retention_days')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='memoryRetentionDays') THEN
    ALTER TABLE company_ai_configs RENAME COLUMN memory_retention_days TO "memoryRetentionDays";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='cost_optimization')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='costOptimization') THEN
    ALTER TABLE company_ai_configs RENAME COLUMN cost_optimization TO "costOptimization";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='notify_high_usage')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='notifyHighUsage') THEN
    ALTER TABLE company_ai_configs RENAME COLUMN notify_high_usage TO "notifyHighUsage";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='usage_notification_threshold')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='usageNotificationThreshold') THEN
    ALTER TABLE company_ai_configs RENAME COLUMN usage_notification_threshold TO "usageNotificationThreshold";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='tokens_used_this_month')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='tokensUsedThisMonth') THEN
    ALTER TABLE company_ai_configs RENAME COLUMN tokens_used_this_month TO "tokensUsedThisMonth";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='requests_this_month')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='requestsThisMonth') THEN
    ALTER TABLE company_ai_configs RENAME COLUMN requests_this_month TO "requestsThisMonth";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='last_reset_at')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='lastResetAt') THEN
    ALTER TABLE company_ai_configs RENAME COLUMN last_reset_at TO "lastResetAt";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='created_at')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='createdAt') THEN
    ALTER TABLE company_ai_configs RENAME COLUMN created_at TO "createdAt";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='updated_at')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='updatedAt') THEN
    ALTER TABLE company_ai_configs RENAME COLUMN updated_at TO "updatedAt";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='enable_chat')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='enableChat') THEN
    ALTER TABLE company_ai_configs RENAME COLUMN enable_chat TO "enableChat";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='enable_smart_parse')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='enableSmartParse') THEN
    ALTER TABLE company_ai_configs RENAME COLUMN enable_smart_parse TO "enableSmartParse";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='enable_invoice_extraction')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='enableInvoiceExtraction') THEN
    ALTER TABLE company_ai_configs RENAME COLUMN enable_invoice_extraction TO "enableInvoiceExtraction";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='enable_memory')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_ai_configs' AND column_name='enableMemory') THEN
    ALTER TABLE company_ai_configs RENAME COLUMN enable_memory TO "enableMemory";
  END IF;
END
$$;

-- company_id was created as INTEGER by the old migration, but the app stores
-- company SLUGS (text) in it — cast the (empty) column to TEXT.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='company_ai_configs' AND column_name='companyId' AND data_type='integer'
  ) THEN
    ALTER TABLE company_ai_configs ALTER COLUMN "companyId" TYPE TEXT;
  END IF;
END
$$;

-- Rebuild indexes/constraints on the renamed column.
DROP INDEX IF EXISTS idx_company_ai_configs_company_id;
DROP INDEX IF EXISTS idx_company_ai_configs_usage;
-- The unique on company_id may exist either as an index or a table constraint
-- (depends on which historical migration created it) — handle both.
DROP INDEX IF EXISTS company_ai_configs_company_id_key;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'company_ai_configs_company_id_key'
      AND conrelid = 'company_ai_configs'::regclass
  ) THEN
    ALTER TABLE company_ai_configs DROP CONSTRAINT company_ai_configs_company_id_key;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS company_ai_configs_companyId_key ON company_ai_configs("companyId");
CREATE INDEX IF NOT EXISTS idx_company_ai_configs_usage ON company_ai_configs("tokensUsedThisMonth", "requestsThisMonth");
