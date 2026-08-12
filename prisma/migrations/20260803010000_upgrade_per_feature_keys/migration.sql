-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: Upgrade CompanyAIConfig - Per-Feature API Keys
-- Date: 2026-08-03
-- Description: Add isolated API keys for each AI feature (Chat, Invoice, Parse, Memory)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Chat Feature columns
ALTER TABLE IF EXISTS company_ai_configs ADD COLUMN IF NOT EXISTS chat_api_key TEXT NOT NULL DEFAULT '';
ALTER TABLE IF EXISTS company_ai_configs ADD COLUMN IF NOT EXISTS chat_model TEXT NOT NULL DEFAULT 'gemini-2.0-flash';
ALTER TABLE IF EXISTS company_ai_configs ADD COLUMN IF NOT EXISTS chat_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS company_ai_configs ADD COLUMN IF NOT EXISTS chat_rate_limit_rpm INTEGER NOT NULL DEFAULT 60;
ALTER TABLE IF EXISTS company_ai_configs ADD COLUMN IF NOT EXISTS chat_tokens_used BIGINT NOT NULL DEFAULT 0;
ALTER TABLE IF EXISTS company_ai_configs ADD COLUMN IF NOT EXISTS chat_requests_count BIGINT NOT NULL DEFAULT 0;

-- Invoice Feature columns
ALTER TABLE IF EXISTS company_ai_configs ADD COLUMN IF NOT EXISTS invoice_api_key TEXT NOT NULL DEFAULT '';
ALTER TABLE IF EXISTS company_ai_configs ADD COLUMN IF NOT EXISTS invoice_model TEXT NOT NULL DEFAULT 'gemini-2.0-flash';
ALTER TABLE IF EXISTS company_ai_configs ADD COLUMN IF NOT EXISTS invoice_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS company_ai_configs ADD COLUMN IF NOT EXISTS invoice_rate_limit_rpm INTEGER NOT NULL DEFAULT 100;
ALTER TABLE IF EXISTS company_ai_configs ADD COLUMN IF NOT EXISTS invoice_tokens_used BIGINT NOT NULL DEFAULT 0;
ALTER TABLE IF EXISTS company_ai_configs ADD COLUMN IF NOT EXISTS invoice_requests_count BIGINT NOT NULL DEFAULT 0;

-- Smart Parse Feature columns
ALTER TABLE IF EXISTS company_ai_configs ADD COLUMN IF NOT EXISTS parse_api_key TEXT NOT NULL DEFAULT '';
ALTER TABLE IF EXISTS company_ai_configs ADD COLUMN IF NOT EXISTS parse_model TEXT NOT NULL DEFAULT 'gemini-2.0-flash';
ALTER TABLE IF EXISTS company_ai_configs ADD COLUMN IF NOT EXISTS parse_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS company_ai_configs ADD COLUMN IF NOT EXISTS parse_rate_limit_rpm INTEGER NOT NULL DEFAULT 60;
ALTER TABLE IF EXISTS company_ai_configs ADD COLUMN IF NOT EXISTS parse_tokens_used BIGINT NOT NULL DEFAULT 0;
ALTER TABLE IF EXISTS company_ai_configs ADD COLUMN IF NOT EXISTS parse_requests_count BIGINT NOT NULL DEFAULT 0;

-- Memory Feature columns
ALTER TABLE IF EXISTS company_ai_configs ADD COLUMN IF NOT EXISTS memory_api_key TEXT NOT NULL DEFAULT '';
ALTER TABLE IF EXISTS company_ai_configs ADD COLUMN IF NOT EXISTS memory_model TEXT NOT NULL DEFAULT 'gemini-2.0-flash';
ALTER TABLE IF EXISTS company_ai_configs ADD COLUMN IF NOT EXISTS memory_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS company_ai_configs ADD COLUMN IF NOT EXISTS memory_rate_limit_rpm INTEGER NOT NULL DEFAULT 30;
ALTER TABLE IF EXISTS company_ai_configs ADD COLUMN IF NOT EXISTS memory_tokens_used BIGINT NOT NULL DEFAULT 0;
ALTER TABLE IF EXISTS company_ai_configs ADD COLUMN IF NOT EXISTS memory_requests_count BIGINT NOT NULL DEFAULT 0;

-- Comment
COMMENT ON TABLE company_ai_configs IS 'Per-company, per-feature AI configuration with isolated API keys';
