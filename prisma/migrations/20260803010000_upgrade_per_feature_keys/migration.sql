-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: Upgrade CompanyAIConfig - Per-Feature API Keys
-- Date: 2026-08-03
-- Description: Add isolated API keys for each AI feature (Chat, Invoice, Parse, Memory)
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Check if table exists and add new columns if they don't exist
DO $$ 
BEGIN
    -- Create table if not exists (for fresh installations)
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'company_ai_configs') THEN
        CREATE TABLE company_ai_configs (
            id TEXT PRIMARY KEY DEFAULT (cuid()),
            company_id TEXT NOT NULL UNIQUE,
            
            -- Per-Feature API Keys (Isolated Connections)
            chat_api_key TEXT NOT NULL DEFAULT '',
            chat_model TEXT NOT NULL DEFAULT 'gemini-2.0-flash',
            chat_enabled BOOLEAN NOT NULL DEFAULT FALSE,
            chat_rate_limit_rpm INTEGER NOT NULL DEFAULT 60,
            chat_tokens_used BIGINT NOT NULL DEFAULT 0,
            chat_requests_count BIGINT NOT NULL DEFAULT 0,
            
            invoice_api_key TEXT NOT NULL DEFAULT '',
            invoice_model TEXT NOT NULL DEFAULT 'gemini-2.0-flash',
            invoice_enabled BOOLEAN NOT NULL DEFAULT FALSE,
            invoice_rate_limit_rpm INTEGER NOT NULL DEFAULT 100,
            invoice_tokens_used BIGINT NOT NULL DEFAULT 0,
            invoice_requests_count BIGINT NOT NULL DEFAULT 0,
            
            parse_api_key TEXT NOT NULL DEFAULT '',
            parse_model TEXT NOT NULL DEFAULT 'gemini-2.0-flash',
            parse_enabled BOOLEAN NOT NULL DEFAULT FALSE,
            parse_rate_limit_rpm INTEGER NOT NULL DEFAULT 80,
            parse_tokens_used BIGINT NOT NULL DEFAULT 0,
            parse_requests_count BIGINT NOT NULL DEFAULT 0,
            
            memory_api_key TEXT NOT NULL DEFAULT '',
            memory_model TEXT NOT NULL DEFAULT 'gemini-2.0-flash',
            memory_enabled BOOLEAN NOT NULL DEFAULT FALSE,
            memory_rate_limit_rpm INTEGER NOT NULL DEFAULT 30,
            memory_tokens_used BIGINT NOT NULL DEFAULT 0,
            memory_requests_count BIGINT NOT NULL DEFAULT 0,
            
            -- Shared Configuration
            primary_provider TEXT NOT NULL DEFAULT '{}',
            fallback_provider TEXT,
            system_prompt TEXT NOT NULL DEFAULT '',
            memory_retention_days INTEGER NOT NULL DEFAULT 30,
            cost_optimization TEXT NOT NULL DEFAULT 'balanced' CHECK (cost_optimization IN ('aggressive', 'balanced', 'quality')),
            notify_high_usage BOOLEAN NOT NULL DEFAULT TRUE,
            usage_notification_threshold INTEGER NOT NULL DEFAULT 80,
            
            -- Global Usage Tracking
            tokens_used_this_month BIGINT NOT NULL DEFAULT 0,
            requests_this_month BIGINT NOT NULL DEFAULT 0,
            last_reset_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            
            CONSTRAINT fk_ai_config_company 
                FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
        );
        
        CREATE INDEX idx_company_ai_configs_company_id ON company_ai_configs(company_id);
        
    ELSE
        -- Table exists - add missing columns for per-feature keys
        
        -- Chat Feature Columns
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_ai_configs' AND column_name = 'chat_api_key') THEN
            ALTER TABLE company_ai_configs ADD COLUMN chat_api_key TEXT NOT NULL DEFAULT '';
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_ai_configs' AND column_name = 'chat_model') THEN
            ALTER TABLE company_ai_configs ADD COLUMN chat_model TEXT NOT NULL DEFAULT 'gemini-2.0-flash';
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_ai_configs' AND column_name = 'chat_enabled') THEN
            ALTER TABLE company_ai_configs ADD COLUMN chat_enabled BOOLEAN NOT NULL DEFAULT FALSE;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_ai_configs' AND column_name = 'chat_rate_limit_rpm') THEN
            ALTER TABLE company_ai_configs ADD COLUMN chat_rate_limit_rpm INTEGER NOT NULL DEFAULT 60;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_ai_configs' AND column_name = 'chat_tokens_used') THEN
            ALTER TABLE company_ai_configs ADD COLUMN chat_tokens_used BIGINT NOT NULL DEFAULT 0;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_ai_configs' AND column_name = 'chat_requests_count') THEN
            ALTER TABLE company_ai_configs ADD COLUMN chat_requests_count BIGINT NOT NULL DEFAULT 0;
        END IF;
        
        -- Invoice Feature Columns
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_ai_configs' AND column_name = 'invoice_api_key') THEN
            ALTER TABLE company_ai_configs ADD COLUMN invoice_api_key TEXT NOT NULL DEFAULT '';
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_ai_configs' AND column_name = 'invoice_model') THEN
            ALTER TABLE company_ai_configs ADD COLUMN invoice_model TEXT NOT NULL DEFAULT 'gemini-2.0-flash';
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_ai_configs' AND column_name = 'invoice_enabled') THEN
            ALTER TABLE company_ai_configs ADD COLUMN invoice_enabled BOOLEAN NOT NULL DEFAULT FALSE;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_ai_configs' AND column_name = 'invoice_rate_limit_rpm') THEN
            ALTER TABLE company_ai_configs ADD COLUMN invoice_rate_limit_rpm INTEGER NOT NULL DEFAULT 100;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_ai_configs' AND column_name = 'invoice_tokens_used') THEN
            ALTER TABLE company_ai_configs ADD COLUMN invoice_tokens_used BIGINT NOT NULL DEFAULT 0;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_ai_configs' AND column_name = 'invoice_requests_count') THEN
            ALTER TABLE company_ai_configs ADD COLUMN invoice_requests_count BIGINT NOT NULL DEFAULT 0;
        END IF;
        
        -- Parse Feature Columns
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_ai_configs' AND column_name = 'parse_api_key') THEN
            ALTER TABLE company_ai_configs ADD COLUMN parse_api_key TEXT NOT NULL DEFAULT '';
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_ai_configs' AND column_name = 'parse_model') THEN
            ALTER TABLE company_ai_configs ADD COLUMN parse_model TEXT NOT NULL DEFAULT 'gemini-2.0-flash';
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_ai_configs' AND column_name = 'parse_enabled') THEN
            ALTER TABLE company_ai_configs ADD COLUMN parse_enabled BOOLEAN NOT NULL DEFAULT FALSE;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_ai_configs' AND column_name = 'parse_rate_limit_rpm') THEN
            ALTER TABLE company_ai_configs ADD COLUMN parse_rate_limit_rpm INTEGER NOT NULL DEFAULT 80;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_ai_configs' AND column_name = 'parse_tokens_used') THEN
            ALTER TABLE company_ai_configs ADD COLUMN parse_tokens_used BIGINT NOT NULL DEFAULT 0;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_ai_configs' AND column_name = 'parse_requests_count') THEN
            ALTER TABLE company_ai_configs ADD COLUMN parse_requests_count BIGINT NOT NULL DEFAULT 0;
        END IF;
        
        -- Memory Feature Columns
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_ai_configs' AND column_name = 'memory_api_key') THEN
            ALTER TABLE company_ai_configs ADD COLUMN memory_api_key TEXT NOT NULL DEFAULT '';
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_ai_configs' AND column_name = 'memory_model') THEN
            ALTER TABLE company_ai_configs ADD COLUMN memory_model TEXT NOT NULL DEFAULT 'gemini-2.0-flash';
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_ai_configs' AND column_name = 'memory_enabled') THEN
            ALTER TABLE company_ai_configs ADD COLUMN memory_enabled BOOLEAN NOT NULL DEFAULT FALSE;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_ai_configs' AND column_name = 'memory_rate_limit_rpm') THEN
            ALTER TABLE company_ai_configs ADD COLUMN memory_rate_limit_rpm INTEGER NOT NULL DEFAULT 30;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_ai_configs' AND column_name = 'memory_tokens_used') THEN
            ALTER TABLE company_ai_configs ADD COLUMN memory_tokens_used BIGINT NOTINT NOT DEFAULT 0;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_ai_configs' AND column_name = 'memory_requests_count') THEN
            ALTER TABLE company_ai_configs ADD COLUMN memory_requests_count BIGINT NOT NULL DEFAULT 0;
        END IF;
        
    END IF;
END $$;

COMMIT;

-- Comments
COMMENT ON TABLE company_ai_configs IS 'Per-company, per-feature AI configuration with isolated API keys';
COMMENT ON COLUMN company_ai_configs.chat_api_key IS '💬 Isolated API key for Chat feature';
COMMENT ON COLUMN company_ai_configs.invoice_api_key IS '📄 Isolated API key for Invoice extraction';
COMMENT ON COLUMN company_ai_configs.parse_api_key IS '🔍 Isolated API key for Smart Parse';
COMMENT ON COLUMN company_ai_configs.memory_api_key IS '🧠 Isolated API key for Memory/Context';
