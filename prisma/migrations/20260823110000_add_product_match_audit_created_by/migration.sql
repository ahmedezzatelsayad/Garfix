-- P0 FIX: عمود createdBy كان يُكتب من الكود (inventory-sync وbulk-import)
-- وغير موجود في قاعدة البيانات — كل كتابة سجل مطابقة به كانت تفشل صامتة.
-- IF NOT EXISTS: آمنة على القواعد التي فيها العمود بالفعل (baseline قديم).
ALTER TABLE "product_match_audit" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
