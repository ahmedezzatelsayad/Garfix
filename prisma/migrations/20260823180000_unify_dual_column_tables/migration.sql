-- ═══════════════════════════════════════════════════════════════════════════
-- سبرنت توحيد الجداول ذات الأعمدة المزدوجة (schema drift reconciliation)
--
-- المشكلة: جدولان كانا يحملان مجموعتَي أعمدة من حقبتين مختلفتين
-- (قديمة من كود سابق + جديدة من مصالحة سابقة أُضيفت للمخطط فقط)،
-- ففشلت الكتابات صامتة (Unknown argument / NOT NULL) وعولجت بـ raw queries.
-- هذا الـ migration يوحّد كل جدول على مجموعة واحدة ويعيد الكود لـ Prisma نظيف.
--
-- ⚠️ إنتاج: خُذ نسخة احتياطية قبل التطبيق (الحذف نهائي للأعمدة المكررة
--   بعد نقل قيمها).
-- كل الخطوط idempotent-safe (IF [NOT] EXISTS / مشروطة بالقيم).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) stock_movements: الشكل الموحد ─────────────────────────────────────
--    الأعمدة القديمة الناقصة من المخطط: note (nullable) + createdBy (NOT NULL default 'system')
DO $$ BEGIN
  ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "note" TEXT;
  ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "createdBy" TEXT NOT NULL DEFAULT 'system';
END $$;

-- نقل الكميات من العمود القديم qty إلى quantity المعتمد (صفوف النسخة القديمة)
UPDATE "stock_movements"
   SET "quantity" = "qty"
 WHERE "qty" IS NOT NULL AND "qty" <> 0 AND "quantity" = 0;

-- حذف المكررَين: qty (مكرر quantity) وmovementType (مكرر sourceType)
ALTER TABLE "stock_movements" DROP COLUMN IF EXISTS "qty";
ALTER TABLE "stock_movements" DROP COLUMN IF EXISTS "movementType";

-- ── 2) ai_memory_notes: الشكل الموحد ─────────────────────────────────────
--    إضافة الحقول الناقصة من المخطط: entityId (nullable) + createdBy (nullable في القاعدة)
DO $$ BEGIN
  ALTER TABLE "ai_memory_notes" ADD COLUMN IF NOT EXISTS "entityId" TEXT;
  ALTER TABLE "ai_memory_notes" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
END $$;

-- دمج المكررَين: entityType→category وnote→content (حيث الجديد فارغ)
UPDATE "ai_memory_notes"
   SET "category" = "entityType"
 WHERE COALESCE("category", '') = '' AND "entityType" IS NOT NULL;

UPDATE "ai_memory_notes"
   SET "content" = "note"
 WHERE COALESCE("content", '') = '' AND "note" IS NOT NULL;

ALTER TABLE "ai_memory_notes" DROP COLUMN IF EXISTS "entityType";
ALTER TABLE "ai_memory_notes" DROP COLUMN IF EXISTS "note";
