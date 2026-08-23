-- P3: إضافة حقل لغة الشركة (ar/en) — يُختار عند إنشاء الشركة في معالج الإعداد.
-- الافتراضي "ar" (المنصة عربية أولًا). الـ timezone موجود مسبقًا في المخطط.
-- IF NOT EXISTS: يجعلها آمنة على قواعد أُنشئ فيها العمود يدويًا مسبقًا.
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'ar';
