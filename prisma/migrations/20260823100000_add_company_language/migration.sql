-- P3: إضافة حقل لغة الشركة (ar/en) — يُختار عند إنشاء الشركة في معالج الإعداد.
-- الافتراضي "ar" (المنصة عربية أولًا). الـ timezone موجود مسبقًا في المخطط.
ALTER TABLE "companies" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'ar';
