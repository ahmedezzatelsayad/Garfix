-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: Add CompanyAIConfig Table (Multi-Tenant AI Keys)
-- Date: 2026-08-03
-- Description: Per-company isolated API keys for AI features
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS company_ai_configs (
    id                        TEXT PRIMARY KEY DEFAULT (replace(gen_random_uuid()::text, '-', '')),
    company_id                TEXT NOT NULL UNIQUE,
    
    -- Primary AI Provider (JSON string)
    primary_provider          TEXT NOT NULL DEFAULT '{}',
    
    -- Fallback Provider (optional)
    fallback_provider         TEXT,
    
    -- Company-specific system prompt
    system_prompt             TEXT NOT NULL DEFAULT '',
    
    -- Feature toggles
    enable_chat               BOOLEAN NOT NULL DEFAULT TRUE,
    enable_smart_parse        BOOLEAN NOT NULL DEFAULT TRUE,
    enable_invoice_extraction BOOLEAN NOT NULL DEFAULT TRUE,
    enable_memory             BOOLEAN NOT NULL DEFAULT TRUE,
    
    -- Memory configuration
    memory_retention_days     INTEGER NOT NULL DEFAULT 30,
    
    -- Cost optimization level
    cost_optimization         TEXT NOT NULL DEFAULT 'balanced' CHECK (cost_optimization IN ('aggressive', 'balanced', 'quality')),
    
    -- Usage notifications
    notify_high_usage         BOOLEAN NOT NULL DEFAULT TRUE,
    usage_notification_threshold INTEGER NOT NULL DEFAULT 80,
    
    -- Usage tracking (reset monthly)
    tokens_used_this_month    BIGINT NOT NULL DEFAULT 0,
    requests_this_month       BIGINT NOT NULL DEFAULT 0,
    last_reset_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Foreign Key to companies
    CONSTRAINT fk_ai_config_company 
        FOREIGN KEY (company_id) 
        REFERENCES companies(id) 
        ON DELETE CASCADE
);

-- Index for faster lookups by company
CREATE INDEX IF NOT EXISTS idx_company_ai_configs_company_id ON company_ai_configs(company_id);

-- Index for usage queries
CREATE INDEX IF NOT EXISTS idx_company_ai_configs_usage ON company_ai_configs(tokens_used_this_month);

-- Comment
COMMENT ON TABLE company_ai_configs IS 'Per-company AI provider configuration with encrypted API keys';
COMMENT ON COLUMN company_ai_configs.primary_provider IS 'JSON: {provider, apiKey, model, baseUrl, maxTokens, temperature, enabled, rateLimitRpm, monthlyTokenQuota}';
COMMENT ON COLUMN company_ai_configs.tokens_used_this_month IS 'Reset monthly - tracks token usage per tenant';
