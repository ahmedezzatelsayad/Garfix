CREATE TABLE IF NOT EXISTS "prompt_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "content" TEXT NOT NULL,
    "changeLog" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "prompt_templates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "prompt_templates_name_version_key" ON "prompt_templates"("name", "version");
CREATE INDEX IF NOT EXISTS "prompt_templates_name_active_idx" ON "prompt_templates"("name", "active");
CREATE INDEX IF NOT EXISTS "prompt_templates_active_idx" ON "prompt_templates"("active");

INSERT INTO "prompt_templates" ("id", "name", "version", "content", "changeLog", "active", "createdBy", "createdAt", "updatedAt") VALUES
  ('seed-garfix-persona-v1', 'garfix-persona', 1, 'أنت جارفيكس، مساعد ذكاء اصطناعي متخصص في ERP والفوترة الإلكترونية للشرق الأوسط.', 'Initial seed', true, 'system@seed', NOW(), NOW()),
  ('seed-invoice-extract-v1', 'invoice-extract', 1, 'أنت محرك استخلاص بيانات فواتير. اقرأ النص وارجع JSON فقط.', 'Initial seed', true, 'system@seed', NOW(), NOW()),
  ('seed-smart-parse-v1', 'smart-parse', 1, 'أنت محلل فواتير ذكي. حلل النص وأرجع JSON بالمنتجات المطابقة.', 'Initial seed', true, 'system@seed', NOW(), NOW()),
  ('seed-vision-parse-v1', 'vision-parse', 1, 'أنت محلل فواتير بالصور. استخرج البيانات وأرجع JSON فقط.', 'Initial seed', true, 'system@seed', NOW(), NOW()),
  ('seed-agent-accounting-v1', 'agent-accounting', 1, 'أنت وكيل محاسبة متخصص. اتبع معايير IFRS.', 'Initial seed', true, 'system@seed', NOW(), NOW())
ON CONFLICT ("name", "version") DO NOTHING;
