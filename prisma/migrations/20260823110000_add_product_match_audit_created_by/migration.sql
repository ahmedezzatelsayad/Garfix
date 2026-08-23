-- P0 FIX: عمود createdBy كان يُكتب من الكود (inventory-sync وbulk-import)
-- وغير موجود في قاعدة البيانات — كل كتابات سجل مطابقة المنتجات به كانت تفشل صامتة.
ALTER TABLE "product_match_audit" ADD COLUMN "createdBy" TEXT;
