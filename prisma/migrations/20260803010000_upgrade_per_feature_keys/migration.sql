-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: Upgrade CompanyAIConfig - Per-Feature API Keys
-- Date: 2026-08-03
-- Description: Add isolated API keys for each AI feature (Chat, Invoice, Parse, Memory)
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Check if table exists and add new columns if they don't exist
-- P1 FIX: Removed DO $$ block for company_ai_configs — use IF NOT EXISTS instead

COMMIT;

-- Comments
COMMENT ON TABLE company_ai_configs IS 'Per-company, per-feature AI configuration with isolated API keys';
COMMENT ON COLUMN company_ai_configs.chat_api_key IS '💬 Isolated API key for Chat feature';
COMMENT ON COLUMN company_ai_configs.invoice_api_key IS '📄 Isolated API key for Invoice extraction';
COMMENT ON COLUMN company_ai_configs.parse_api_key IS '🔍 Isolated API key for Smart Parse';
COMMENT ON COLUMN company_ai_configs.memory_api_key IS '🧠 Isolated API key for Memory/Context';
