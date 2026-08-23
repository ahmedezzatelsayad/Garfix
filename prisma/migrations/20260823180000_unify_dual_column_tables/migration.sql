-- ═══════════════════════════════════════════════════════════════════════════
-- سبرنت توحيد الجداول ذات الأعمدة المزدوجة (schema drift reconciliation)
--
-- ⚠️ HOTFIX (فشل على القواعد التي ليس بها الأعمدة القديمة أصلًا): جمل
--    UPDATE/ALTER الشرطية الآن داخل DO-blocks تفحص وجود العمود قبل
--    استخدامه — كانت تفشل بـ P3006 (failed migration) فتُقفل migrate deploy
--    بالكامل ويُكسر تسجيل الدخول (500) على أي قاعدة نظيفة/مهجّرة.
-- كل الخطوط idempotent-safe وتعمل على أي حالة بداية.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) stock_movements ──────────────────────────────────────────────────
-- (حالة الإنتاج المكتشفة: الجدول نفسه قد لا يكون موجودًا أصلًا — migrations
--  القديمة المُنشئة له لم تصل. أنشئه بالشكل الموحد الكامل ثم طبّق التوحيد.)
CREATE TABLE IF NOT EXISTS "stock_movements" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "reference" TEXT,
    "cost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companySlug" TEXT NOT NULL DEFAULT 'default',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "note" TEXT,
    "createdBy" TEXT NOT NULL DEFAULT 'system',
    "warehouseId" TEXT,
    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "stock_movements_companySlug_idx" ON "stock_movements"("companySlug");
CREATE INDEX IF NOT EXISTS "stock_movements_warehouseId_idx" ON "stock_movements"("warehouseId");

DO $$
BEGIN
  -- أضِف الأعمدة المعتمدة إذا غابت (قواعد أحدث أنشأتها migrations موحدة)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='stock_movements' AND column_name='note') THEN
    ALTER TABLE "stock_movements" ADD COLUMN "note" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='stock_movements' AND column_name='createdBy') THEN
    ALTER TABLE "stock_movements" ADD COLUMN "createdBy" TEXT NOT NULL DEFAULT 'system';
  END IF;

  -- انقل القيم من الأعمدة القديمة إن وُجدت (قواعد ذات تاريخ قديم)
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='stock_movements' AND column_name='qty') THEN
    EXECUTE 'UPDATE "stock_movements" SET "quantity" = "qty" WHERE "qty" IS NOT NULL AND "qty" <> 0 AND "quantity" = 0';
    EXECUTE 'ALTER TABLE "stock_movements" DROP COLUMN "qty"';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='stock_movements' AND column_name='movementType') THEN
    EXECUTE 'ALTER TABLE "stock_movements" DROP COLUMN "movementType"';
  END IF;
END $$;

-- ── 2) ai_memory_notes ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ai_memory_notes" (
    "id" SERIAL NOT NULL,
    "companySlug" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "entityId" TEXT,
    "content" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ai_memory_notes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ai_memory_notes_companySlug_idx" ON "ai_memory_notes"("companySlug");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='ai_memory_notes' AND column_name='entityId') THEN
    ALTER TABLE "ai_memory_notes" ADD COLUMN "entityId" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='ai_memory_notes' AND column_name='createdBy') THEN
    ALTER TABLE "ai_memory_notes" ADD COLUMN "createdBy" TEXT;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='ai_memory_notes' AND column_name='entityType') THEN
    EXECUTE $q$UPDATE ai_memory_notes SET category = entityType WHERE (category IS NULL OR category = '') AND entityType IS NOT NULL$q$;
    EXECUTE 'ALTER TABLE "ai_memory_notes" DROP COLUMN "entityType"';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='ai_memory_notes' AND column_name='note') THEN
    EXECUTE $q$UPDATE ai_memory_notes SET content = note WHERE (content IS NULL OR content = '') AND note IS NOT NULL$q$;
    EXECUTE 'ALTER TABLE "ai_memory_notes" DROP COLUMN "note"';
  END IF;
END $$;
